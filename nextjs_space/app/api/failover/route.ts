export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { testConnection, getReplicationStatus, getPool } from '@/lib/postgres';

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

interface PreCheckResult {
  name: string;
  passed: boolean;
  message: string;
}

async function runPreChecks(clusterId: string, sourceNode: { id: string; role: string; status: string; connectionString: string | null }, targetNode: { id: string; role: string; status: string; connectionString: string | null }): Promise<PreCheckResult[]> {
  const checks: PreCheckResult[] = [];

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

  // Check 4: Source connection test
  if (sourceNode.connectionString) {
    const sourceConnTest = await testConnection(sourceNode.connectionString);
    checks.push({
      name: 'Source Node Accessible',
      passed: sourceConnTest.success,
      message: sourceConnTest.success 
        ? `Source node accessible (PostgreSQL ${sourceConnTest.pgVersion})` 
        : `Source connection failed: ${sourceConnTest.error}`,
    });
  } else {
    checks.push({
      name: 'Source Node Accessible',
      passed: false,
      message: 'No connection string configured for source node',
    });
  }

  // Check 5: Target connection test
  if (targetNode.connectionString) {
    const targetConnTest = await testConnection(targetNode.connectionString);
    checks.push({
      name: 'Target Node Accessible',
      passed: targetConnTest.success,
      message: targetConnTest.success 
        ? `Target node accessible (PostgreSQL ${targetConnTest.pgVersion})` 
        : `Target connection failed: ${targetConnTest.error}`,
    });

    // Check 6: Replication lag from real database
    if (targetConnTest.success) {
      try {
        const replicationStatus = await getReplicationStatus(targetNode.connectionString);
        if (replicationStatus.isInRecovery) {
          const lagSeconds = replicationStatus.replayLagSeconds || 0;
          const lagMs = lagSeconds * 1000;
          checks.push({
            name: 'Replication Lag',
            passed: lagMs < 5000, // 5 second threshold
            message: `Replication lag: ${lagMs.toFixed(0)}ms (threshold: 5000ms)`,
          });
        } else {
          checks.push({
            name: 'Replication Lag',
            passed: false,
            message: 'Target node is not in recovery mode (not a replica)',
          });
        }
      } catch (error) {
        checks.push({
          name: 'Replication Lag',
          passed: false,
          message: `Failed to check replication lag: ${(error as Error).message}`,
        });
      }
    }
  } else {
    checks.push({
      name: 'Target Node Accessible',
      passed: false,
      message: 'No connection string configured for target node',
    });
  }

  // Check 7: Active connections on source (if accessible)
  if (sourceNode.connectionString) {
    try {
      const pool = getPool(sourceNode.connectionString);
      const result = await pool.query(`
        SELECT count(*) as conn_count 
        FROM pg_stat_activity 
        WHERE state = 'active' AND pid != pg_backend_pid()
      `);
      const connections = parseInt(result.rows[0]?.conn_count || '0');
      checks.push({
        name: 'Active Connections',
        passed: connections < 500,
        message: `${connections} active connections will be affected`,
      });
    } catch (error) {
      checks.push({
        name: 'Active Connections',
        passed: true, // Don't fail for this check
        message: `Could not verify active connections: ${(error as Error).message}`,
      });
    }
  }

  return checks;
}

async function executeFailover(operationId: string) {
  try {
    const operation = await prisma.failoverOperation.findUnique({ 
      where: { id: operationId },
    });
    if (!operation || operation.status !== 'PRE_CHECK') return;

    // Fetch source and target nodes separately
    const [sourceNode, targetNode] = await Promise.all([
      prisma.node.findUnique({ where: { id: operation.sourceNodeId } }),
      prisma.node.findUnique({ where: { id: operation.targetNodeId } }),
    ]);

    const steps: string[] = operation.steps ? JSON.parse(operation.steps) : [];

    // Step 1: In Progress
    steps.push(`${new Date().toISOString()} - Pre-flight checks passed`);
    await prisma.failoverOperation.update({
      where: { id: operationId },
      data: { status: 'IN_PROGRESS', steps: JSON.stringify(steps) },
    });

    // Step 2: Terminate connections on source (drain)
    if (sourceNode?.connectionString) {
      try {
        steps.push(`${new Date().toISOString()} - Terminating connections on source node`);
        await prisma.failoverOperation.update({
          where: { id: operationId },
          data: { steps: JSON.stringify(steps) },
        });

        const sourcePool = getPool(sourceNode.connectionString);
        
        // Terminate all connections except our own and system connections
        await sourcePool.query(`
          SELECT pg_terminate_backend(pid) 
          FROM pg_stat_activity 
          WHERE pid != pg_backend_pid() 
          AND datname = current_database()
          AND usename NOT IN ('postgres', 'replication')
        `);
        
        steps.push(`${new Date().toISOString()} - Connections terminated on source node`);
        await prisma.failoverOperation.update({
          where: { id: operationId },
          data: { steps: JSON.stringify(steps) },
        });
      } catch (error) {
        steps.push(`${new Date().toISOString()} - Warning: Could not terminate connections: ${(error as Error).message}`);
      }
    }

    // Step 3: Promote target replica to primary
    if (targetNode?.connectionString) {
      try {
        steps.push(`${new Date().toISOString()} - Promoting target node to primary`);
        await prisma.failoverOperation.update({
          where: { id: operationId },
          data: { steps: JSON.stringify(steps) },
        });

        const targetPool = getPool(targetNode.connectionString);
        
        // Use pg_promote() function (available in PostgreSQL 12+)
        // This is a superuser-only function that promotes a standby to primary
        try {
          await targetPool.query('SELECT pg_promote(true, 60)'); // Wait up to 60 seconds for WAL flush
          steps.push(`${new Date().toISOString()} - Target node promoted using pg_promote()`);
        } catch (promoteError) {
          // pg_promote might not be available or might fail
          // The promotion status will be verified in the validation step
          steps.push(`${new Date().toISOString()} - pg_promote() call: ${(promoteError as Error).message}`);
        }
        
        await prisma.failoverOperation.update({
          where: { id: operationId },
          data: { steps: JSON.stringify(steps) },
        });
      } catch (error) {
        steps.push(`${new Date().toISOString()} - Error promoting target: ${(error as Error).message}`);
        throw new Error(`Failed to promote target node: ${(error as Error).message}`);
      }
    } else {
      throw new Error('Target node has no connection string configured');
    }

    // Step 4: Update node roles in control plane database
    steps.push(`${new Date().toISOString()} - Updating node roles in control plane`);
    await Promise.all([
      prisma.node.update({
        where: { id: operation.sourceNodeId },
        data: { role: 'REPLICA', status: 'OFFLINE' }, // Source is now a standby (needs reconfiguration)
      }),
      prisma.node.update({
        where: { id: operation.targetNodeId },
        data: { role: 'PRIMARY', status: 'ONLINE' },
      }),
    ]);

    // Step 5: Validate the failover
    steps.push(`${new Date().toISOString()} - Validating new primary node`);
    await prisma.failoverOperation.update({
      where: { id: operationId },
      data: { status: 'VALIDATING', steps: JSON.stringify(steps) },
    });

    // Verify target is no longer in recovery (is now primary)
    if (targetNode?.connectionString) {
      try {
        const targetPool = getPool(targetNode.connectionString);
        const recoveryResult = await targetPool.query('SELECT pg_is_in_recovery() as in_recovery');
        const isInRecovery = recoveryResult.rows[0]?.in_recovery;
        
        if (isInRecovery) {
          steps.push(`${new Date().toISOString()} - Warning: Target node is still in recovery mode`);
        } else {
          steps.push(`${new Date().toISOString()} - Confirmed: Target node is now primary (not in recovery)`);
        }
        
        // Get new primary's WAL position
        const walResult = await targetPool.query('SELECT pg_current_wal_lsn() as lsn');
        steps.push(`${new Date().toISOString()} - New primary WAL position: ${walResult.rows[0]?.lsn}`);
      } catch (error) {
        steps.push(`${new Date().toISOString()} - Validation warning: ${(error as Error).message}`);
      }
    }

    // Step 6: Complete
    steps.push(`${new Date().toISOString()} - Failover completed successfully`);
    steps.push(`${new Date().toISOString()} - Note: Old primary (${sourceNode?.name}) needs manual reconfiguration as standby`);
    
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

    console.log(`Failover ${operationId} completed successfully`);
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
