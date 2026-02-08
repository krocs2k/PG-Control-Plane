import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { createAuditLog } from '@/lib/audit';
import { UserStatus } from '@prisma/client';

// GET - List all users (Admin only)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email as string },
    });

    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('id');

    if (userId) {
      // Get single user with details
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          mfaEnabled: true,
          mfaVerifiedAt: true,
          failedAttempts: true,
          lockedUntil: true,
          lastLoginAt: true,
          lastLoginIp: true,
          passwordChangedAt: true,
          createdAt: true,
          updatedAt: true,
          organization: { select: { id: true, name: true } },
          sessions: {
            select: {
              id: true,
              ipAddress: true,
              userAgent: true,
              lastActiveAt: true,
              expiresAt: true,
            },
            orderBy: { lastActiveAt: 'desc' },
            take: 10,
          },
          loginHistory: {
            select: {
              id: true,
              ipAddress: true,
              userAgent: true,
              success: true,
              reason: true,
              mfaUsed: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
        },
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      return NextResponse.json(user);
    }

    // List all users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        organization: { select: { id: true, name: true } },
        _count: {
          select: { sessions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

// POST - Create new user (Admin only)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email as string },
    });

    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { email, name, password, role, orgId, status } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = await prisma.user.create({
      data: {
        email,
        name: name || email.split('@')[0],
        passwordHash,
        role: role || 'VIEWER',
        status: status || 'ACTIVE',
        orgId: orgId || currentUser.orgId,
        passwordChangedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    await createAuditLog({
      userId: currentUser.id,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: newUser.id,
      afterState: { email: newUser.email, role: newUser.role },
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

// PATCH - Update user (Admin only)
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email as string },
    });

    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { id, action, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Handle specific actions
    if (action === 'unlock') {
      await prisma.user.update({
        where: { id },
        data: {
          status: UserStatus.ACTIVE,
          failedAttempts: 0,
          lockedUntil: null,
        },
      });

      await createAuditLog({
        userId: currentUser.id,
        action: 'USER_UNLOCKED',
        entityType: 'User',
        entityId: id,
        afterState: { email: targetUser.email },
      });

      return NextResponse.json({ success: true, message: 'User unlocked' });
    }

    if (action === 'disable') {
      await prisma.user.update({
        where: { id },
        data: { status: UserStatus.DISABLED },
      });

      // Revoke all sessions
      await prisma.userSession.deleteMany({ where: { userId: id } });

      await createAuditLog({
        userId: currentUser.id,
        action: 'USER_DISABLED',
        entityType: 'User',
        entityId: id,
        afterState: { email: targetUser.email },
      });

      return NextResponse.json({ success: true, message: 'User disabled' });
    }

    if (action === 'enable') {
      await prisma.user.update({
        where: { id },
        data: { status: UserStatus.ACTIVE },
      });

      await createAuditLog({
        userId: currentUser.id,
        action: 'USER_ENABLED',
        entityType: 'User',
        entityId: id,
        afterState: { email: targetUser.email },
      });

      return NextResponse.json({ success: true, message: 'User enabled' });
    }

    if (action === 'reset_password') {
      const { newPassword } = body;
      if (!newPassword || newPassword.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({
        where: { id },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          failedAttempts: 0,
        },
      });

      // Revoke all sessions
      await prisma.userSession.deleteMany({ where: { userId: id } });

      await createAuditLog({
        userId: currentUser.id,
        action: 'USER_PASSWORD_RESET',
        entityType: 'User',
        entityId: id,
        afterState: { email: targetUser.email, resetBy: currentUser.email },
      });

      return NextResponse.json({ success: true, message: 'Password reset successfully' });
    }

    if (action === 'revoke_sessions') {
      await prisma.userSession.deleteMany({ where: { userId: id } });

      await createAuditLog({
        userId: currentUser.id,
        action: 'USER_SESSIONS_REVOKED',
        entityType: 'User',
        entityId: id,
        afterState: { email: targetUser.email },
      });

      return NextResponse.json({ success: true, message: 'All sessions revoked' });
    }

    if (action === 'disable_mfa') {
      await prisma.user.update({
        where: { id },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
          mfaBackupCodes: [],
          mfaVerifiedAt: null,
        },
      });

      await createAuditLog({
        userId: currentUser.id,
        action: 'USER_MFA_DISABLED_BY_ADMIN',
        entityType: 'User',
        entityId: id,
        afterState: { email: targetUser.email, disabledBy: currentUser.email },
      });

      return NextResponse.json({ success: true, message: 'MFA disabled' });
    }

    // General update
    const allowedFields = ['name', 'role', 'status', 'orgId'];
    const filteredData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (updateData[key] !== undefined) {
        filteredData[key] = updateData[key];
      }
    }

    // Prevent changing owner role unless done by owner
    if (filteredData.role && targetUser.role === 'OWNER' && currentUser.role !== 'OWNER') {
      return NextResponse.json({ error: 'Cannot change owner role' }, { status: 403 });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: filteredData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        mfaEnabled: true,
        updatedAt: true,
      },
    });

    await createAuditLog({
      userId: currentUser.id,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: id,
      beforeState: { email: targetUser.email },
      afterState: filteredData,
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

// DELETE - Delete user(s) (Admin only) - supports single and mass delete
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email as string },
    });

    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const idsParam = searchParams.get('ids'); // For mass delete: comma-separated IDs

    // Mass delete
    if (idsParam) {
      const ids = idsParam.split(',').filter(Boolean);
      if (ids.length === 0) {
        return NextResponse.json({ error: 'No user IDs provided' }, { status: 400 });
      }

      // Fetch all target users
      const targetUsers = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, email: true, role: true },
      });

      if (targetUsers.length === 0) {
        return NextResponse.json({ error: 'No users found' }, { status: 404 });
      }

      // Validate each user
      const errors: string[] = [];
      const validIds: string[] = [];
      const deletedEmails: string[] = [];

      for (const user of targetUsers) {
        // Prevent self-deletion
        if (user.id === currentUser.id) {
          errors.push(`Cannot delete yourself (${user.email})`);
          continue;
        }
        // Prevent deleting owner unless done by owner
        if (user.role === 'OWNER' && currentUser.role !== 'OWNER') {
          errors.push(`Cannot delete owner (${user.email})`);
          continue;
        }
        validIds.push(user.id);
        deletedEmails.push(user.email);
      }

      if (validIds.length === 0) {
        return NextResponse.json({ 
          error: 'No users could be deleted', 
          details: errors 
        }, { status: 400 });
      }

      // Delete valid users
      const deleteResult = await prisma.user.deleteMany({
        where: { id: { in: validIds } },
      });

      await createAuditLog({
        userId: currentUser.id,
        action: 'USERS_MASS_DELETED',
        entityType: 'User',
        entityId: validIds.join(','),
        beforeState: { emails: deletedEmails, deletedBy: currentUser.email },
        afterState: { count: deleteResult.count },
      });

      return NextResponse.json({ 
        success: true, 
        message: `${deleteResult.count} user(s) deleted`,
        deleted: deleteResult.count,
        skipped: errors.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    // Single delete (backwards compatible)
    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Prevent self-deletion
    if (id === currentUser.id) {
      return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
    }

    // Prevent deleting owner unless done by owner
    if (targetUser.role === 'OWNER' && currentUser.role !== 'OWNER') {
      return NextResponse.json({ error: 'Cannot delete owner' }, { status: 403 });
    }

    await prisma.user.delete({ where: { id } });

    await createAuditLog({
      userId: currentUser.id,
      action: 'USER_DELETED',
      entityType: 'User',
      entityId: id,
      beforeState: { email: targetUser.email, deletedBy: currentUser.email },
    });

    return NextResponse.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
