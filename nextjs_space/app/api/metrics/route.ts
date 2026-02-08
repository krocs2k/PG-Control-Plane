export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { getDatabaseStats, testConnection, getReplicationStatus } from '@/lib/postgres';

// Collect real metrics from a PostgreSQL database
async function collectRealMetrics(
  clusterId: string,
  nodeId: string,
  connectionString: string
): Promise<Array<{
  clusterId: string;
  nodeId: string;
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
}>> {
  const metrics: Array<{
    clusterId: string;
    nodeId: string;
    name: string;
    value: number;
    unit: string;
    timestamp: Date;
  }> = [];
  const timestamp = new Date();

  try {
    // Test connection first
    const connTest = await testConnection(connectionString);
    if (!connTest.success) {
      console.error(`Failed to connect to node ${nodeId}: ${connTest.error}`);
      return metrics;
    }

    // Get database stats
    const stats = await getDatabaseStats(connectionString);
    
    // Active connections
    metrics.push({
      clusterId,
      nodeId,
      name: 'active_connections',
      value: stats.activeConnections,
      unit: 'conn',
      timestamp,
    });

    // Max connections
    metrics.push({
      clusterId,
      nodeId,
      name: 'max_connections',
      value: stats.maxConnections,
      unit: 'conn',
      timestamp,
    });

    // Connection utilization
    metrics.push({
      clusterId,
      nodeId,
      name: 'connection_utilization',
      value: (stats.activeConnections / stats.maxConnections) * 100,
      unit: '%',
      timestamp,
    });

    // Cache hit ratio
    metrics.push({
      clusterId,
      nodeId,
      name: 'cache_hit_ratio',
      value: stats.cacheHitRatio,
      unit: '%',
      timestamp,
    });

    // TPS (transactions per second - approximate from total)
    metrics.push({
      clusterId,
      nodeId,
      name: 'transactions_committed',
      value: stats.transactionsCommitted,
      unit: 'tx',
      timestamp,
    });

    metrics.push({
      clusterId,
      nodeId,
      name: 'transactions_rolledback',
      value: stats.transactionsRolledBack,
      unit: 'tx',
      timestamp,
    });

    // Database size in MB
    metrics.push({
      clusterId,
      nodeId,
      name: 'database_size',
      value: Math.round(stats.databaseSize / 1024 / 1024),
      unit: 'MB',
      timestamp,
    });

    // Deadlocks
    metrics.push({
      clusterId,
      nodeId,
      name: 'deadlocks',
      value: stats.deadlocks,
      unit: 'count',
      timestamp,
    });

    // Temp file bytes
    metrics.push({
      clusterId,
      nodeId,
      name: 'temp_files_size',
      value: Math.round(stats.tempFilesBytes / 1024 / 1024),
      unit: 'MB',
      timestamp,
    });

    // Buffer blocks read/hit
    metrics.push({
      clusterId,
      nodeId,
      name: 'blocks_read',
      value: stats.blocksRead,
      unit: 'blocks',
      timestamp,
    });

    metrics.push({
      clusterId,
      nodeId,
      name: 'blocks_hit',
      value: stats.blocksHit,
      unit: 'blocks',
      timestamp,
    });

    // Get replication status for lag info
    const replicationStatus = await getReplicationStatus(connectionString);
    
    if (replicationStatus.isInRecovery && replicationStatus.replayLagSeconds !== undefined) {
      // This is a replica - record replication lag
      metrics.push({
        clusterId,
        nodeId,
        name: 'replication_lag',
        value: replicationStatus.replayLagSeconds * 1000, // Convert to ms
        unit: 'ms',
        timestamp,
      });
    } else if (!replicationStatus.isInRecovery && replicationStatus.replicas) {
      // This is a primary - record replica count
      metrics.push({
        clusterId,
        nodeId,
        name: 'replica_count',
        value: replicationStatus.replicas.length,
        unit: 'count',
        timestamp,
      });
    }

  } catch (error) {
    console.error(`Error collecting metrics for node ${nodeId}:`, error);
  }

  return metrics;
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get('clusterId');
    const nodeId = searchParams.get('nodeId');
    const metricName = searchParams.get('name');
    const hours = parseInt(searchParams.get('hours') || '24', 10);
    const realtime = searchParams.get('realtime') === 'true';

    if (!clusterId) {
      return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
    }

    // If realtime=true, collect fresh metrics from database
    if (realtime) {
      const nodes = await prisma.node.findMany({
        where: {
          clusterId,
          connectionString: { not: null },
          ...(nodeId && { id: nodeId }),
        },
      });

      const allMetrics: Array<{
        clusterId: string;
        nodeId: string;
        name: string;
        value: number;
        unit: string;
        timestamp: Date;
      }> = [];

      for (const node of nodes) {
        if (node.connectionString) {
          const nodeMetrics = await collectRealMetrics(
            clusterId,
            node.id,
            node.connectionString
          );
          allMetrics.push(...nodeMetrics);
        }
      }

      // Store the collected metrics
      if (allMetrics.length > 0) {
        await prisma.metric.createMany({
          data: allMetrics,
        });
      }

      return NextResponse.json(allMetrics);
    }

    // Return historical metrics from database
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const metrics = await prisma.metric.findMany({
      where: {
        clusterId,
        ...(nodeId && { nodeId }),
        ...(metricName && { name: metricName }),
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'asc' },
    });

    return NextResponse.json(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { clusterId, nodeId, name, value, unit } = body;

    if (!clusterId || !name || value === undefined) {
      return NextResponse.json({ error: 'clusterId, name, and value are required' }, { status: 400 });
    }

    const metric = await prisma.metric.create({
      data: { clusterId, nodeId, name, value, unit },
    });

    return NextResponse.json(metric);
  } catch (error) {
    console.error('Error creating metric:', error);
    return NextResponse.json({ error: 'Failed to create metric' }, { status: 500 });
  }
}
