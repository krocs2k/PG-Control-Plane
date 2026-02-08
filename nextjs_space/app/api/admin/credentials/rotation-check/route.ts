import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

// Generate a secure 32-character password
function generateSecurePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+';
  let password = '';
  const randomBytes = crypto.randomBytes(32);
  for (let i = 0; i < 32; i++) {
    password += chars[randomBytes[i] % chars.length];
  }
  return password;
}

/**
 * Rotation Check API
 * This endpoint can be called by a cron job or scheduled task to check
 * if password rotation is needed (every 45 days by default)
 */
export async function GET(request: NextRequest) {
  // Optional: Add API key authentication for external cron jobs
  const authHeader = request.headers.get('x-rotation-api-key');
  const expectedKey = process.env.ROTATION_API_KEY;
  
  if (expectedKey && authHeader !== expectedKey) {
    // Allow internal calls without API key
    const referer = request.headers.get('referer');
    if (!referer?.includes(request.nextUrl.host)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const credential = await prisma.superuserCredential.findFirst();
    
    if (!credential) {
      return NextResponse.json({
        rotationNeeded: false,
        reason: 'No credentials configured',
        initialized: false
      });
    }

    const now = new Date();
    const lastRotated = new Date(credential.lastRotatedAt);
    const daysSinceRotation = Math.floor((now.getTime() - lastRotated.getTime()) / (1000 * 60 * 60 * 24));
    const rotationNeeded = daysSinceRotation >= credential.rotationIntervalDays;

    return NextResponse.json({
      rotationNeeded,
      daysSinceRotation,
      rotationIntervalDays: credential.rotationIntervalDays,
      lastRotatedAt: credential.lastRotatedAt,
      nextRotationAt: credential.nextRotationAt,
      status: credential.status,
      initialized: true
    });
  } catch (error) {
    console.error('Error checking rotation:', error);
    return NextResponse.json({ error: 'Failed to check rotation status' }, { status: 500 });
  }
}

/**
 * POST - Automatically rotate if needed
 * Can be called by a cron job to auto-rotate when due
 */
export async function POST(request: NextRequest) {
  // Optional: Add API key authentication for external cron jobs
  const authHeader = request.headers.get('x-rotation-api-key');
  const expectedKey = process.env.ROTATION_API_KEY;
  
  if (expectedKey && authHeader !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const forceRotation = body.force === true;

    const credential = await prisma.superuserCredential.findFirst();
    
    if (!credential) {
      return NextResponse.json({
        rotated: false,
        reason: 'No credentials configured'
      });
    }

    const now = new Date();
    const lastRotated = new Date(credential.lastRotatedAt);
    const daysSinceRotation = Math.floor((now.getTime() - lastRotated.getTime()) / (1000 * 60 * 60 * 24));
    const rotationNeeded = daysSinceRotation >= credential.rotationIntervalDays;

    if (!rotationNeeded && !forceRotation) {
      return NextResponse.json({
        rotated: false,
        reason: `Rotation not due yet (${daysSinceRotation}/${credential.rotationIntervalDays} days)`,
        nextRotationAt: credential.nextRotationAt
      });
    }

    // Generate new password
    const newPassword = generateSecurePassword();
    
    // Update history - keep last 6 passwords
    const updatedHistory = [credential.currentPassword, ...credential.passwordHistory].slice(0, 6);
    
    const nextRotation = new Date();
    nextRotation.setDate(nextRotation.getDate() + 45);

    // Update credentials
    await prisma.superuserCredential.update({
      where: { id: credential.id },
      data: {
        currentPassword: newPassword,
        passwordHistory: updatedHistory,
        lastRotatedAt: now,
        nextRotationAt: nextRotation,
        status: 'SYNCING'
      }
    });

    // Reset all propagation statuses to pending
    await prisma.credentialPropagation.updateMany({
      where: { credentialId: credential.id },
      data: { status: 'PENDING', lastAttemptAt: null }
    });

    // Log the rotation
    await prisma.auditLog.create({
      data: {
        entityType: 'SuperuserCredential',
        entityId: credential.id,
        action: 'AUTO_ROTATE',
        beforeState: JSON.stringify({ daysSinceRotation, forced: forceRotation }),
        afterState: JSON.stringify({ status: 'SYNCING', historyCount: updatedHistory.length })
      }
    });

    return NextResponse.json({
      rotated: true,
      reason: forceRotation ? 'Forced rotation' : 'Scheduled rotation',
      daysSinceLastRotation: daysSinceRotation,
      nextRotationAt: nextRotation,
      historyCount: updatedHistory.length
    });
  } catch (error) {
    console.error('Error during auto-rotation:', error);
    return NextResponse.json({ error: 'Failed to rotate credentials' }, { status: 500 });
  }
}
