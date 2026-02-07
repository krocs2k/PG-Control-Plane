export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

// Generate simulated LSN
function generateLSN(): string {
  const segment = Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
  const offset = Math.floor(Math.random() * 16777216).toString(16).padStart(8, '0').toUpperCase();
  return `0/${segment}${offset}`;
}

// Parse LSN to bytes for lag calculation
function lsnToBytes(lsn: string): bigint {
  const parts = lsn.split('/');
  const segment = parseInt(parts[0], 16);
  const offset = parseInt(parts[1], 16);
  return BigInt(segment) * BigInt(0x100000000) + BigInt(offset);
}

function generateReplicationSlots(clusterId: string, nodes: any[]) {
  return nodes
    .filter(n => n.role === 'REPLICA')
    .map((node, idx) => {
      const active = Math.random() > 0.1;
      const restartLsn = generateLSN();
      const confirmedLsn = active ? generateLSN() : null;
      
      return {
        id: `slot-${idx}-${clusterId}`,
        clusterId,
        nodeId: node.id,
        slotName: `replica_slot_${idx + 1}`,
        slotType: 'physical',
        database: null,
        active,
        restartLsn,
        confirmedFlushLsn: confirmedLsn,
        walStatus: active ? 'streaming' : 'reserved',
        safeWalSize: BigInt(Math.floor(Math.random() * 1073741824)),
        retainedWal: BigInt(Math.floor(Math.random() * 104857600)),
        catalogXmin: null,
      };
    });
}

function generateReplicationLag(clusterId: string, nodes: any[]) {
  const primaryLsn = generateLSN();
  const primaryBytes = lsnToBytes(primaryLsn);
  
  return nodes
    .filter(n => n.role === 'REPLICA')
    .map((node, idx) => {
      const lagMs = Math.random() * 5000;
      const replayBytes = primaryBytes - BigInt(Math.floor(lagMs * 1000));
      const replayLsn = `0/${replayBytes.toString(16).toUpperCase().padStart(8, '0')}`;
      
      return {
        id: `lag-${idx}-${clusterId}`,
        clusterId,
        nodeId: node.id,
        nodeName: node.name,
        replayLag: lagMs / 1000,
        writeLag: lagMs / 1000 * 0.8,
        flushLag: lagMs / 1000 * 0.9,
        sentLsn: primaryLsn,
        writeLsn: replayLsn,
        flushLsn: replayLsn,
        replayLsn,
        walBytes: primaryBytes - lsnToBytes(replayLsn),
        syncState: node.priority === 1 ? 'sync' : 'async',
        syncPriority: node.priority,
        timestamp: new Date(),
      };
    });
}

function generateWalActivity(clusterId: string, nodeId: string) {
  return {
    id: `wal-${clusterId}-${nodeId}`,
    clusterId,
    nodeId,
    currentLsn: generateLSN(),
    walWrite: BigInt(Math.floor(Math.random() * 10737418240)),
    walSend: BigInt(Math.floor(Math.random() * 10737418240)),
    archiveCount: Math.floor(Math.random() * 1000) + 100,
    archiveFailed: Math.floor(Math.random() * 5),
    lastArchived: `000000010000000000000${Math.floor(Math.random() * 100).toString().padStart(3, '0')}`,
    lastArchivedAt: new Date(Date.now() - Math.random() * 3600000),
    lastFailed: Math.random() > 0.7 ? `000000010000000000000${Math.floor(Math.random() * 10).toString().padStart(3, '0')}` : null,
    lastFailedAt: Math.random() > 0.7 ? new Date(Date.now() - Math.random() * 86400000) : null,
    timestamp: new Date(),
  };
}

function generateLagHistory(clusterId: string, nodeId: string, hours: number = 24) {
  const history = [];
  const now = Date.now();
  const interval = (hours * 60 * 60 * 1000) / 100;
  
  for (let i = 0; i < 100; i++) {
    const baselag = Math.random() * 2;
    const spike = Math.random() > 0.95 ? Math.random() * 10 : 0;
    history.push({
      timestamp: new Date(now - (100 - i) * interval),
      replayLag: baselag + spike,
      writeLag: (baselag + spike) * 0.8,
      flushLag: (baselag + spike) * 0.9,
    });
  }
  
  return history;
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get('clusterId');
    const type = searchParams.get('type') || 'overview';
    const nodeId = searchParams.get('nodeId');

    if (!clusterId) {
      return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
    }

    // Get cluster nodes
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      include: { nodes: true },
    });

    if (!cluster) {
      return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
    }

    if (type === 'overview') {
      const slots = generateReplicationSlots(clusterId, cluster.nodes);
      const lagData = generateReplicationLag(clusterId, cluster.nodes);
      const primary = cluster.nodes.find(n => n.role === 'PRIMARY');
      const walActivity = primary ? generateWalActivity(clusterId, primary.id) : null;

      return NextResponse.json({
        cluster: {
          id: cluster.id,
          name: cluster.name,
          replicationMode: cluster.replicationMode,
        },
        nodes: cluster.nodes,
        slots: slots.map(s => ({
          ...s,
          safeWalSize: s.safeWalSize.toString(),
          retainedWal: s.retainedWal.toString(),
        })),
        lag: lagData.map(l => ({
          ...l,
          walBytes: l.walBytes.toString(),
        })),
        walActivity: walActivity ? {
          ...walActivity,
          walWrite: walActivity.walWrite.toString(),
          walSend: walActivity.walSend.toString(),
        } : null,
      });
    }

    if (type === 'slots') {
      let slots = await prisma.replicationSlot.findMany({
        where: { clusterId },
      });

      if (slots.length === 0) {
        slots = generateReplicationSlots(clusterId, cluster.nodes) as any;
      }

      return NextResponse.json(slots.map(s => ({
        ...s,
        safeWalSize: s.safeWalSize?.toString(),
        retainedWal: s.retainedWal?.toString(),
      })));
    }

    if (type === 'lag') {
      let lagData = await prisma.replicationLag.findMany({
        where: { clusterId },
        orderBy: { timestamp: 'desc' },
        take: cluster.nodes.length,
      });

      if (lagData.length === 0) {
        lagData = generateReplicationLag(clusterId, cluster.nodes) as any;
      }

      return NextResponse.json(lagData.map(l => ({
        ...l,
        walBytes: l.walBytes?.toString(),
      })));
    }

    if (type === 'lag_history' && nodeId) {
      const hours = parseInt(searchParams.get('hours') || '24');
      const history = generateLagHistory(clusterId, nodeId, hours);
      return NextResponse.json(history);
    }

    if (type === 'wal' && nodeId) {
      let walData = await prisma.walActivity.findFirst({
        where: { clusterId, nodeId },
        orderBy: { timestamp: 'desc' },
      });

      if (!walData) {
        walData = generateWalActivity(clusterId, nodeId) as any;
      }

      return NextResponse.json({
        ...walData,
        walWrite: walData?.walWrite?.toString(),
        walSend: walData?.walSend?.toString(),
      });
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
  } catch (error) {
    console.error('Error fetching replication data:', error);
    return NextResponse.json({ error: 'Failed to fetch replication data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { clusterId, action, nodeId, slotName } = body;

    if (!clusterId) {
      return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
    }

    if (action === 'create_slot') {
      if (!nodeId || !slotName) {
        return NextResponse.json({ error: 'nodeId and slotName are required' }, { status: 400 });
      }

      const slot = await prisma.replicationSlot.create({
        data: {
          clusterId,
          nodeId,
          slotName,
          slotType: body.slotType || 'physical',
          database: body.database,
          active: false,
          restartLsn: generateLSN(),
          walStatus: 'reserved',
        },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: 'ReplicationSlot',
        entityId: slot.id,
        action: 'CREATE',
        afterState: slot,
      });

      return NextResponse.json(slot);
    }

    if (action === 'drop_slot') {
      if (!slotName) {
        return NextResponse.json({ error: 'slotName is required' }, { status: 400 });
      }

      const slot = await prisma.replicationSlot.delete({
        where: {
          clusterId_slotName: { clusterId, slotName },
        },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: 'ReplicationSlot',
        entityId: slot.id,
        action: 'DELETE',
        beforeState: slot,
      });

      return NextResponse.json({ success: true });
    }

    if (action === 'record_metrics') {
      // Record current replication metrics
      const cluster = await prisma.cluster.findUnique({
        where: { id: clusterId },
        include: { nodes: true },
      });

      if (!cluster) {
        return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
      }

      const lagData = generateReplicationLag(clusterId, cluster.nodes);
      
      for (const lag of lagData) {
        await prisma.replicationLag.create({
          data: {
            clusterId,
            nodeId: lag.nodeId,
            replayLag: lag.replayLag,
            writeLag: lag.writeLag,
            flushLag: lag.flushLag,
            sentLsn: lag.sentLsn,
            writeLsn: lag.writeLsn,
            flushLsn: lag.flushLsn,
            replayLsn: lag.replayLsn,
            walBytes: lag.walBytes,
            syncState: lag.syncState,
            syncPriority: lag.syncPriority,
          },
        });
      }

      const primary = cluster.nodes.find(n => n.role === 'PRIMARY');
      if (primary) {
        const wal = generateWalActivity(clusterId, primary.id);
        await prisma.walActivity.create({
          data: {
            clusterId,
            nodeId: primary.id,
            currentLsn: wal.currentLsn,
            walWrite: wal.walWrite,
            walSend: wal.walSend,
            archiveCount: wal.archiveCount,
            archiveFailed: wal.archiveFailed,
            lastArchived: wal.lastArchived,
            lastArchivedAt: wal.lastArchivedAt,
            lastFailed: wal.lastFailed,
            lastFailedAt: wal.lastFailedAt,
          },
        });
      }

      return NextResponse.json({ success: true, recorded: lagData.length });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error processing replication action:', error);
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 });
  }
}
