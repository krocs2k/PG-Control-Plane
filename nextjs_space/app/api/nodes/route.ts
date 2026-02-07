export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { hasPermission } from '@/lib/types';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get('clusterId');

    const nodes = await prisma.node.findMany({
      where: clusterId ? { clusterId } : {},
      include: { cluster: { include: { project: true } } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    return NextResponse.json(nodes);
  } catch (error) {
    console.error('Error fetching nodes:', error);
    return NextResponse.json({ error: 'Failed to fetch nodes' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.role, 'OPERATOR')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { name, clusterId, host, port, role } = body ?? {};

    if (!name || !clusterId || !host || !port) {
      return NextResponse.json(
        { error: 'Name, clusterId, host, and port are required' },
        { status: 400 }
      );
    }

    const node = await prisma.node.create({
      data: {
        name,
        clusterId,
        host,
        port: parseInt(port, 10),
        role: role || 'REPLICA',
        status: 'OFFLINE',
      },
    });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Node',
      entityId: node.id,
      action: 'CREATE',
      afterState: node,
    });

    return NextResponse.json(node);
  } catch (error) {
    console.error('Error creating node:', error);
    return NextResponse.json({ error: 'Failed to create node' }, { status: 500 });
  }
}
