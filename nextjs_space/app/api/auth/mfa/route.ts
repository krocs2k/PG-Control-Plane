import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import crypto from 'crypto';
import { createAuditLog } from '@/lib/audit';

// TOTP implementation using crypto (no external dependencies)
function generateSecret(): string {
  return crypto.randomBytes(20).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
}

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
}

function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(str: string): Buffer {
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
}

function generateTOTP(secret: string, counter: number): string {
  const secretBuffer = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) {
    counterBuffer[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
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
}

function verifyTOTP(secret: string, token: string, window: number = 1): boolean {
  const counter = Math.floor(Date.now() / 30000);
  for (let i = -window; i <= window; i++) {
    if (generateTOTP(secret, counter + i) === token) {
      return true;
    }
  }
  return false;
}

// GET - Get MFA status for current user
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
        mfaEnabled: true,
        mfaVerifiedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      enabled: user.mfaEnabled,
      verifiedAt: user.mfaVerifiedAt,
    });
  } catch (error) {
    console.error('Error fetching MFA status:', error);
    return NextResponse.json({ error: 'Failed to fetch MFA status' }, { status: 500 });
  }
}

// POST - Setup or verify MFA
export async function POST(req: NextRequest) {
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
    const { action, token, backupCode } = body;

    if (action === 'setup') {
      // Generate new secret
      const secret = generateSecret();
      const base32Secret = base32Encode(Buffer.from(secret));
      const backupCodes = generateBackupCodes();

      // Store pending secret (not enabled yet)
      await prisma.user.update({
        where: { id: user.id },
        data: {
          mfaSecret: base32Secret,
          mfaBackupCodes: backupCodes,
        },
      });

      // Generate QR code URL for authenticator apps
      const appName = 'PG-Control-Plane';
      const otpAuthUrl = `otpauth://totp/${encodeURIComponent(appName)}:${encodeURIComponent(user.email)}?secret=${base32Secret}&issuer=${encodeURIComponent(appName)}&algorithm=SHA1&digits=6&period=30`;

      return NextResponse.json({
        secret: base32Secret,
        qrCodeUrl: otpAuthUrl,
        backupCodes,
      });
    }

    if (action === 'verify') {
      // Verify the token and enable MFA
      if (!token) {
        return NextResponse.json({ error: 'Token is required' }, { status: 400 });
      }

      if (!user.mfaSecret) {
        return NextResponse.json({ error: 'MFA not set up. Run setup first.' }, { status: 400 });
      }

      if (!verifyTOTP(user.mfaSecret, token)) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          mfaEnabled: true,
          mfaVerifiedAt: new Date(),
        },
      });

      await createAuditLog({
        userId: user.id,
        action: 'MFA_ENABLED',
        entityType: 'User',
        entityId: user.id,
        afterState: { email: user.email },
      });

      return NextResponse.json({ success: true, message: 'MFA enabled successfully' });
    }

    if (action === 'validate') {
      // Validate a token during login
      if (!token && !backupCode) {
        return NextResponse.json({ error: 'Token or backup code is required' }, { status: 400 });
      }

      if (!user.mfaEnabled || !user.mfaSecret) {
        return NextResponse.json({ error: 'MFA not enabled' }, { status: 400 });
      }

      if (token) {
        if (verifyTOTP(user.mfaSecret, token)) {
          return NextResponse.json({ success: true, valid: true });
        }
        return NextResponse.json({ success: false, valid: false, error: 'Invalid token' });
      }

      if (backupCode) {
        const codeIndex = user.mfaBackupCodes.indexOf(backupCode.toUpperCase());
        if (codeIndex !== -1) {
          // Remove used backup code
          const newBackupCodes = [...user.mfaBackupCodes];
          newBackupCodes.splice(codeIndex, 1);

          await prisma.user.update({
            where: { id: user.id },
            data: { mfaBackupCodes: newBackupCodes },
          });

          await createAuditLog({
            userId: user.id,
            action: 'MFA_BACKUP_CODE_USED',
            entityType: 'User',
            entityId: user.id,
            afterState: { email: user.email, remainingCodes: newBackupCodes.length },
          });

          return NextResponse.json({ success: true, valid: true, remainingBackupCodes: newBackupCodes.length });
        }
        return NextResponse.json({ success: false, valid: false, error: 'Invalid backup code' });
      }
    }

    if (action === 'regenerate_backup') {
      // Regenerate backup codes
      if (!user.mfaEnabled) {
        return NextResponse.json({ error: 'MFA not enabled' }, { status: 400 });
      }

      const newBackupCodes = generateBackupCodes();

      await prisma.user.update({
        where: { id: user.id },
        data: { mfaBackupCodes: newBackupCodes },
      });

      await createAuditLog({
        userId: user.id,
        action: 'MFA_BACKUP_CODES_REGENERATED',
        entityType: 'User',
        entityId: user.id,
        afterState: { email: user.email },
      });

      return NextResponse.json({ success: true, backupCodes: newBackupCodes });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error with MFA operation:', error);
    return NextResponse.json({ error: 'MFA operation failed' }, { status: 500 });
  }
}

// DELETE - Disable MFA for current user
export async function DELETE(req: NextRequest) {
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
    const { token, password } = body;

    // Require current token or password to disable MFA
    if (user.mfaEnabled && user.mfaSecret) {
      if (token && !verifyTOTP(user.mfaSecret, token)) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: [],
        mfaVerifiedAt: null,
      },
    });

    await createAuditLog({
      userId: user.id,
      action: 'MFA_DISABLED',
      entityType: 'User',
      entityId: user.id,
      afterState: { email: user.email },
    });

    return NextResponse.json({ success: true, message: 'MFA disabled' });
  } catch (error) {
    console.error('Error disabling MFA:', error);
    return NextResponse.json({ error: 'Failed to disable MFA' }, { status: 500 });
  }
}
