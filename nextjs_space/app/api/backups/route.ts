import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

// GET - List backups and schedules
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get('clusterId');
    const type = searchParams.get('type');
    const status = searchParams.get('status');

    if (!clusterId) {
      return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
    }

    // Get backups
    const whereClause: Record<string, unknown> = { clusterId };
    if (type) whereClause.type = type;
    if (status) whereClause.status = status;

    const backups = await prisma.backup.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Get or create backup schedule
    let schedule = await prisma.backupSchedule.findUnique({
      where: { clusterId },
    });

    if (!schedule) {
      schedule = await prisma.backupSchedule.create({
        data: { clusterId },
      });
    }

    // Calculate backup stats
    const totalSize = backups.reduce((sum, b) => sum + (b.size ? Number(b.size) : 0), 0);
    const completedBackups = backups.filter(b => b.status === 'COMPLETED' || b.status === 'VERIFIED').length;
    const failedBackups = backups.filter(b => b.status === 'FAILED').length;

    return NextResponse.json({
      backups: backups.map(b => ({
        ...b,
        size: b.size ? Number(b.size) : null,
      })),
      schedule,
      stats: {
        totalBackups: backups.length,
        totalSize,
        completedBackups,
        failedBackups,
        lastFullBackup: backups.find(b => b.type === 'FULL' && b.status === 'COMPLETED')?.completedAt,
        lastIncrBackup: backups.find(b => b.type === 'INCREMENTAL' && b.status === 'COMPLETED')?.completedAt,
      },
    });
  } catch (error) {
    console.error('Backups GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch backups' }, { status: 500 });
  }
}

// POST - Create new backup or update schedule
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, clusterId, type, nodeId } = body;

    if (!clusterId) {
      return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
    }

    if (action === 'schedule') {
      // Update backup schedule
      const { enabled, fullBackupCron, incrBackupCron, walArchiving, retentionDays } = body;

      const schedule = await prisma.backupSchedule.upsert({
        where: { clusterId },
        update: {
          enabled: enabled ?? true,
          fullBackupCron: fullBackupCron ?? '0 2 * * 0',
          incrBackupCron: incrBackupCron ?? '0 2 * * 1-6',
          walArchiving: walArchiving ?? true,
          retentionDays: retentionDays ?? 30,
        },
        create: {
          clusterId,
          enabled: enabled ?? true,
          fullBackupCron: fullBackupCron ?? '0 2 * * 0',
          incrBackupCron: incrBackupCron ?? '0 2 * * 1-6',
          walArchiving: walArchiving ?? true,
          retentionDays: retentionDays ?? 30,
        },
      });

      await createAuditLog({
        userId: session.user?.id,
        entityType: 'BackupSchedule',
        entityId: schedule.id,
        action: 'UPDATE_SCHEDULE',
        afterState: schedule,
      });

      return NextResponse.json({ schedule });
    }

    // Create new backup
    const backupType = type || 'FULL';
    const backup = await prisma.backup.create({
      data: {
        clusterId,
        nodeId,
        type: backupType,
        status: 'PENDING',
        retentionDays: body.retentionDays || 30,
      },
    });

    await createAuditLog({
      userId: session.user?.id,
      entityType: 'Backup',
      entityId: backup.id,
      action: 'INITIATE_BACKUP',
      afterState: backup,
    });

    // Simulate backup process
    simulateBackup(backup.id, backupType);

    return NextResponse.json({ backup: { ...backup, size: backup.size ? Number(backup.size) : null } });
  } catch (error) {
    console.error('Backups POST error:', error);
    return NextResponse.json({ error: 'Failed to create backup' }, { status: 500 });
  }
}

// PATCH - Update backup (verify, restore, cancel)
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, action, pitrTarget } = body;

    if (!id || !action) {
      return NextResponse.json({ error: 'id and action are required' }, { status: 400 });
    }

    const backup = await prisma.backup.findUnique({ where: { id } });
    if (!backup) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    if (action === 'verify') {
      const updated = await prisma.backup.update({
        where: { id },
        data: {
          status: 'VALIDATING',
        },
      });

      // Simulate verification
      setTimeout(async () => {
        await prisma.backup.update({
          where: { id },
          data: {
            status: 'VERIFIED',
            verified: true,
            verifiedAt: new Date(),
          },
        });
      }, 3000);

      await createAuditLog({
        userId: session.user?.id,
        entityType: 'Backup',
        entityId: id,
        action: 'VERIFY_BACKUP',
        beforeState: backup,
        afterState: updated,
      });

      return NextResponse.json({ backup: { ...updated, size: updated.size ? Number(updated.size) : null } });
    }

    if (action === 'restore') {
      await createAuditLog({
        userId: session.user?.id,
        entityType: 'Backup',
        entityId: id,
        action: 'INITIATE_RESTORE',
        afterState: { pitrTarget, backupId: id },
      });

      // In a real system, this would trigger the restore process
      return NextResponse.json({
        success: true,
        message: 'Restore initiated',
        restoreId: `restore-${Date.now()}`,
        estimatedTime: '15 minutes',
      });
    }

    if (action === 'cancel') {
      if (backup.status !== 'PENDING' && backup.status !== 'IN_PROGRESS') {
        return NextResponse.json({ error: 'Cannot cancel backup in current status' }, { status: 400 });
      }

      const updated = await prisma.backup.update({
        where: { id },
        data: {
          status: 'FAILED',
          errorMessage: 'Cancelled by user',
        },
      });

      await createAuditLog({
        userId: session.user?.id,
        entityType: 'Backup',
        entityId: id,
        action: 'CANCEL_BACKUP',
        beforeState: backup,
        afterState: updated,
      });

      return NextResponse.json({ backup: { ...updated, size: updated.size ? Number(updated.size) : null } });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Backups PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update backup' }, { status: 500 });
  }
}

// DELETE - Delete backup
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const backup = await prisma.backup.findUnique({ where: { id } });
    if (!backup) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    await prisma.backup.delete({ where: { id } });

    await createAuditLog({
      userId: session.user?.id,
      entityType: 'Backup',
      entityId: id,
      action: 'DELETE_BACKUP',
      beforeState: backup,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Backups DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete backup' }, { status: 500 });
  }
}

// Simulate backup process
async function simulateBackup(backupId: string, type: string) {
  // Start backup
  await prisma.backup.update({
    where: { id: backupId },
    data: {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      walStart: `0/` + Math.random().toString(16).substring(2, 10).toUpperCase(),
    },
  });

  // Simulate completion after delay
  const delay = type === 'FULL' ? 5000 : type === 'INCREMENTAL' ? 3000 : 2000;
  setTimeout(async () => {
    const success = Math.random() > 0.1; // 90% success rate
    const size = type === 'FULL' ? Math.floor(Math.random() * 5000000000) + 1000000000 :
                 type === 'INCREMENTAL' ? Math.floor(Math.random() * 500000000) + 50000000 :
                 Math.floor(Math.random() * 50000000) + 1000000;

    await prisma.backup.update({
      where: { id: backupId },
      data: success ? {
        status: 'COMPLETED',
        completedAt: new Date(),
        size: BigInt(size),
        walEnd: `0/` + Math.random().toString(16).substring(2, 10).toUpperCase(),
        location: `/backups/${backupId}`,
      } : {
        status: 'FAILED',
        errorMessage: 'Simulated backup failure - disk space insufficient',
      },
    });
  }, delay);
}
