import { prisma } from './db';

export async function createAuditLog({
  userId,
  entityType,
  entityId,
  action,
  beforeState,
  afterState,
}: {
  userId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  beforeState?: object | null;
  afterState?: object | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        entityType,
        entityId,
        action,
        beforeState: beforeState ? JSON.stringify(beforeState) : null,
        afterState: afterState ? JSON.stringify(afterState) : null,
      },
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}
