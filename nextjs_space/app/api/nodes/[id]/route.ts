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

    const node = await prisma.node.findUnique({
      where: { id: params?.id },
      include: { cluster: { include: { project: true } } },
    });

    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    return NextResponse.json(node);
  } catch (error) {
    console.error('Error fetching node:', error);
    return NextResponse.json({ error: 'Failed to fetch node' }, { status: 500 });
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

    const beforeState = await prisma.node.findUnique({ where: { id: params?.id } });
    const body = await request.json();
    const { name, host, port, role, status } = body ?? {};

    const node = await prisma.node.update({
      where: { id: params?.id },
      data: {
        name,
        host,
        port: port ? parseInt(port, 10) : undefined,
        role,
        status,
      },
    });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Node',
      entityId: node.id,
      action: 'UPDATE',
      beforeState,
      afterState: node,
    });

    return NextResponse.json(node);
  } catch (error) {
    console.error('Error updating node:', error);
    return NextResponse.json({ error: 'Failed to update node' }, { status: 500 });
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

    const beforeState = await prisma.node.findUnique({ where: { id: params?.id } });

    await prisma.node.delete({ where: { id: params?.id } });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Node',
      entityId: params?.id,
      action: 'DELETE',
      beforeState,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting node:', error);
    return NextResponse.json({ error: 'Failed to delete node' }, { status: 500 });
  }
}
