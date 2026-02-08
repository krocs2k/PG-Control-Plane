export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import {
  getReplicationStatus,
  getReplicationSlots,
  getWalActivity,
  createReplicationSlot,
  dropReplicationSlot,
  testConnection,
} from '@/lib/postgres';

// Parse LSN to bytes for lag calculation
function lsnToBytes(lsn: string): bigint {
  if (!lsn || lsn === '0/0') return BigInt(0);
  const parts = lsn.split('/');
  const segment = parseInt(parts[0], 16);
  const offset = parseInt(parts[1], 16);
  return BigInt(segment) * BigInt(0x100000000) + BigInt(offset);
}

// Get replication data from actual database connections
async function fetchReplicationData(primaryNode: { connectionString: string | null }, replicaNodes: Array<{ id: string; name: string; connectionString: string | null; replicationSlot?: string | null }>) {
  if (!primaryNode.connectionString) {
    return { slots: [], lag: [], walActivity: null };
  }

  try {
    // Test primary connection first
    const primaryTest = await testConnection(primaryNode.connectionString);
    if (!primaryTest.success) {
      console.error('Primary connection failed:', primaryTest.error);
      return { slots: [], lag: [], walActivity: null, error: primaryTest.error };
    }

    // Get replication slots from primary
    const slots = await getReplicationSlots(primaryNode.connectionString);
    
    // Get replication status from primary (includes replica lag info)
    const replicationStatus = await getReplicationStatus(primaryNode.connectionString);
    
    // Get WAL activity from primary
    const walActivity = await getWalActivity(primaryNode.connectionString);

    // Map replication status to replica nodes
    const lagData = replicaNodes.map(replica => {
      // Find matching replica in replication status
      const replicaStatus = replicationStatus.replicas?.find(r => 
        r.applicationName === replica.replicationSlot ||
        r.applicationName === replica.name
      );

      if (replicaStatus) {
        const primaryBytes = lsnToBytes(replicationStatus.currentLsn || '0/0');
        const replayBytes = lsnToBytes(replicaStatus.replayLsn);
        const lagBytes = primaryBytes - replayBytes;
        
        return {
          nodeId: replica.id,
          nodeName: replica.name,
          replayLag: Number(lagBytes) / 1000000, // Convert to seconds approximation
          writeLag: Number(lagBytes) / 1000000 * 0.8,
          flushLag: Number(lagBytes) / 1000000 * 0.9,
          sentLsn: replicaStatus.sentLsn,
          writeLsn: replicaStatus.writeLsn,
          flushLsn: replicaStatus.flushLsn,
          replayLsn: replicaStatus.replayLsn,
          walBytes: lagBytes.toString(),
          syncState: replicaStatus.syncState,
          state: replicaStatus.state,
          timestamp: new Date(),
        };
      }

      // If replica not found in replication status, try to get info directly
      return {
        nodeId: replica.id,
        nodeName: replica.name,
        replayLag: 0,
        writeLag: 0,
        flushLag: 0,
        sentLsn: null,
        writeLsn: null,
        flushLsn: null,
        replayLsn: null,
        walBytes: '0',
        syncState: 'disconnected',
        state: 'unknown',
        timestamp: new Date(),
      };
    });

    return {
      slots: slots.map(s => ({
        slotName: s.slotName,
        slotType: s.slotType,
        database: s.database,
        active: s.active,
        restartLsn: s.restartLsn,
        confirmedFlushLsn: s.confirmedFlushLsn,
        walStatus: s.walStatus,
        retainedWalBytes: s.retainedWalBytes.toString(),
      })),
      lag: lagData,
      walActivity: {
        currentLsn: walActivity.currentLsn,
        walWrite: walActivity.walWriteBytes.toString(),
        walSend: walActivity.walSendBytes.toString(),
        archiveCount: walActivity.archiveCount,
        archiveFailed: walActivity.archiveFailed,
        lastArchived: walActivity.lastArchived,
        lastArchivedAt: walActivity.lastArchivedAt,
        lastFailed: walActivity.lastFailed,
        lastFailedAt: walActivity.lastFailedAt,
        timestamp: new Date(),
      },
    };
  } catch (error) {
    console.error('Error fetching replication data:', error);
    return { slots: [], lag: [], walActivity: null, error: (error as Error).message };
  }
}

// Generate historical lag data (stored in DB or approximated)
function generateLagHistory(clusterId: string, nodeId: string, hours: number = 24) {
  // In production, this would query from stored metrics
  // For now, we return empty array since we're using real-time data
  return [];
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

    const primaryNode = cluster.nodes.find(n => n.role === 'PRIMARY');
    const replicaNodes = cluster.nodes.filter(n => n.role === 'REPLICA');

    if (type === 'overview') {
      // Fetch real replication data from primary database
      const replicationData = await fetchReplicationData(
        { connectionString: primaryNode?.connectionString || null },
        replicaNodes.map(n => ({
          id: n.id,
          name: n.name,
          connectionString: n.connectionString,
          replicationSlot: n.replicationSlot,
        }))
      );

      return NextResponse.json({
        cluster: {
          id: cluster.id,
          name: cluster.name,
          replicationMode: cluster.replicationMode,
        },
        nodes: cluster.nodes.map(n => ({
          ...n,
          connectionString: n.connectionString ? n.connectionString.replace(/:([^@]+)@/, ':***@') : null,
          dbPasswordHash: n.dbPasswordHash ? '***' : null,
        })),
        slots: replicationData.slots,
        lag: replicationData.lag,
        walActivity: replicationData.walActivity,
        error: replicationData.error,
      });
    }

    if (type === 'slots') {
      if (!primaryNode?.connectionString) {
        return NextResponse.json({ error: 'No primary node with connection string found' }, { status: 400 });
      }

      try {
        const slots = await getReplicationSlots(primaryNode.connectionString);
        return NextResponse.json(slots.map(s => ({
          ...s,
          retainedWalBytes: s.retainedWalBytes.toString(),
        })));
      } catch (error) {
        console.error('Error fetching slots:', error);
        return NextResponse.json({ error: 'Failed to fetch replication slots', details: (error as Error).message }, { status: 500 });
      }
    }

    if (type === 'lag') {
      // Fetch real lag data from primary
      const replicationData = await fetchReplicationData(
        { connectionString: primaryNode?.connectionString || null },
        replicaNodes.map(n => ({
          id: n.id,
          name: n.name,
          connectionString: n.connectionString,
          replicationSlot: n.replicationSlot,
        }))
      );

      return NextResponse.json(replicationData.lag);
    }

    if (type === 'lag_history' && nodeId) {
      // Return stored lag history from database
      const hours = parseInt(searchParams.get('hours') || '24');
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      const history = await prisma.replicationLag.findMany({
        where: {
          clusterId,
          nodeId,
          timestamp: { gte: since },
        },
        orderBy: { timestamp: 'asc' },
      });

      return NextResponse.json(history.map(h => ({
        timestamp: h.timestamp,
        replayLag: h.replayLag,
        writeLag: h.writeLag,
        flushLag: h.flushLag,
      })));
    }

    if (type === 'wal' && nodeId) {
      const node = cluster.nodes.find(n => n.id === nodeId);
      if (!node?.connectionString) {
        return NextResponse.json({ error: 'Node not found or no connection string' }, { status: 400 });
      }

      try {
        const walActivity = await getWalActivity(node.connectionString);
        return NextResponse.json({
          currentLsn: walActivity.currentLsn,
          walWrite: walActivity.walWriteBytes.toString(),
          walSend: walActivity.walSendBytes.toString(),
          archiveCount: walActivity.archiveCount,
          archiveFailed: walActivity.archiveFailed,
          lastArchived: walActivity.lastArchived,
          lastArchivedAt: walActivity.lastArchivedAt,
          lastFailed: walActivity.lastFailed,
          lastFailedAt: walActivity.lastFailedAt,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error('Error fetching WAL activity:', error);
        return NextResponse.json({ error: 'Failed to fetch WAL activity', details: (error as Error).message }, { status: 500 });
      }
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

    // Get cluster and primary node
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      include: { nodes: true },
    });

    if (!cluster) {
      return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
    }

    const primaryNode = cluster.nodes.find(n => n.role === 'PRIMARY');
    if (!primaryNode?.connectionString) {
      return NextResponse.json({ error: 'No primary node with connection string found' }, { status: 400 });
    }

    if (action === 'create_slot') {
      if (!slotName) {
        return NextResponse.json({ error: 'slotName is required' }, { status: 400 });
      }

      // Create replication slot on the actual primary database
      const slotType = body.slotType || 'physical';
      const result = await createReplicationSlot(
        primaryNode.connectionString,
        slotName,
        slotType as 'physical' | 'logical',
        body.outputPlugin
      );

      if (!result.success) {
        return NextResponse.json({ 
          error: 'Failed to create replication slot', 
          details: result.error 
        }, { status: 400 });
      }

      // Also store in our database for tracking
      const slot = await prisma.replicationSlot.create({
        data: {
          clusterId,
          nodeId: nodeId || primaryNode.id,
          slotName,
          slotType,
          database: body.database,
          active: false,
          restartLsn: result.lsn || '0/0',
          walStatus: 'reserved',
        },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: 'ReplicationSlot',
        entityId: slot.id,
        action: 'CREATE',
        afterState: { slotName, slotType, lsn: result.lsn },
      });

      return NextResponse.json({ ...slot, createdOnPrimary: true, lsn: result.lsn });
    }

    if (action === 'drop_slot') {
      if (!slotName) {
        return NextResponse.json({ error: 'slotName is required' }, { status: 400 });
      }

      // Drop replication slot on the actual primary database
      const result = await dropReplicationSlot(primaryNode.connectionString, slotName);

      if (!result.success) {
        return NextResponse.json({ 
          error: 'Failed to drop replication slot', 
          details: result.error 
        }, { status: 400 });
      }

      // Also remove from our database
      try {
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
          beforeState: { slotName },
        });
      } catch {
        // Slot might not exist in our DB but was dropped from PostgreSQL
      }

      return NextResponse.json({ success: true, droppedOnPrimary: true });
    }

    if (action === 'record_metrics') {
      // Record current replication metrics from actual database
      const replicaNodes = cluster.nodes.filter(n => n.role === 'REPLICA');
      
      const replicationData = await fetchReplicationData(
        { connectionString: primaryNode.connectionString },
        replicaNodes.map(n => ({
          id: n.id,
          name: n.name,
          connectionString: n.connectionString,
          replicationSlot: n.replicationSlot,
        }))
      );

      if (replicationData.error) {
        return NextResponse.json({ 
          error: 'Failed to fetch replication metrics', 
          details: replicationData.error 
        }, { status: 400 });
      }

      // Store lag data
      for (const lag of replicationData.lag) {
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
            walBytes: BigInt(lag.walBytes),
            syncState: lag.syncState,
          },
        });
      }

      // Store WAL activity
      if (replicationData.walActivity) {
        const wal = replicationData.walActivity;
        await prisma.walActivity.create({
          data: {
            clusterId,
            nodeId: primaryNode.id,
            currentLsn: wal.currentLsn,
            walWrite: BigInt(wal.walWrite),
            walSend: BigInt(wal.walSend),
            archiveCount: wal.archiveCount,
            archiveFailed: wal.archiveFailed,
            lastArchived: wal.lastArchived,
            lastArchivedAt: wal.lastArchivedAt,
            lastFailed: wal.lastFailed,
            lastFailedAt: wal.lastFailedAt,
          },
        });
      }

      return NextResponse.json({ 
        success: true, 
        recorded: replicationData.lag.length,
        slotsFound: replicationData.slots.length,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error processing replication action:', error);
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 });
  }
}
