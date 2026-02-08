export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { hasPermission } from '@/lib/types';
import bcrypt from 'bcryptjs';

// Parse PostgreSQL connection string
function parseConnectionString(connStr: string): {
  host: string;
  port: number;
  database?: string;
  user?: string;
  password?: string;
  sslMode?: string;
} | null {
  try {
    // Handle postgres:// or postgresql:// format
    const regex = /^postgres(?:ql)?:\/\/(?:([^:]+):([^@]+)@)?([^:/]+):?(\d+)?(?:\/([^?]+))?(?:\?(.*))?$/;
    const match = connStr.match(regex);
    
    if (!match) return null;
    
    const [, user, password, host, port, database, queryString] = match;
    const params: Record<string, string> = {};
    
    if (queryString) {
      queryString.split('&').forEach((param) => {
        const [key, value] = param.split('=');
        params[key] = decodeURIComponent(value);
      });
    }
    
    return {
      host,
      port: port ? parseInt(port, 10) : 5432,
      database,
      user,
      password,
      sslMode: params.sslmode || params.ssl_mode || 'require',
    };
  } catch {
    return null;
  }
}

// Build connection string from components
function buildConnectionString(
  host: string,
  port: number,
  database?: string,
  user?: string,
  password?: string,
  sslMode?: string
): string {
  let connStr = 'postgresql://';
  if (user) {
    connStr += encodeURIComponent(user);
    if (password) {
      connStr += ':' + encodeURIComponent(password);
    }
    connStr += '@';
  }
  connStr += `${host}:${port}`;
  if (database) {
    connStr += '/' + database;
  }
  if (sslMode) {
    connStr += `?sslmode=${sslMode}`;
  }
  return connStr;
}

// Simulate connection test (in production, would use pg library)
async function testDatabaseConnection(
  connectionString: string
): Promise<{ success: boolean; error?: string; pgVersion?: string }> {
  // Simulated connection test
  // In production, you would use the 'pg' library to actually connect
  const parsed = parseConnectionString(connectionString);
  if (!parsed) {
    return { success: false, error: 'Invalid connection string format' };
  }
  
  // Simulate connection delay
  await new Promise((resolve) => setTimeout(resolve, 500));
  
  // Simulate success/failure (in production, actually test connection)
  // For demo, check if host looks valid
  if (!parsed.host || parsed.host === 'invalid') {
    return { success: false, error: 'Could not resolve hostname' };
  }
  
  if (!parsed.user) {
    return { success: false, error: 'Authentication credentials required' };
  }
  
  // Simulate successful connection with version
  return {
    success: true,
    pgVersion: '15.4',
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

        // Update sync status to syncing
        await prisma.node.update({
          where: { id: nodeId },
          data: { syncStatus: 'SYNCING' },
        });

        // Simulate sync process (in production, would perform actual sync)
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Update to synced
        const updatedNode = await prisma.node.update({
          where: { id: nodeId },
          data: {
            syncStatus: 'SYNCED',
            lastSyncAt: new Date(),
            syncError: null,
          },
        });

        await createAuditLog({
          userId: session.user.id,
          entityType: 'Node',
          entityId: nodeId,
          action: 'SYNC',
          afterState: { syncStatus: 'SYNCED' },
        });

        return NextResponse.json({
          success: true,
          syncStatus: updatedNode.syncStatus,
          lastSyncAt: updatedNode.lastSyncAt,
        });
      }

      case 'setup-replication': {
        // Setup replication slot
        const slotName = `replica_${node.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        
        const updatedNode = await prisma.node.update({
          where: { id: nodeId },
          data: {
            replicationEnabled: true,
            replicationSlot: slotName,
          },
        });

        await createAuditLog({
          userId: session.user.id,
          entityType: 'Node',
          entityId: nodeId,
          action: 'SETUP_REPLICATION',
          afterState: { replicationSlot: slotName },
        });

        return NextResponse.json({
          success: true,
          replicationSlot: slotName,
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
