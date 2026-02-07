import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

// GET - Get connection pool config and stats
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get('clusterId');

    if (!clusterId) {
      return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
    }

    // Get or create connection pool config
    let pool = await prisma.connectionPool.findUnique({
      where: { clusterId },
    });

    if (!pool) {
      pool = await prisma.connectionPool.create({
        data: { clusterId },
      });
    }

    // Generate simulated stats
    const stats = generatePoolStats(pool);

    return NextResponse.json({
      config: pool,
      stats,
    });
  } catch (error) {
    console.error('Connection pools GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch connection pool' }, { status: 500 });
  }
}

// POST - Perform pool action (pause, resume, reload, reset)
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { clusterId, action } = body;

    if (!clusterId || !action) {
      return NextResponse.json({ error: 'clusterId and action are required' }, { status: 400 });
    }

    const pool = await prisma.connectionPool.findUnique({
      where: { clusterId },
    });

    if (!pool) {
      return NextResponse.json({ error: 'Connection pool not found' }, { status: 404 });
    }

    let result: { success: boolean; message: string; action: string };

    switch (action) {
      case 'pause':
        await prisma.connectionPool.update({
          where: { clusterId },
          data: { enabled: false },
        });
        result = { success: true, message: 'Connection pool paused', action };
        break;

      case 'resume':
        await prisma.connectionPool.update({
          where: { clusterId },
          data: { enabled: true },
        });
        result = { success: true, message: 'Connection pool resumed', action };
        break;

      case 'reload':
        // In a real system, this would reload the pooler config
        result = { success: true, message: 'Configuration reloaded', action };
        break;

      case 'reset':
        // Reset stats (in a real system, this would reset pooler stats)
        await prisma.connectionPool.update({
          where: { clusterId },
          data: {
            stats: null,
            lastStatsUpdate: new Date(),
          },
        });
        result = { success: true, message: 'Statistics reset', action };
        break;

      case 'kill_connections':
        // In a real system, this would kill idle connections
        result = { success: true, message: 'Idle connections terminated', action };
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    await createAuditLog({
      userId: session.user?.id,
      entityType: 'ConnectionPool',
      entityId: pool.id,
      action: `POOL_${action.toUpperCase()}`,
      afterState: result,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Connection pools POST error:', error);
    return NextResponse.json({ error: 'Failed to perform pool action' }, { status: 500 });
  }
}

// PATCH - Update connection pool configuration
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { clusterId, ...updates } = body;

    if (!clusterId) {
      return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
    }

    const pool = await prisma.connectionPool.findUnique({
      where: { clusterId },
    });

    if (!pool) {
      return NextResponse.json({ error: 'Connection pool not found' }, { status: 404 });
    }

    // Validate updates
    const allowedFields = [
      'enabled', 'poolerType', 'poolMode', 'maxClientConn', 'defaultPoolSize',
      'minPoolSize', 'reservePoolSize', 'reservePoolTimeout', 'maxDbConnections',
      'serverIdleTimeout', 'clientIdleTimeout', 'queryTimeout', 'serverResetQuery',
      'serverCheckQuery'
    ];

    const filteredUpdates: Record<string, unknown> = {};
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    }

    const updated = await prisma.connectionPool.update({
      where: { clusterId },
      data: filteredUpdates,
    });

    await createAuditLog({
      userId: session.user?.id,
      entityType: 'ConnectionPool',
      entityId: pool.id,
      action: 'UPDATE_POOL_CONFIG',
      beforeState: pool,
      afterState: updated,
    });

    return NextResponse.json({ config: updated });
  } catch (error) {
    console.error('Connection pools PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update connection pool' }, { status: 500 });
  }
}

// Generate simulated pool statistics
function generatePoolStats(pool: {
  enabled: boolean;
  maxClientConn: number;
  defaultPoolSize: number;
  minPoolSize: number;
  reservePoolSize: number;
  maxDbConnections: number;
}) {
  const baseActiveClients = pool.enabled ? Math.floor(pool.maxClientConn * (0.3 + Math.random() * 0.4)) : 0;
  const baseActiveServers = pool.enabled ? Math.floor(pool.defaultPoolSize * (0.4 + Math.random() * 0.3)) : 0;

  return {
    // Overall stats
    totalClients: baseActiveClients + Math.floor(Math.random() * 50),
    activeClients: baseActiveClients,
    waitingClients: pool.enabled ? Math.floor(Math.random() * 10) : 0,
    totalServers: pool.maxDbConnections,
    activeServers: baseActiveServers,
    idleServers: pool.enabled ? pool.defaultPoolSize - baseActiveServers : 0,
    usedServers: baseActiveServers,

    // Performance metrics
    avgQueryTime: pool.enabled ? (Math.random() * 50 + 5).toFixed(2) : '0',
    avgWaitTime: pool.enabled ? (Math.random() * 10).toFixed(2) : '0',
    totalQueries: pool.enabled ? Math.floor(Math.random() * 1000000) + 100000 : 0,
    totalTransactions: pool.enabled ? Math.floor(Math.random() * 500000) + 50000 : 0,
    totalReceived: pool.enabled ? Math.floor(Math.random() * 10000000000) : 0,
    totalSent: pool.enabled ? Math.floor(Math.random() * 50000000000) : 0,

    // Pool utilization
    clientUtilization: pool.enabled ? ((baseActiveClients / pool.maxClientConn) * 100).toFixed(1) : '0',
    serverUtilization: pool.enabled ? ((baseActiveServers / pool.defaultPoolSize) * 100).toFixed(1) : '0',

    // Per-database stats
    databases: pool.enabled ? [
      {
        name: 'postgres',
        host: 'primary',
        port: 5432,
        database: 'postgres',
        currentConnections: Math.floor(baseActiveServers * 0.6),
        maxConnections: Math.floor(pool.maxDbConnections * 0.6),
        poolSize: Math.floor(pool.defaultPoolSize * 0.6),
        minPoolSize: Math.floor(pool.minPoolSize * 0.6),
        reservePool: Math.floor(pool.reservePoolSize * 0.6),
      },
      {
        name: 'app_db',
        host: 'primary',
        port: 5432,
        database: 'app_db',
        currentConnections: Math.floor(baseActiveServers * 0.3),
        maxConnections: Math.floor(pool.maxDbConnections * 0.3),
        poolSize: Math.floor(pool.defaultPoolSize * 0.3),
        minPoolSize: Math.floor(pool.minPoolSize * 0.3),
        reservePool: Math.floor(pool.reservePoolSize * 0.3),
      },
      {
        name: 'analytics',
        host: 'replica-1',
        port: 5432,
        database: 'analytics',
        currentConnections: Math.floor(baseActiveServers * 0.1),
        maxConnections: Math.floor(pool.maxDbConnections * 0.1),
        poolSize: Math.floor(pool.defaultPoolSize * 0.1),
        minPoolSize: Math.floor(pool.minPoolSize * 0.1),
        reservePool: Math.floor(pool.reservePoolSize * 0.1),
      },
    ] : [],

    // Per-user stats
    users: pool.enabled ? [
      {
        name: 'app_user',
        activeConnections: Math.floor(baseActiveClients * 0.7),
        waitingConnections: Math.floor(Math.random() * 5),
        maxConnections: Math.floor(pool.maxClientConn * 0.7),
      },
      {
        name: 'readonly_user',
        activeConnections: Math.floor(baseActiveClients * 0.2),
        waitingConnections: Math.floor(Math.random() * 2),
        maxConnections: Math.floor(pool.maxClientConn * 0.2),
      },
      {
        name: 'admin',
        activeConnections: Math.floor(baseActiveClients * 0.1),
        waitingConnections: 0,
        maxConnections: Math.floor(pool.maxClientConn * 0.1),
      },
    ] : [],

    // Timestamp
    updatedAt: new Date().toISOString(),
  };
}
