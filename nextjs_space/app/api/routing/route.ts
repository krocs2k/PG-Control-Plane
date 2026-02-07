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

    if (!clusterId) {
      return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
    }

    // Get routing config
    let config = await prisma.routingConfig.findUnique({
      where: { clusterId },
    });

    // Create default config if not exists
    if (!config) {
      config = await prisma.routingConfig.create({
        data: {
          clusterId,
          readWriteSplit: true,
          primaryWeight: 100,
          healthThreshold: 80,
          lagThreshold: 100,
          connectionLimit: 1000,
        },
      });
    }

    // Get nodes with their weights
    const nodes = await prisma.node.findMany({
      where: { clusterId },
    });

    return NextResponse.json({
      config,
      nodes: nodes.map(n => ({
        id: n.id,
        name: n.name,
        role: n.role,
        status: n.status,
        routingWeight: n.routingWeight,
        priority: n.priority,
      })),
    });
  } catch (error) {
    console.error('Error fetching routing config:', error);
    return NextResponse.json({ error: 'Failed to fetch routing config' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { clusterId, action } = body;

    if (!clusterId) {
      return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
    }

    // Handle simulation action
    if (action === 'simulate') {
      const simulation = await runRoutingSimulation(clusterId, body.duration || 60, body.loadProfile);
      return NextResponse.json(simulation);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in routing operation:', error);
    return NextResponse.json({ error: 'Failed to execute operation' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { clusterId, ...updates } = body;

    if (!clusterId) {
      return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
    }

    // Update node weights
    if (updates.nodeWeights) {
      for (const [nodeId, weight] of Object.entries(updates.nodeWeights)) {
        await prisma.node.update({
          where: { id: nodeId },
          data: { routingWeight: weight as number },
        });
      }
    }

    // Update routing config
    const configUpdates: any = {};
    if (updates.readWriteSplit !== undefined) configUpdates.readWriteSplit = updates.readWriteSplit;
    if (updates.primaryWeight !== undefined) configUpdates.primaryWeight = updates.primaryWeight;
    if (updates.healthThreshold !== undefined) configUpdates.healthThreshold = updates.healthThreshold;
    if (updates.lagThreshold !== undefined) configUpdates.lagThreshold = updates.lagThreshold;
    if (updates.connectionLimit !== undefined) configUpdates.connectionLimit = updates.connectionLimit;

    if (Object.keys(configUpdates).length > 0) {
      await prisma.routingConfig.upsert({
        where: { clusterId },
        update: configUpdates,
        create: { clusterId, ...configUpdates },
      });
    }

    await createAuditLog({
      userId: session.user.id,
      entityType: 'RoutingConfig',
      entityId: clusterId,
      action: 'UPDATED',
      afterState: updates,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating routing config:', error);
    return NextResponse.json({ error: 'Failed to update routing config' }, { status: 500 });
  }
}

async function runRoutingSimulation(clusterId: string, durationSeconds: number, loadProfile?: string) {
  const nodes = await prisma.node.findMany({ where: { clusterId } });
  const config = await prisma.routingConfig.findUnique({ where: { clusterId } });

  const primary = nodes.find(n => n.role === 'PRIMARY');
  const replicas = nodes.filter(n => n.role === 'REPLICA' && n.status === 'ONLINE');

  const totalReplicaWeight = replicas.reduce((sum, r) => sum + r.routingWeight, 0);

  // Generate simulation data
  const timepoints: any[] = [];
  const connectionsPerSecond = loadProfile === 'spike' ? 500 : loadProfile === 'steady' ? 200 : 300;
  const readWriteRatio = 0.8; // 80% reads

  for (let t = 0; t < durationSeconds; t += 5) {
    const variability = loadProfile === 'spike' && t > 20 && t < 40 ? 2.5 : 1;
    const totalConnections = Math.floor(connectionsPerSecond * variability * (0.8 + Math.random() * 0.4));
    const reads = Math.floor(totalConnections * readWriteRatio);
    const writes = totalConnections - reads;

    const nodeDistribution: any = {};

    // All writes go to primary
    if (primary) {
      nodeDistribution[primary.id] = {
        name: primary.name,
        role: 'PRIMARY',
        connections: writes,
        latencyMs: 5 + Math.random() * 10,
        cpuPercent: 20 + (writes / connectionsPerSecond) * 40,
      };
    }

    // Distribute reads based on weights
    if (config?.readWriteSplit && replicas.length > 0) {
      let remainingReads = reads;
      replicas.forEach((replica, i) => {
        const share = replica.routingWeight / totalReplicaWeight;
        const replicaReads = i === replicas.length - 1 ? remainingReads : Math.floor(reads * share);
        remainingReads -= replicaReads;

        nodeDistribution[replica.id] = {
          name: replica.name,
          role: 'REPLICA',
          connections: replicaReads,
          latencyMs: 3 + Math.random() * 8,
          cpuPercent: 15 + (replicaReads / connectionsPerSecond) * 35,
          lagMs: Math.random() * (config?.lagThreshold || 100),
        };
      });
    } else if (primary) {
      // No read-write split, all go to primary
      nodeDistribution[primary.id].connections += reads;
      nodeDistribution[primary.id].cpuPercent += 20;
    }

    timepoints.push({
      time: t,
      totalConnections,
      reads,
      writes,
      nodeDistribution,
    });
  }

  // Calculate aggregates
  const aggregates = {
    totalConnections: timepoints.reduce((sum, t) => sum + t.totalConnections, 0),
    avgLatencyMs: timepoints.reduce((sum, t) => {
      const latencies = Object.values(t.nodeDistribution).map((n: any) => n.latencyMs);
      return sum + latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length;
    }, 0) / timepoints.length,
    peakConnections: Math.max(...timepoints.map(t => t.totalConnections)),
    readWriteRatio: `${Math.round(readWriteRatio * 100)}:${Math.round((1 - readWriteRatio) * 100)}`,
  };

  return {
    clusterId,
    durationSeconds,
    loadProfile: loadProfile || 'normal',
    config,
    nodes: nodes.map(n => ({ id: n.id, name: n.name, role: n.role, weight: n.routingWeight })),
    timepoints,
    aggregates,
  };
}
