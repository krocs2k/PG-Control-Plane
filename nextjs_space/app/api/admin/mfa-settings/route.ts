import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

// Helper to check admin permission
async function checkAdminPermission() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: 'Unauthorized', status: 401 };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email as string },
    select: { id: true, name: true, email: true, role: true, mfaEnabled: true },
  });

  if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
    return { error: 'Admin access required', status: 403 };
  }

  return { user };
}

// Get or create MFA settings
async function getOrCreateMFASettings() {
  let settings = await prisma.mFASettings.findFirst();
  if (!settings) {
    settings = await prisma.mFASettings.create({
      data: {
        mfaRequiredForAll: false,
        mfaRequiredForDBAdmin: true, // Default to requiring MFA for DB Admin
        mfaGracePeriodDays: 3,
      },
    });
  }
  return settings;
}

// GET - Fetch MFA settings and security alerts
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email as string },
      select: { id: true, role: true, mfaEnabled: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const settings = await getOrCreateMFASettings();

    // Get security alerts (admins without MFA, DB Admin MFA disabled)
    const securityAlerts = await prisma.mFASecurityAlert.findMany({
      where: { resolved: false },
      orderBy: { createdAt: 'desc' },
    });

    // Get admins without MFA enabled
    const adminsWithoutMFA = await prisma.user.findMany({
      where: {
        role: { in: ['OWNER', 'ADMIN'] },
        mfaEnabled: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    // For non-admins, return limited info
    if (!['OWNER', 'ADMIN'].includes(user.role)) {
      return NextResponse.json({
        settings: {
          mfaRequiredForAll: settings.mfaRequiredForAll,
          mfaGracePeriodDays: settings.mfaGracePeriodDays,
          mfaEnforcementStartedAt: settings.mfaEnforcementStartedAt,
        },
        userMfaEnabled: user.mfaEnabled,
      });
    }

    return NextResponse.json({
      settings,
      securityAlerts,
      adminsWithoutMFA,
      userMfaEnabled: user.mfaEnabled,
    });
  } catch (error) {
    console.error('Error fetching MFA settings:', error);
    return NextResponse.json({ error: 'Failed to fetch MFA settings' }, { status: 500 });
  }
}

// PATCH - Update MFA settings
export async function PATCH(req: NextRequest) {
  try {
    const authCheck = await checkAdminPermission();
    if ('error' in authCheck) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }
    const { user } = authCheck;

    const body = await req.json();
    const { action, mfaRequiredForAll, mfaRequiredForDBAdmin, mfaToken } = body;

    const settings = await getOrCreateMFASettings();
    const beforeState = { ...settings };

    // Verify MFA for sensitive operations if user has MFA enabled
    if (action === 'disable_db_admin_mfa' && settings.mfaRequiredForDBAdmin && user.mfaEnabled) {
      if (!mfaToken) {
        return NextResponse.json({ 
          error: 'MFA verification required', 
          mfaRequired: true 
        }, { status: 400 });
      }
      
      // Verify MFA token
      const userWithSecret = await prisma.user.findUnique({
        where: { id: user.id },
        select: { mfaSecret: true },
      });
      
      if (userWithSecret?.mfaSecret) {
        const verifyRes = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/auth/mfa`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'validate', token: mfaToken }),
        });
        
        if (!verifyRes.ok) {
          return NextResponse.json({ error: 'Invalid MFA token' }, { status: 400 });
        }
      }
    }

    // Handle different actions
    if (action === 'toggle_mfa_for_all') {
      const newValue = mfaRequiredForAll !== undefined ? mfaRequiredForAll : !settings.mfaRequiredForAll;
      
      await prisma.mFASettings.update({
        where: { id: settings.id },
        data: {
          mfaRequiredForAll: newValue,
          mfaEnforcementStartedAt: newValue ? new Date() : null,
        },
      });

      // If enabling MFA for all, set enforcement date for users without MFA
      if (newValue) {
        await prisma.user.updateMany({
          where: { mfaEnabled: false, mfaEnforcedAt: null },
          data: { mfaEnforcedAt: new Date() },
        });
      } else {
        // Clear enforcement dates if disabling
        await prisma.user.updateMany({
          where: { mfaEnforcedAt: { not: null } },
          data: { mfaEnforcedAt: null },
        });
      }

      await createAuditLog({
        userId: user.id,
        action: newValue ? 'MFA_REQUIRED_FOR_ALL_ENABLED' : 'MFA_REQUIRED_FOR_ALL_DISABLED',
        entityType: 'MFASettings',
        entityId: settings.id,
        beforeState,
        afterState: { mfaRequiredForAll: newValue },
      });

      return NextResponse.json({ success: true, mfaRequiredForAll: newValue });
    }

    if (action === 'toggle_db_admin_mfa' || action === 'disable_db_admin_mfa') {
      const newValue = mfaRequiredForDBAdmin !== undefined ? mfaRequiredForDBAdmin : !settings.mfaRequiredForDBAdmin;

      const updateData: Record<string, unknown> = {
        mfaRequiredForDBAdmin: newValue,
      };

      // Track who disabled DB Admin MFA
      if (!newValue) {
        updateData.dbAdminMfaDisabledBy = user.id;
        updateData.dbAdminMfaDisabledAt = new Date();

        // Create a security alert
        await prisma.mFASecurityAlert.create({
          data: {
            alertType: 'DB_ADMIN_MFA_DISABLED',
            message: `DB Admin MFA authentication was disabled by ${user.name || user.email}`,
            adminId: user.id,
            adminName: user.name || undefined,
            adminEmail: user.email,
          },
        });
      } else {
        updateData.dbAdminMfaDisabledBy = null;
        updateData.dbAdminMfaDisabledAt = null;

        // Resolve DB Admin MFA disabled alerts
        await prisma.mFASecurityAlert.updateMany({
          where: { alertType: 'DB_ADMIN_MFA_DISABLED', resolved: false },
          data: { resolved: true, resolvedAt: new Date(), resolvedBy: user.id },
        });
      }

      await prisma.mFASettings.update({
        where: { id: settings.id },
        data: updateData,
      });

      await createAuditLog({
        userId: user.id,
        action: newValue ? 'DB_ADMIN_MFA_ENABLED' : 'DB_ADMIN_MFA_DISABLED',
        entityType: 'MFASettings',
        entityId: settings.id,
        beforeState,
        afterState: { mfaRequiredForDBAdmin: newValue },
      });

      return NextResponse.json({ success: true, mfaRequiredForDBAdmin: newValue });
    }

    // General update
    const updatedSettings = await prisma.mFASettings.update({
      where: { id: settings.id },
      data: {
        mfaRequiredForAll: mfaRequiredForAll ?? settings.mfaRequiredForAll,
        mfaRequiredForDBAdmin: mfaRequiredForDBAdmin ?? settings.mfaRequiredForDBAdmin,
      },
    });

    return NextResponse.json({ success: true, settings: updatedSettings });
  } catch (error) {
    console.error('Error updating MFA settings:', error);
    return NextResponse.json({ error: 'Failed to update MFA settings' }, { status: 500 });
  }
}

// POST - Check/verify MFA for DB Admin access
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email as string },
      select: { id: true, role: true, mfaEnabled: true, mfaSecret: true },
    });

    if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { action, token } = body;

    if (action === 'check_db_admin_access') {
      const settings = await getOrCreateMFASettings();

      // If MFA not required for DB Admin, allow access
      if (!settings.mfaRequiredForDBAdmin) {
        return NextResponse.json({ allowed: true, mfaRequired: false });
      }

      // If user doesn't have MFA enabled, they need to set it up first
      if (!user.mfaEnabled) {
        return NextResponse.json({ 
          allowed: false, 
          mfaRequired: true,
          mfaNotSetup: true,
          message: 'You need to set up MFA before accessing DB Admin'
        });
      }

      // MFA verification needed
      return NextResponse.json({ 
        allowed: false, 
        mfaRequired: true,
        message: 'MFA authentication is required to access DB Admin'
      });
    }

    if (action === 'verify_db_admin_mfa') {
      if (!token) {
        return NextResponse.json({ error: 'Token is required' }, { status: 400 });
      }

      if (!user.mfaEnabled || !user.mfaSecret) {
        return NextResponse.json({ error: 'MFA not enabled' }, { status: 400 });
      }

      // Verify the token using our MFA verification logic
      const verifyTOTP = (secret: string, inputToken: string, window: number = 1): boolean => {
        const base32Decode = (str: string): Buffer => {
          const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
          const cleanStr = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
          let bits = 0;
          let value = 0;
          const output: number[] = [];

          for (let i = 0; i < cleanStr.length; i++) {
            value = (value << 5) | alphabet.indexOf(cleanStr[i]);
            bits += 5;
            if (bits >= 8) {
              output.push((value >>> (bits - 8)) & 255);
              bits -= 8;
            }
          }

          return Buffer.from(output);
        };

        const generateTOTP = (secretStr: string, counter: number): string => {
          const crypto = require('crypto');
          const secretBuffer = base32Decode(secretStr);
          const counterBuffer = Buffer.alloc(8);
          let c = counter;
          for (let i = 7; i >= 0; i--) {
            counterBuffer[i] = c & 0xff;
            c = Math.floor(c / 256);
          }

          const hmac = crypto.createHmac('sha1', secretBuffer);
          hmac.update(counterBuffer);
          const hmacResult = hmac.digest();

          const offset = hmacResult[hmacResult.length - 1] & 0xf;
          const binary =
            ((hmacResult[offset] & 0x7f) << 24) |
            ((hmacResult[offset + 1] & 0xff) << 16) |
            ((hmacResult[offset + 2] & 0xff) << 8) |
            (hmacResult[offset + 3] & 0xff);

          const otp = binary % 1000000;
          return otp.toString().padStart(6, '0');
        };

        const counter = Math.floor(Date.now() / 30000);
        for (let i = -window; i <= window; i++) {
          if (generateTOTP(secret, counter + i) === inputToken) {
            return true;
          }
        }
        return false;
      };

      if (!verifyTOTP(user.mfaSecret, token)) {
        return NextResponse.json({ error: 'Invalid MFA token', verified: false }, { status: 400 });
      }

      await createAuditLog({
        userId: user.id,
        action: 'DB_ADMIN_MFA_VERIFIED',
        entityType: 'MFASettings',
        entityId: user.id,
        afterState: { email: session.user.email },
      });

      return NextResponse.json({ verified: true, allowed: true });
    }

    // Resolve security alert
    if (action === 'resolve_alert') {
      const { alertId } = body;
      await prisma.mFASecurityAlert.update({
        where: { id: alertId },
        data: { resolved: true, resolvedAt: new Date(), resolvedBy: user.id },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error with MFA settings operation:', error);
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 });
  }
}
