export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { hasPermission } from '@/lib/types';
import bcrypt from 'bcryptjs';
import {
  parseConnectionString,
  buildConnectionString,
  testConnection,
  compareSchemas,
  syncData,
  createReplicationSlot,
  getReplicationStatus,
  getDatabaseStats,
} from '@/lib/postgres';

// Wrapper for testConnection that returns expected format
async function testDatabaseConnection(
  connectionString: string
): Promise<{ success: boolean; error?: string; pgVersion?: string }> {
  const result = await testConnection(connectionString);
  return {
    success: result.success,
    error: result.error,
    pgVersion: result.pgVersion,
  };
}

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

    // Mask sensitive data
    const sanitizedNodes = nodes.map((node) => ({
      ...node,
      dbPasswordHash: node.dbPasswordHash ? '***' : null,
      connectionString: node.connectionString
        ? node.connectionString.replace(/:([^@]+)@/, ':***@')
        : null,
    }));

    return NextResponse.json(sanitizedNodes);
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
    const {
      name,
      clusterId,
      connectionString,
      dbUser,
      dbPassword,
      role,
      sslEnabled,
      sslMode,
      syncEnabled,
      replicationEnabled,
      testConnection,
    } = body ?? {};

    if (!name || !clusterId || !connectionString) {
      return NextResponse.json(
        { error: 'Name, clusterId, and connectionString are required' },
        { status: 400 }
      );
    }

    // Parse the connection string
    const parsed = parseConnectionString(connectionString);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid connection string format. Use: postgresql://user:password@host:port/database' },
        { status: 400 }
      );
    }

    // Use credentials from connection string or provided separately
    const finalUser = dbUser || parsed.user;
    const finalPassword = dbPassword || parsed.password;
    
    if (!finalUser || !finalPassword) {
      return NextResponse.json(
        { error: 'Database credentials are required for authentication' },
        { status: 400 }
      );
    }

    // Build the full connection string with credentials
    const fullConnectionString = buildConnectionString(
      parsed.host,
      parsed.port,
      parsed.database,
      finalUser,
      finalPassword,
      sslMode || parsed.sslMode || 'require'
    );

    // Test connection if requested
    let connectionVerified = false;
    let connectionError: string | null = null;
    let pgVersion: string | null = null;

    if (testConnection !== false) {
      const testResult = await testDatabaseConnection(fullConnectionString);
      connectionVerified = testResult.success;
      connectionError = testResult.error || null;
      pgVersion = testResult.pgVersion || null;

      if (!testResult.success) {
        return NextResponse.json(
          {
            error: 'Connection test failed',
            details: testResult.error,
            allowForce: true,
          },
          { status: 400 }
        );
      }
    }

    // Hash the password for storage
    const passwordHash = await bcrypt.hash(finalPassword, 10);

    const node = await prisma.node.create({
      data: {
        name,
        clusterId,
        host: parsed.host,
        port: parsed.port,
        connectionString: fullConnectionString,
        dbUser: finalUser,
        dbPasswordHash: passwordHash,
        sslEnabled: sslEnabled !== false,
        sslMode: sslMode || parsed.sslMode || 'require',
        role: role || 'REPLICA',
        status: connectionVerified ? 'ONLINE' : 'OFFLINE',
        connectionVerified,
        lastConnectionTest: connectionVerified ? new Date() : null,
        connectionError,
        pgVersion,
        syncEnabled: syncEnabled || false,
        syncStatus: syncEnabled ? 'PENDING' : 'NOT_CONFIGURED',
        replicationEnabled: replicationEnabled !== false,
      },
    });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Node',
      entityId: node.id,
      action: 'CREATE',
      afterState: { ...node, dbPasswordHash: '[REDACTED]', connectionString: '[REDACTED]' },
    });

    // Return sanitized node
    return NextResponse.json({
      ...node,
      dbPasswordHash: '***',
      connectionString: fullConnectionString.replace(/:([^@]+)@/, ':***@'),
    });
  } catch (error) {
    console.error('Error creating node:', error);
    return NextResponse.json({ error: 'Failed to create node' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.role, 'OPERATOR')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { nodeId, action, ...params } = body ?? {};

    if (!nodeId) {
      return NextResponse.json({ error: 'nodeId is required' }, { status: 400 });
    }

    const node = await prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    switch (action) {
      case 'test-connection': {
        // Re-test connection using stored credentials
        if (!node.connectionString) {
          return NextResponse.json({ error: 'No connection string configured' }, { status: 400 });
        }

        const testResult = await testDatabaseConnection(node.connectionString);
        
        await prisma.node.update({
          where: { id: nodeId },
          data: {
            connectionVerified: testResult.success,
            lastConnectionTest: new Date(),
            connectionError: testResult.error || null,
            status: testResult.success ? 'ONLINE' : 'OFFLINE',
            pgVersion: testResult.pgVersion || node.pgVersion,
          },
        });

        return NextResponse.json({
          success: testResult.success,
          error: testResult.error,
          pgVersion: testResult.pgVersion,
        });
      }

      case 'sync': {
        if (!node.syncEnabled) {
          return NextResponse.json({ error: 'Sync is not enabled for this node' }, { status: 400 });
        }

        if (!node.connectionString) {
          return NextResponse.json({ error: 'No connection string configured. Authentication required for sync.' }, { status: 400 });
        }

        // Get the cluster's primary node for source connection
        const cluster = await prisma.cluster.findUnique({
          where: { id: node.clusterId },
          include: { nodes: true },
        });

        if (!cluster) {
          return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
        }

        const primaryNode = cluster.nodes.find(n => n.role === 'PRIMARY');
        if (!primaryNode || !primaryNode.connectionString) {
          return NextResponse.json({ error: 'No primary node with connection string found in cluster' }, { status: 400 });
        }

        // Test connection to this node (target) using stored credentials
        const targetConnectionTest = await testDatabaseConnection(node.connectionString);
        if (!targetConnectionTest.success) {
          await prisma.node.update({
            where: { id: nodeId },
            data: {
              syncStatus: 'FAILED',
              syncError: `Target authentication failed: ${targetConnectionTest.error}`,
            },
          });
          return NextResponse.json({ 
            error: 'Sync failed: Unable to authenticate with target database', 
            details: targetConnectionTest.error 
          }, { status: 400 });
        }

        // Test connection to primary (source)
        const sourceConnectionTest = await testDatabaseConnection(primaryNode.connectionString);
        if (!sourceConnectionTest.success) {
          await prisma.node.update({
            where: { id: nodeId },
            data: {
              syncStatus: 'FAILED',
              syncError: `Source (primary) authentication failed: ${sourceConnectionTest.error}`,
            },
          });
          return NextResponse.json({ 
            error: 'Sync failed: Unable to authenticate with primary database', 
            details: sourceConnectionTest.error 
          }, { status: 400 });
        }

        // Update sync status to syncing
        await prisma.node.update({
          where: { id: nodeId },
          data: { syncStatus: 'SYNCING', syncError: null },
        });

        try {
          // Compare schemas between primary and this node
          const schemaComparison = await compareSchemas(
            primaryNode.connectionString,
            node.connectionString
          );

          // Perform data sync from primary to this node
          const syncResult = await syncData(
            primaryNode.connectionString,
            node.connectionString,
            { fullSync: true }
          );

          if (!syncResult.success) {
            await prisma.node.update({
              where: { id: nodeId },
              data: {
                syncStatus: 'FAILED',
                syncError: syncResult.error || 'Data sync failed',
              },
            });
            return NextResponse.json({ 
              error: 'Data sync failed', 
              details: syncResult.error 
            }, { status: 400 });
          }

          // Update to synced
          const updatedNode = await prisma.node.update({
            where: { id: nodeId },
            data: {
              syncStatus: 'SYNCED',
              lastSyncAt: new Date(),
              syncError: null,
              connectionVerified: true,
              lastConnectionTest: new Date(),
              pgVersion: targetConnectionTest.pgVersion,
            },
          });

          await createAuditLog({
            userId: session.user.id,
            entityType: 'Node',
            entityId: nodeId,
            action: 'SYNC',
            afterState: { 
              syncStatus: 'SYNCED', 
              tablesSync: syncResult.tablesSync,
              rowsCopied: syncResult.rowsCopied,
              schemaDifferences: schemaComparison.differences.length,
            },
          });

          return NextResponse.json({
            success: true,
            syncStatus: updatedNode.syncStatus,
            lastSyncAt: updatedNode.lastSyncAt,
            tablesSync: syncResult.tablesSync,
            rowsCopied: syncResult.rowsCopied,
            schemaDifferences: schemaComparison.differences,
            authenticated: true,
          });
        } catch (syncError) {
          const err = syncError as Error;
          await prisma.node.update({
            where: { id: nodeId },
            data: {
              syncStatus: 'FAILED',
              syncError: err.message,
            },
          });
          return NextResponse.json({ 
            error: 'Sync operation failed', 
            details: err.message 
          }, { status: 500 });
        }
      }

      case 'setup-replication': {
        if (!node.connectionString) {
          return NextResponse.json({ error: 'Connection string required for replication setup. Authentication needed.' }, { status: 400 });
        }

        // Get the cluster's primary node
        const cluster = await prisma.cluster.findUnique({
          where: { id: node.clusterId },
          include: { nodes: true },
        });

        if (!cluster) {
          return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
        }

        const primaryNode = cluster.nodes.find(n => n.role === 'PRIMARY');
        if (!primaryNode || !primaryNode.connectionString) {
          return NextResponse.json({ error: 'No primary node with connection string found in cluster' }, { status: 400 });
        }

        // Test connection to primary
        const primaryConnectionTest = await testDatabaseConnection(primaryNode.connectionString);
        if (!primaryConnectionTest.success) {
          return NextResponse.json({ 
            error: 'Replication setup failed: Unable to authenticate with primary database', 
            details: primaryConnectionTest.error 
          }, { status: 400 });
        }

        // Test connection to this replica
        const replicaConnectionTest = await testDatabaseConnection(node.connectionString);
        if (!replicaConnectionTest.success) {
          return NextResponse.json({ 
            error: 'Replication setup failed: Unable to authenticate with replica database', 
            details: replicaConnectionTest.error 
          }, { status: 400 });
        }

        // Generate slot name
        const slotName = `replica_${node.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

        // Create replication slot on primary
        const slotResult = await createReplicationSlot(primaryNode.connectionString, slotName, 'physical');
        
        if (!slotResult.success && !slotResult.error?.includes('already exists')) {
          return NextResponse.json({ 
            error: 'Failed to create replication slot on primary', 
            details: slotResult.error 
          }, { status: 400 });
        }

        // Get replication status from primary
        const replicationStatus = await getReplicationStatus(primaryNode.connectionString);
        
        const updatedNode = await prisma.node.update({
          where: { id: nodeId },
          data: {
            replicationEnabled: true,
            replicationSlot: slotName,
            connectionVerified: true,
            lastConnectionTest: new Date(),
            pgVersion: replicaConnectionTest.pgVersion,
          },
        });

        await createAuditLog({
          userId: session.user.id,
          entityType: 'Node',
          entityId: nodeId,
          action: 'SETUP_REPLICATION',
          afterState: { 
            replicationSlot: slotName,
            slotCreated: slotResult.success,
            primaryLsn: replicationStatus.currentLsn,
          },
        });

        return NextResponse.json({
          success: true,
          replicationSlot: slotName,
          slotCreated: slotResult.success || slotResult.error?.includes('already exists'),
          primaryLsn: replicationStatus.currentLsn,
          authenticated: true,
        });
      }

      case 'toggle-sync': {
        const enabled = params.enabled ?? !node.syncEnabled;
        const updatedNode = await prisma.node.update({
          where: { id: nodeId },
          data: {
            syncEnabled: enabled,
            syncStatus: enabled ? 'PENDING' : 'NOT_CONFIGURED',
          },
        });

        return NextResponse.json({
          success: true,
          syncEnabled: updatedNode.syncEnabled,
          syncStatus: updatedNode.syncStatus,
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in node action:', error);
    return NextResponse.json({ error: 'Failed to execute action' }, { status: 500 });
  }
}
