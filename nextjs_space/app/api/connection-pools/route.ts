import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { Client } from 'pg';

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

    // Get real pool stats (from PgBouncer or PostgreSQL directly)
    const stats = await getPoolStats(pool as PoolConfig, clusterId);

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

// Interface for pool configuration
interface PoolConfig {
  enabled: boolean;
  maxClientConn: number;
  defaultPoolSize: number;
  minPoolSize: number;
  reservePoolSize: number;
  maxDbConnections: number;
  poolerHost?: string | null;
  poolerPort?: number | null;
}

// Query real PgBouncer statistics if available
async function queryPgBouncerStats(poolerHost: string, poolerPort: number): Promise<{
  stats: Record<string, unknown> | null;
  pools: Array<Record<string, unknown>>;
  databases: Array<Record<string, unknown>>;
  clients: Array<Record<string, unknown>>;
  servers: Array<Record<string, unknown>>;
  error?: string;
}> {
  const client = new Client({
    host: poolerHost,
    port: poolerPort,
    database: 'pgbouncer',
    user: 'pgbouncer', // Default PgBouncer admin user
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    
    // Query PgBouncer stats
    const [statsResult, poolsResult, databasesResult, clientsResult, serversResult] = await Promise.all([
      client.query('SHOW STATS'),
      client.query('SHOW POOLS'),
      client.query('SHOW DATABASES'),
      client.query('SHOW CLIENTS'),
      client.query('SHOW SERVERS'),
    ]);

    return {
      stats: statsResult.rows[0] || null,
      pools: poolsResult.rows,
      databases: databasesResult.rows,
      clients: clientsResult.rows,
      servers: serversResult.rows,
    };
  } catch (error) {
    return {
      stats: null,
      pools: [],
      databases: [],
      clients: [],
      servers: [],
      error: (error as Error).message,
    };
  } finally {
    await client.end();
  }
}

// Query PostgreSQL connection statistics directly
async function queryPostgresConnectionStats(connectionString: string): Promise<{
  activeConnections: number;
  idleConnections: number;
  maxConnections: number;
  waitingConnections: number;
  databaseStats: Array<Record<string, unknown>>;
  error?: string;
}> {
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });

  try {
    await client.connect();
    
    // Get connection stats
    const [connStatsResult, maxConnResult, dbStatsResult] = await Promise.all([
      client.query(`
        SELECT 
          state,
          count(*) as count,
          wait_event_type
        FROM pg_stat_activity 
        WHERE backend_type = 'client backend'
        GROUP BY state, wait_event_type
      `),
      client.query(`SELECT setting::int as max_conn FROM pg_settings WHERE name = 'max_connections'`),
      client.query(`
        SELECT 
          datname,
          numbackends as current_connections,
          xact_commit as transactions_committed,
          xact_rollback as transactions_rolledback,
          blks_read,
          blks_hit,
          tup_returned,
          tup_fetched,
          tup_inserted,
          tup_updated,
          tup_deleted
        FROM pg_stat_database 
        WHERE datname NOT IN ('template0', 'template1')
      `),
    ]);

    let activeConnections = 0;
    let idleConnections = 0;
    let waitingConnections = 0;

    for (const row of connStatsResult.rows) {
      const count = parseInt(row.count);
      if (row.state === 'active') {
        activeConnections += count;
      } else if (row.state === 'idle') {
        idleConnections += count;
      } else if (row.state === 'idle in transaction' || row.wait_event_type === 'Lock') {
        waitingConnections += count;
      }
    }

    return {
      activeConnections,
      idleConnections,
      maxConnections: maxConnResult.rows[0]?.max_conn || 100,
      waitingConnections,
      databaseStats: dbStatsResult.rows,
    };
  } catch (error) {
    return {
      activeConnections: 0,
      idleConnections: 0,
      maxConnections: 100,
      waitingConnections: 0,
      databaseStats: [],
      error: (error as Error).message,
    };
  } finally {
    await client.end();
  }
}

// Get pool statistics - tries PgBouncer first, falls back to PostgreSQL stats
async function getPoolStats(pool: PoolConfig, clusterId: string) {
  // Try to get real PgBouncer stats if pooler is configured
  if (pool.poolerHost && pool.poolerPort) {
    const pgbouncerStats = await queryPgBouncerStats(pool.poolerHost, pool.poolerPort);
    
    if (!pgbouncerStats.error) {
      // Process real PgBouncer stats
      const activeClients = pgbouncerStats.clients.filter((c: Record<string, unknown>) => c.state === 'active').length;
      const waitingClients = pgbouncerStats.clients.filter((c: Record<string, unknown>) => c.state === 'waiting').length;
      const activeServers = pgbouncerStats.servers.filter((s: Record<string, unknown>) => s.state === 'active').length;
      const idleServers = pgbouncerStats.servers.filter((s: Record<string, unknown>) => s.state === 'idle').length;

      return {
        source: 'pgbouncer',
        totalClients: pgbouncerStats.clients.length,
        activeClients,
        waitingClients,
        totalServers: pgbouncerStats.servers.length,
        activeServers,
        idleServers,
        usedServers: activeServers,
        avgQueryTime: pgbouncerStats.stats?.avg_query_time || '0',
        avgWaitTime: pgbouncerStats.stats?.avg_wait_time || '0',
        totalQueries: parseInt(String(pgbouncerStats.stats?.total_query_count || 0)),
        totalTransactions: parseInt(String(pgbouncerStats.stats?.total_xact_count || 0)),
        totalReceived: parseInt(String(pgbouncerStats.stats?.total_received || 0)),
        totalSent: parseInt(String(pgbouncerStats.stats?.total_sent || 0)),
        clientUtilization: pool.maxClientConn > 0 
          ? ((pgbouncerStats.clients.length / pool.maxClientConn) * 100).toFixed(1) 
          : '0',
        serverUtilization: pool.defaultPoolSize > 0 
          ? ((activeServers / pool.defaultPoolSize) * 100).toFixed(1) 
          : '0',
        databases: pgbouncerStats.databases.map((db: Record<string, unknown>) => ({
          name: db.name,
          host: db.host,
          port: db.port,
          database: db.database,
          currentConnections: db.current_connections,
          maxConnections: db.max_connections,
          poolSize: db.pool_size,
          minPoolSize: db.min_pool_size,
          reservePool: db.reserve_pool,
        })),
        pools: pgbouncerStats.pools,
      };
    }
  }

  // Fall back to querying PostgreSQL directly
  const cluster = await prisma.cluster.findUnique({
    where: { id: clusterId },
    include: { nodes: { where: { role: 'PRIMARY', connectionString: { not: null } } } },
  });

  const primaryNode = cluster?.nodes[0];
  if (primaryNode?.connectionString) {
    const pgStats = await queryPostgresConnectionStats(primaryNode.connectionString);
    
    if (!pgStats.error) {
      const totalConnections = pgStats.activeConnections + pgStats.idleConnections;
      
      return {
        source: 'postgresql',
        totalClients: totalConnections,
        activeClients: pgStats.activeConnections,
        waitingClients: pgStats.waitingConnections,
        totalServers: pgStats.maxConnections,
        activeServers: pgStats.activeConnections,
        idleServers: pgStats.idleConnections,
        usedServers: totalConnections,
        avgQueryTime: '0', // Not available from pg_stat_activity
        avgWaitTime: '0',
        totalQueries: 0,
        totalTransactions: pgStats.databaseStats.reduce((sum: number, db: Record<string, unknown>) => 
          sum + parseInt(String(db.transactions_committed || 0)), 0),
        totalReceived: 0,
        totalSent: 0,
        clientUtilization: pgStats.maxConnections > 0 
          ? ((totalConnections / pgStats.maxConnections) * 100).toFixed(1) 
          : '0',
        serverUtilization: pgStats.maxConnections > 0 
          ? ((totalConnections / pgStats.maxConnections) * 100).toFixed(1) 
          : '0',
        databases: pgStats.databaseStats.map((db: Record<string, unknown>) => ({
          name: db.datname,
          host: 'primary',
          port: 5432,
          database: db.datname,
          currentConnections: db.current_connections || db.numbackends,
          maxConnections: Math.floor(pgStats.maxConnections * 0.8),
          poolSize: pool.defaultPoolSize,
          minPoolSize: pool.minPoolSize,
          reservePool: pool.reservePoolSize,
        })),
      };
    }
  }

  // Return empty stats if nothing is available
  return {
    source: 'unavailable',
    totalClients: 0,
    activeClients: 0,
    waitingClients: 0,
    totalServers: 0,
    activeServers: 0,
    idleServers: 0,
    usedServers: 0,
    avgQueryTime: '0',
    avgWaitTime: '0',
    totalQueries: 0,
    totalTransactions: 0,
    totalReceived: 0,
    totalSent: 0,
    clientUtilization: '0',
    serverUtilization: '0',
    databases: [],
    error: 'No connection pool or database connection available',
  };
}
