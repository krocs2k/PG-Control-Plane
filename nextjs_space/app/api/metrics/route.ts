export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

// Generate simulated metrics for a cluster
function generateSimulatedMetrics(clusterId: string, nodeId: string | null) {
  const now = new Date();
  const metrics = [];
  
  // Generate last 24 hours of metrics (hourly)
  for (let i = 24; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
    
    // CPU usage (10-80%)
    metrics.push({
      clusterId,
      nodeId,
      name: 'cpu_usage',
      value: 10 + Math.random() * 70 + (i < 3 ? 20 : 0), // Spike in recent hours
      unit: '%',
      timestamp,
    });
    
    // Memory usage (40-85%)
    metrics.push({
      clusterId,
      nodeId,
      name: 'memory_usage',
      value: 40 + Math.random() * 45,
      unit: '%',
      timestamp,
    });
    
    // Disk usage (trending up)
    metrics.push({
      clusterId,
      nodeId,
      name: 'disk_usage',
      value: 55 + (24 - i) * 0.5 + Math.random() * 5,
      unit: '%',
      timestamp,
    });
    
    // Replication lag (0-500ms for replicas)
    if (nodeId) {
      metrics.push({
        clusterId,
        nodeId,
        name: 'replication_lag',
        value: Math.random() * 100 + (i < 2 ? 400 : 0), // Spike recently
        unit: 'ms',
        timestamp,
      });
    }
    
    // Query latency p95 (5-50ms)
    metrics.push({
      clusterId,
      nodeId,
      name: 'query_latency_p95',
      value: 5 + Math.random() * 45,
      unit: 'ms',
      timestamp,
    });
    
    // TPS (100-5000)
    metrics.push({
      clusterId,
      nodeId,
      name: 'tps',
      value: 100 + Math.random() * 4900,
      unit: 'tx/s',
      timestamp,
    });
    
    // Active connections (10-200)
    metrics.push({
      clusterId,
      nodeId,
      name: 'active_connections',
      value: Math.floor(10 + Math.random() * 190),
      unit: 'conn',
      timestamp,
    });
    
    // WAL write rate (1-50 MB/s)
    metrics.push({
      clusterId,
      nodeId,
      name: 'wal_write_rate',
      value: 1 + Math.random() * 49,
      unit: 'MB/s',
      timestamp,
    });
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

    if (!clusterId) {
      return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
    }

    // Check if we have metrics, if not generate simulated ones
    const existingCount = await prisma.metric.count({
      where: { clusterId },
    });

    if (existingCount === 0) {
      // Get nodes for the cluster
      const nodes = await prisma.node.findMany({ where: { clusterId } });
      
      // Generate cluster-level metrics
      const clusterMetrics = generateSimulatedMetrics(clusterId, null);
      
      // Generate node-level metrics
      const nodeMetrics = nodes.flatMap(node => 
        generateSimulatedMetrics(clusterId, node.id)
      );
      
      // Insert all metrics
      await prisma.metric.createMany({
        data: [...clusterMetrics, ...nodeMetrics],
      });
    }

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
