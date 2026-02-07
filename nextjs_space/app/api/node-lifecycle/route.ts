export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const nodeId = searchParams.get('nodeId');
    const clusterId = searchParams.get('clusterId');

    const events = await prisma.nodeLifecycleEvent.findMany({
      where: {
        ...(nodeId && { nodeId }),
        ...(clusterId && { clusterId }),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error('Error fetching lifecycle events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { nodeId, action } = body;

    if (!nodeId || !action) {
      return NextResponse.json({ error: 'nodeId and action are required' }, { status: 400 });
    }

    const node = await prisma.node.findUnique({
      where: { id: nodeId },
      include: { cluster: true },
    });

    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    const previousStatus = node.status;
    let newStatus: string;
    let eventType: string;
    let details: any = {};

    switch (action) {
      case 'drain':
        if (node.status !== 'ONLINE') {
          return NextResponse.json({ error: 'Node must be online to drain' }, { status: 400 });
        }
        newStatus = 'DRAINING';
        eventType = 'DRAIN_STARTED';
        details = { reason: body.reason || 'Manual drain initiated' };
        
        // Simulate async draining
        setTimeout(() => completeDrain(nodeId, session.user?.id), 5000);
        break;

      case 'maintenance':
        if (node.status !== 'ONLINE' && node.status !== 'DRAINING') {
          return NextResponse.json({ error: 'Node must be online or draining' }, { status: 400 });
        }
        newStatus = 'MAINTENANCE';
        eventType = 'MAINTENANCE_STARTED';
        details = {
          reason: body.reason || 'Scheduled maintenance',
          estimatedDuration: body.estimatedDuration || '1 hour',
        };
        break;

      case 'online':
        if (node.status === 'ONLINE') {
          return NextResponse.json({ error: 'Node is already online' }, { status: 400 });
        }
        newStatus = 'ONLINE';
        eventType = 'BROUGHT_ONLINE';
        details = { previousStatus };
        break;

      case 'offline':
        if (node.status === 'OFFLINE') {
          return NextResponse.json({ error: 'Node is already offline' }, { status: 400 });
        }
        if (node.role === 'PRIMARY') {
          return NextResponse.json(
            { error: 'Cannot take primary offline. Perform failover first.' },
            { status: 400 }
          );
        }
        newStatus = 'OFFLINE';
        eventType = 'TAKEN_OFFLINE';
        details = { reason: body.reason || 'Manual shutdown' };
        break;

      case 'decommission':
        if (node.role === 'PRIMARY') {
          return NextResponse.json(
            { error: 'Cannot decommission primary. Perform failover first.' },
            { status: 400 }
          );
        }
        
        // Record decommission event before deletion
        await prisma.nodeLifecycleEvent.create({
          data: {
            nodeId,
            clusterId: node.clusterId,
            eventType: 'DECOMMISSIONED',
            fromStatus: previousStatus,
            toStatus: 'DECOMMISSIONED',
            details: JSON.stringify({ reason: body.reason || 'Node decommissioned' }),
            initiatedBy: session.user.id,
          },
        });

        await createAuditLog({
          userId: session.user.id,
          entityType: 'Node',
          entityId: nodeId,
          action: 'DECOMMISSIONED',
          beforeState: node,
        });

        // Delete the node
        await prisma.node.delete({ where: { id: nodeId } });

        return NextResponse.json({ success: true, action: 'decommissioned' });

      case 'set_priority':
        const { priority } = body;
        if (priority === undefined || priority < 1 || priority > 10) {
          return NextResponse.json({ error: 'Priority must be between 1 and 10' }, { status: 400 });
        }

        await prisma.node.update({
          where: { id: nodeId },
          data: { priority },
        });

        await prisma.nodeLifecycleEvent.create({
          data: {
            nodeId,
            clusterId: node.clusterId,
            eventType: 'PRIORITY_CHANGED',
            fromStatus: String(node.priority),
            toStatus: String(priority),
            details: JSON.stringify({ previousPriority: node.priority, newPriority: priority }),
            initiatedBy: session.user.id,
          },
        });

        return NextResponse.json({ success: true, priority });

      case 'set_weight':
        const { weight } = body;
        if (weight === undefined || weight < 0 || weight > 100) {
          return NextResponse.json({ error: 'Weight must be between 0 and 100' }, { status: 400 });
        }

        await prisma.node.update({
          where: { id: nodeId },
          data: { routingWeight: weight },
        });

        await prisma.nodeLifecycleEvent.create({
          data: {
            nodeId,
            clusterId: node.clusterId,
            eventType: 'WEIGHT_CHANGED',
            fromStatus: String(node.routingWeight),
            toStatus: String(weight),
            details: JSON.stringify({ previousWeight: node.routingWeight, newWeight: weight }),
            initiatedBy: session.user.id,
          },
        });

        return NextResponse.json({ success: true, weight });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Update node status
    const updatedNode = await prisma.node.update({
      where: { id: nodeId },
      data: { status: newStatus as any },
    });

    // Record lifecycle event
    await prisma.nodeLifecycleEvent.create({
      data: {
        nodeId,
        clusterId: node.clusterId,
        eventType,
        fromStatus: previousStatus,
        toStatus: newStatus,
        details: JSON.stringify(details),
        initiatedBy: session.user.id,
      },
    });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Node',
      entityId: nodeId,
      action: eventType,
      beforeState: { status: previousStatus },
      afterState: { status: newStatus },
    });

    return NextResponse.json(updatedNode);
  } catch (error) {
    console.error('Error in node lifecycle action:', error);
    return NextResponse.json({ error: 'Failed to execute action' }, { status: 500 });
  }
}

async function completeDrain(nodeId: string, userId?: string) {
  try {
    const node = await prisma.node.findUnique({ where: { id: nodeId } });
    if (!node || node.status !== 'DRAINING') return;

    await prisma.node.update({
      where: { id: nodeId },
      data: { status: 'MAINTENANCE' },
    });

    await prisma.nodeLifecycleEvent.create({
      data: {
        nodeId,
        clusterId: node.clusterId,
        eventType: 'DRAIN_COMPLETED',
        fromStatus: 'DRAINING',
        toStatus: 'MAINTENANCE',
        details: JSON.stringify({ drainedAt: new Date().toISOString() }),
        initiatedBy: userId,
      },
    });
  } catch (error) {
    console.error('Error completing drain:', error);
  }
}
