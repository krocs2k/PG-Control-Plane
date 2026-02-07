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
    const projectId = searchParams.get('projectId');

    const clusters = await prisma.cluster.findMany({
      where: projectId ? { projectId } : {},
      include: {
        _count: { select: { nodes: true } },
        project: { include: { organization: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter by user's org if applicable
    const filteredClusters = session.user.orgId
      ? clusters.filter((c) => c?.project?.organization?.id === session.user.orgId)
      : clusters;

    return NextResponse.json(filteredClusters);
  } catch (error) {
    console.error('Error fetching clusters:', error);
    return NextResponse.json({ error: 'Failed to fetch clusters' }, { status: 500 });
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
    const { name, projectId, topology, replicationMode } = body ?? {};

    if (!name || !projectId) {
      return NextResponse.json({ error: 'Name and projectId are required' }, { status: 400 });
    }

    // Verify project belongs to user's org
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { organization: true },
    });

    if (!project || (session.user.orgId && project.orgId !== session.user.orgId)) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const cluster = await prisma.cluster.create({
      data: {
        name,
        projectId,
        topology: topology || 'standard',
        replicationMode: replicationMode || 'ASYNC',
        status: 'PROVISIONING',
      },
    });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Cluster',
      entityId: cluster.id,
      action: 'CREATE',
      afterState: cluster,
    });

    return NextResponse.json(cluster);
  } catch (error) {
    console.error('Error creating cluster:', error);
    return NextResponse.json({ error: 'Failed to create cluster' }, { status: 500 });
  }
}
