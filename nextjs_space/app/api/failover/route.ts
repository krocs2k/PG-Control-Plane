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
    const clusterId = searchParams.get('clusterId');

    const operations = await prisma.failoverOperation.findMany({
      where: clusterId ? { clusterId } : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json(operations);
  } catch (error) {
    console.error('Error fetching failover operations:', error);
    return NextResponse.json({ error: 'Failed to fetch operations' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { clusterId, sourceNodeId, targetNodeId, type, reason } = body;

    if (!clusterId || !sourceNodeId || !targetNodeId) {
      return NextResponse.json(
        { error: 'clusterId, sourceNodeId, and targetNodeId are required' },
        { status: 400 }
      );
    }

    // Validate nodes exist
    const [sourceNode, targetNode] = await Promise.all([
      prisma.node.findUnique({ where: { id: sourceNodeId } }),
      prisma.node.findUnique({ where: { id: targetNodeId } }),
    ]);

    if (!sourceNode || !targetNode) {
      return NextResponse.json({ error: 'Invalid node IDs' }, { status: 400 });
    }

    // Run pre-checks
    const preChecks = await runPreChecks(clusterId, sourceNode, targetNode);

    // Create failover operation
    const operation = await prisma.failoverOperation.create({
      data: {
        clusterId,
        sourceNodeId,
        targetNodeId,
        type: type || 'PLANNED',
        reason,
        status: 'PENDING',
        preChecks: JSON.stringify(preChecks),
        initiatedBy: session.user.id,
      },
    });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'FailoverOperation',
      entityId: operation.id,
      action: 'INITIATED',
      afterState: { type, sourceNodeId, targetNodeId },
    });

    return NextResponse.json(operation);
  } catch (error) {
    console.error('Error creating failover operation:', error);
    return NextResponse.json({ error: 'Failed to create operation' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, action } = body;

    if (!id || !action) {
      return NextResponse.json({ error: 'id and action are required' }, { status: 400 });
    }

    const operation = await prisma.failoverOperation.findUnique({ where: { id } });
    if (!operation) {
      return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
    }

    let updatedOperation;
    const steps: string[] = operation.steps ? JSON.parse(operation.steps) : [];

    switch (action) {
      case 'execute':
        if (operation.status !== 'PENDING') {
          return NextResponse.json({ error: 'Operation must be pending to execute' }, { status: 400 });
        }
        
        // Simulate failover execution
        steps.push(`${new Date().toISOString()} - Starting failover from ${operation.sourceNodeId} to ${operation.targetNodeId}`);
        steps.push(`${new Date().toISOString()} - Running pre-flight checks`);
        
        updatedOperation = await prisma.failoverOperation.update({
          where: { id },
          data: {
            status: 'PRE_CHECK',
            startedAt: new Date(),
            steps: JSON.stringify(steps),
          },
        });

        // Simulate async execution
        setTimeout(() => executeFailover(id), 2000);
        break;

      case 'rollback':
        if (operation.status !== 'COMPLETED' && operation.status !== 'FAILED') {
          return NextResponse.json({ error: 'Can only rollback completed or failed operations' }, { status: 400 });
        }

        steps.push(`${new Date().toISOString()} - Initiating rollback`);
        steps.push(`${new Date().toISOString()} - Restoring original primary`);

        // Swap nodes back
        await Promise.all([
          prisma.node.update({
            where: { id: operation.sourceNodeId },
            data: { role: 'PRIMARY', status: 'ONLINE' },
          }),
          prisma.node.update({
            where: { id: operation.targetNodeId },
            data: { role: 'REPLICA', status: 'ONLINE' },
          }),
        ]);

        steps.push(`${new Date().toISOString()} - Rollback completed`);

        updatedOperation = await prisma.failoverOperation.update({
          where: { id },
          data: {
            status: 'ROLLED_BACK',
            rolledBackAt: new Date(),
            steps: JSON.stringify(steps),
          },
        });
        break;

      case 'cancel':
        if (operation.status !== 'PENDING') {
          return NextResponse.json({ error: 'Can only cancel pending operations' }, { status: 400 });
        }

        updatedOperation = await prisma.failoverOperation.update({
          where: { id },
          data: { status: 'FAILED', errorMessage: 'Cancelled by user' },
        });
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    await createAuditLog({
      userId: session.user.id,
      entityType: 'FailoverOperation',
      entityId: id,
      action: action.toUpperCase(),
      afterState: { status: updatedOperation?.status },
    });

    return NextResponse.json(updatedOperation);
  } catch (error) {
    console.error('Error updating failover operation:', error);
    return NextResponse.json({ error: 'Failed to update operation' }, { status: 500 });
  }
}

async function runPreChecks(clusterId: string, sourceNode: any, targetNode: any) {
  const checks = [];

  // Check 1: Source is primary
  checks.push({
    name: 'Source Node is Primary',
    passed: sourceNode.role === 'PRIMARY',
    message: sourceNode.role === 'PRIMARY' ? 'Source node is the current primary' : 'Source node is not primary',
  });

  // Check 2: Target is replica
  checks.push({
    name: 'Target Node is Replica',
    passed: targetNode.role === 'REPLICA',
    message: targetNode.role === 'REPLICA' ? 'Target node is a replica' : 'Target node is not a replica',
  });

  // Check 3: Target is online
  checks.push({
    name: 'Target Node Online',
    passed: targetNode.status === 'ONLINE',
    message: targetNode.status === 'ONLINE' ? 'Target node is online' : `Target node status: ${targetNode.status}`,
  });

  // Check 4: Replication lag (simulated)
  const lagMs = Math.random() * 100;
  checks.push({
    name: 'Replication Lag',
    passed: lagMs < 50,
    message: `Replication lag: ${lagMs.toFixed(0)}ms (threshold: 50ms)`,
  });

  // Check 5: Active connections (simulated)
  const connections = Math.floor(Math.random() * 50) + 10;
  checks.push({
    name: 'Active Connections',
    passed: connections < 100,
    message: `${connections} active connections will be affected`,
  });

  return checks;
}

async function executeFailover(operationId: string) {
  try {
    const operation = await prisma.failoverOperation.findUnique({ where: { id: operationId } });
    if (!operation || operation.status !== 'PRE_CHECK') return;

    const steps: string[] = operation.steps ? JSON.parse(operation.steps) : [];

    // Step 1: In Progress
    steps.push(`${new Date().toISOString()} - Pre-flight checks passed`);
    steps.push(`${new Date().toISOString()} - Draining connections from source node`);
    await prisma.failoverOperation.update({
      where: { id: operationId },
      data: { status: 'IN_PROGRESS', steps: JSON.stringify(steps) },
    });

    await new Promise(r => setTimeout(r, 1500));

    // Step 2: Promoting target
    steps.push(`${new Date().toISOString()} - Promoting target node to primary`);
    await prisma.failoverOperation.update({
      where: { id: operationId },
      data: { steps: JSON.stringify(steps) },
    });

    await new Promise(r => setTimeout(r, 1500));

    // Step 3: Demoting source
    steps.push(`${new Date().toISOString()} - Demoting source node to replica`);
    await prisma.failoverOperation.update({
      where: { id: operationId },
      data: { steps: JSON.stringify(steps) },
    });

    // Actually update nodes
    await Promise.all([
      prisma.node.update({
        where: { id: operation.sourceNodeId },
        data: { role: 'REPLICA', status: 'ONLINE' },
      }),
      prisma.node.update({
        where: { id: operation.targetNodeId },
        data: { role: 'PRIMARY', status: 'ONLINE' },
      }),
    ]);

    await new Promise(r => setTimeout(r, 1000));

    // Step 4: Validating
    steps.push(`${new Date().toISOString()} - Validating replication setup`);
    await prisma.failoverOperation.update({
      where: { id: operationId },
      data: { status: 'VALIDATING', steps: JSON.stringify(steps) },
    });

    await new Promise(r => setTimeout(r, 1000));

    // Step 5: Complete
    steps.push(`${new Date().toISOString()} - Failover completed successfully`);
    await prisma.failoverOperation.update({
      where: { id: operationId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        steps: JSON.stringify(steps),
      },
    });

    // Record lifecycle events
    await prisma.nodeLifecycleEvent.createMany({
      data: [
        {
          nodeId: operation.sourceNodeId,
          clusterId: operation.clusterId,
          eventType: 'DEMOTED',
          fromStatus: 'PRIMARY',
          toStatus: 'REPLICA',
          details: JSON.stringify({ failoverOperationId: operationId }),
        },
        {
          nodeId: operation.targetNodeId,
          clusterId: operation.clusterId,
          eventType: 'PROMOTED',
          fromStatus: 'REPLICA',
          toStatus: 'PRIMARY',
          details: JSON.stringify({ failoverOperationId: operationId }),
        },
      ],
    });
  } catch (error) {
    console.error('Failover execution error:', error);
    await prisma.failoverOperation.update({
      where: { id: operationId },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}
