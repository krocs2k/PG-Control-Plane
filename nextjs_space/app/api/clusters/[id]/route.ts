export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { hasPermission } from '@/lib/types';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cluster = await prisma.cluster.findUnique({
      where: { id: params?.id },
      include: {
        nodes: { orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] },
        project: { include: { organization: true } },
      },
    });

    if (!cluster) {
      return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
    }

    return NextResponse.json(cluster);
  } catch (error) {
    console.error('Error fetching cluster:', error);
    return NextResponse.json({ error: 'Failed to fetch cluster' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.role, 'OPERATOR')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const beforeState = await prisma.cluster.findUnique({ where: { id: params?.id } });
    const body = await request.json();
    const { name, status, replicationMode, topology } = body ?? {};

    const cluster = await prisma.cluster.update({
      where: { id: params?.id },
      data: { name, status, replicationMode, topology },
    });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Cluster',
      entityId: cluster.id,
      action: 'UPDATE',
      beforeState,
      afterState: cluster,
    });

    return NextResponse.json(cluster);
  } catch (error) {
    console.error('Error updating cluster:', error);
    return NextResponse.json({ error: 'Failed to update cluster' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.role, 'ADMIN')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const beforeState = await prisma.cluster.findUnique({ where: { id: params?.id } });

    await prisma.cluster.delete({ where: { id: params?.id } });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Cluster',
      entityId: params?.id,
      action: 'DELETE',
      beforeState,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting cluster:', error);
    return NextResponse.json({ error: 'Failed to delete cluster' }, { status: 500 });
  }
}
