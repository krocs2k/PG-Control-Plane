import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { createAuditLog } from '@/lib/audit';

// GET - Fetch current user's profile
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email as string },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        mfaEnabled: true,
        mfaVerifiedAt: true,
        mfaEnforcedAt: true,
        mfaBackupCodes: true,
        lastLoginAt: true,
        lastLoginIp: true,
        passwordChangedAt: true,
        createdAt: true,
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get MFA settings to determine if MFA is required
    const mfaSettings = await prisma.mFASettings.findFirst();
    const mfaRequired = mfaSettings?.mfaRequiredForAll || false;
    const gracePeriodDays = mfaSettings?.mfaGracePeriodDays || 3;
    
    // Calculate MFA deadline if enforcement is active
    let mfaDeadline: Date | null = null;
    let mfaGracePeriodExpired = false;
    
    if (mfaRequired && user.mfaEnforcedAt && !user.mfaEnabled) {
      mfaDeadline = new Date(user.mfaEnforcedAt);
      mfaDeadline.setDate(mfaDeadline.getDate() + gracePeriodDays);
      mfaGracePeriodExpired = new Date() > mfaDeadline;
    }

    return NextResponse.json({
      user: {
        ...user,
        backupCodesCount: user.mfaBackupCodes?.length || 0,
        mfaBackupCodes: undefined, // Don't expose backup codes in profile
      },
      mfaRequired,
      mfaDeadline,
      mfaGracePeriodExpired,
      gracePeriodDays,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

// PATCH - Update current user's profile
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email as string },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await req.json();
    const { action, name, currentPassword, newPassword } = body;

    // Update name
    if (action === 'update_name' && name !== undefined) {
      await prisma.user.update({
        where: { id: user.id },
        data: { name },
      });

      await createAuditLog({
        userId: user.id,
        action: 'PROFILE_NAME_UPDATED',
        entityType: 'User',
        entityId: user.id,
        afterState: { name },
      });

      return NextResponse.json({ success: true, message: 'Name updated successfully' });
    }

    // Change password
    if (action === 'change_password') {
      if (!currentPassword || !newPassword) {
        return NextResponse.json({ error: 'Current and new passwords are required' }, { status: 400 });
      }

      if (newPassword.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 12);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
        },
      });

      await createAuditLog({
        userId: user.id,
        action: 'PASSWORD_CHANGED',
        entityType: 'User',
        entityId: user.id,
        afterState: { email: user.email },
      });

      return NextResponse.json({ success: true, message: 'Password changed successfully' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
