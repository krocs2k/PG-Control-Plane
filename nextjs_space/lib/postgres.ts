/**
 * PostgreSQL Connection & Operations Library
 * Provides real database connectivity for sync, replication, and management operations
 */

import { Pool, Client, PoolConfig, QueryResult } from 'pg';

// Single global pool for reuse - cleaned up periodically
let connectionPool: Pool | null = null;
let lastConnectionString: string | null = null;
let poolIdleTimeout: NodeJS.Timeout | null = null;

// Cleanup function for pool
function cleanupPool() {
  if (connectionPool) {
    connectionPool.end().catch(console.error);
    connectionPool = null;
    lastConnectionString = null;
  }
  if (poolIdleTimeout) {
    clearTimeout(poolIdleTimeout);
    poolIdleTimeout = null;
  }
}

// Connection string parser
export function parseConnectionString(connStr: string): {
  host: string;
  port: number;
  database?: string;
  user?: string;
  password?: string;
  sslMode?: string;
} | null {
  try {
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
export function buildConnectionString(
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

// Get client configuration from connection string
export function getClientConfig(connectionString: string): PoolConfig {
  const parsed = parseConnectionString(connectionString);
  if (!parsed) {
    throw new Error('Invalid connection string');
  }

  return {
    host: parsed.host,
    port: parsed.port,
    database: parsed.database || 'postgres',
    user: parsed.user,
    password: parsed.password,
    ssl: parsed.sslMode === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 5000,
    max: 2, // Very conservative pool size
  };
}

// Get or create a connection pool (with automatic cleanup after 30 seconds of inactivity)
export function getPool(connectionString: string): Pool {
  // Reset idle timeout
  if (poolIdleTimeout) {
    clearTimeout(poolIdleTimeout);
  }
  poolIdleTimeout = setTimeout(cleanupPool, 30000);

  // If we have a pool for a different connection, close it first
  if (connectionPool && lastConnectionString !== connectionString) {
    connectionPool.end().catch(console.error);
    connectionPool = null;
    lastConnectionString = null;
  }

  // Create new pool if needed
  if (!connectionPool) {
    connectionPool = new Pool(getClientConfig(connectionString));
    lastConnectionString = connectionString;
  }

  return connectionPool;
}

// Close the pool
export async function closePool(): Promise<void> {
  cleanupPool();
}

// Test database connection using a single client (not pool)
export async function testConnection(connectionString: string): Promise<{
  success: boolean;
  error?: string;
  pgVersion?: string;
  serverInfo?: {
    version: string;
    serverVersion: number;
    database: string;
    user: string;
    pid: number;
  };
}> {
  const client = new Client(getClientConfig(connectionString));
  
  try {
    await client.connect();
    
    // Get PostgreSQL version and server info
    const versionResult = await client.query('SELECT version(), current_database(), current_user');
    const serverVersionResult = await client.query('SHOW server_version_num');
    const pidResult = await client.query('SELECT pg_backend_pid()');
    
    const versionMatch = versionResult.rows[0].version.match(/PostgreSQL (\d+\.\d+)/);
    const pgVersion = versionMatch ? versionMatch[1] : 'Unknown';
    
    return {
      success: true,
      pgVersion,
      serverInfo: {
        version: versionResult.rows[0].version,
        serverVersion: parseInt(serverVersionResult.rows[0].server_version_num),
        database: versionResult.rows[0].current_database,
        user: versionResult.rows[0].current_user,
        pid: pidResult.rows[0].pg_backend_pid,
      },
    };
  } catch (error) {
    const err = error as Error;
    let errorMessage = err.message;
    
    // Provide more user-friendly error messages
    if (errorMessage.includes('ECONNREFUSED')) {
      errorMessage = `Connection refused. Check if PostgreSQL is running on the specified host and port.`;
    } else if (errorMessage.includes('ENOTFOUND')) {
      errorMessage = `Host not found. Verify the hostname is correct.`;
    } else if (errorMessage.includes('password authentication failed')) {
      errorMessage = `Authentication failed. Check username and password.`;
    } else if (errorMessage.includes('database') && errorMessage.includes('does not exist')) {
      errorMessage = `Database does not exist. Verify the database name.`;
    } else if (errorMessage.includes('timeout')) {
      errorMessage = `Connection timed out. Check network connectivity and firewall settings.`;
    } else if (errorMessage.includes('SSL')) {
      errorMessage = `SSL connection error. Try adjusting the sslmode parameter.`;
    }
    
    return {
      success: false,
      error: errorMessage,
    };
  } finally {
    await client.end();
  }
}

// Execute a query with connection string
export async function executeQuery(
  connectionString: string,
  query: string,
  params?: unknown[]
): Promise<QueryResult> {
  const pool = getPool(connectionString);
  return pool.query(query, params);
}

// Get database schema information
export async function getSchemaInfo(connectionString: string): Promise<{
  tables: Array<{ name: string; schema: string; rowCount: number }>;
  indexes: Array<{ name: string; table: string; columns: string[] }>;
  sequences: Array<{ name: string; lastValue: number }>;
  extensions: string[];
}> {
  const pool = getPool(connectionString);
  
  // Get tables with row counts
  const tablesResult = await pool.query(`
    SELECT 
      schemaname as schema,
      relname as name,
      n_live_tup as row_count
    FROM pg_stat_user_tables
    ORDER BY schemaname, relname
  `);
  
  // Get indexes
  const indexesResult = await pool.query(`
    SELECT 
      i.relname as name,
      t.relname as table_name,
      array_agg(a.attname ORDER BY k.i) as columns
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN LATERAL unnest(x.indkey) WITH ORDINALITY AS k(attnum, i) ON true
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    GROUP BY i.relname, t.relname
    ORDER BY t.relname, i.relname
  `);
  
  // Get sequences
  const sequencesResult = await pool.query(`
    SELECT sequencename as name, last_value
    FROM pg_sequences
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  `);
  
  // Get extensions
  const extensionsResult = await pool.query(`
    SELECT extname FROM pg_extension WHERE extname != 'plpgsql'
  `);
  
  return {
    tables: tablesResult.rows.map(r => ({
      name: r.name,
      schema: r.schema,
      rowCount: parseInt(r.row_count) || 0,
    })),
    indexes: indexesResult.rows.map(r => ({
      name: r.name,
      table: r.table_name,
      columns: r.columns,
    })),
    sequences: sequencesResult.rows.map(r => ({
      name: r.name,
      lastValue: parseInt(r.last_value) || 0,
    })),
    extensions: extensionsResult.rows.map(r => r.extname),
  };
}

// Get replication status from primary
export async function getReplicationStatus(connectionString: string): Promise<{
  isInRecovery: boolean;
  currentLsn?: string;
  lastWalReceiveLsn?: string;
  lastWalReplayLsn?: string;
  replayLagSeconds?: number;
  replicas?: Array<{
    applicationName: string;
    clientAddr: string;
    state: string;
    sentLsn: string;
    writeLsn: string;
    flushLsn: string;
    replayLsn: string;
    syncState: string;
    replayLagBytes: number;
  }>;
}> {
  const pool = getPool(connectionString);
  
  // Check if this is a primary or replica
  const recoveryResult = await pool.query('SELECT pg_is_in_recovery()');
  const isInRecovery = recoveryResult.rows[0].pg_is_in_recovery;
  
  if (isInRecovery) {
    // This is a replica - get replica-specific info
    const replicaInfo = await pool.query(`
      SELECT 
        pg_last_wal_receive_lsn() as receive_lsn,
        pg_last_wal_replay_lsn() as replay_lsn,
        EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))::int as replay_lag_seconds
    `);
    
    return {
      isInRecovery: true,
      lastWalReceiveLsn: replicaInfo.rows[0].receive_lsn,
      lastWalReplayLsn: replicaInfo.rows[0].replay_lsn,
      replayLagSeconds: replicaInfo.rows[0].replay_lag_seconds,
    };
  } else {
    // This is a primary - get current LSN and replica status
    const lsnResult = await pool.query('SELECT pg_current_wal_lsn() as current_lsn');
    
    const replicasResult = await pool.query(`
      SELECT 
        application_name,
        client_addr::text,
        state,
        sent_lsn::text,
        write_lsn::text,
        flush_lsn::text,
        replay_lsn::text,
        sync_state,
        (pg_current_wal_lsn() - replay_lsn) as replay_lag_bytes
      FROM pg_stat_replication
    `);
    
    return {
      isInRecovery: false,
      currentLsn: lsnResult.rows[0].current_lsn,
      replicas: replicasResult.rows.map(r => ({
        applicationName: r.application_name,
        clientAddr: r.client_addr,
        state: r.state,
        sentLsn: r.sent_lsn,
        writeLsn: r.write_lsn,
        flushLsn: r.flush_lsn,
        replayLsn: r.replay_lsn,
        syncState: r.sync_state,
        replayLagBytes: parseInt(r.replay_lag_bytes) || 0,
      })),
    };
  }
}

// Get replication slots
export async function getReplicationSlots(connectionString: string): Promise<Array<{
  slotName: string;
  slotType: string;
  database: string | null;
  active: boolean;
  restartLsn: string | null;
  confirmedFlushLsn: string | null;
  walStatus: string;
  retainedWalBytes: number;
}>> {
  const pool = getPool(connectionString);
  
  const result = await pool.query(`
    SELECT 
      slot_name,
      slot_type,
      database,
      active,
      restart_lsn::text,
      confirmed_flush_lsn::text,
      CASE 
        WHEN pg_current_wal_lsn() - restart_lsn IS NULL THEN 'unknown'
        WHEN (pg_current_wal_lsn() - restart_lsn) > 1073741824 THEN 'critical'
        WHEN (pg_current_wal_lsn() - restart_lsn) > 104857600 THEN 'warning'
        ELSE 'normal'
      END as wal_status,
      COALESCE(pg_current_wal_lsn() - restart_lsn, 0)::bigint as retained_wal_bytes
    FROM pg_replication_slots
  `);
  
  return result.rows.map(r => ({
    slotName: r.slot_name,
    slotType: r.slot_type,
    database: r.database,
    active: r.active,
    restartLsn: r.restart_lsn,
    confirmedFlushLsn: r.confirmed_flush_lsn,
    walStatus: r.wal_status,
    retainedWalBytes: parseInt(r.retained_wal_bytes) || 0,
  }));
}

// Create a replication slot
export async function createReplicationSlot(
  connectionString: string,
  slotName: string,
  slotType: 'physical' | 'logical' = 'physical',
  outputPlugin?: string
): Promise<{ success: boolean; error?: string; lsn?: string }> {
  const pool = getPool(connectionString);
  
  try {
    if (slotType === 'physical') {
      const result = await pool.query(
        'SELECT pg_create_physical_replication_slot($1)',
        [slotName]
      );
      return { success: true, lsn: result.rows[0]?.pg_create_physical_replication_slot };
    } else {
      const plugin = outputPlugin || 'pgoutput';
      const result = await pool.query(
        'SELECT pg_create_logical_replication_slot($1, $2)',
        [slotName, plugin]
      );
      return { success: true, lsn: result.rows[0]?.pg_create_logical_replication_slot };
    }
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

// Drop a replication slot
export async function dropReplicationSlot(
  connectionString: string,
  slotName: string
): Promise<{ success: boolean; error?: string }> {
  const pool = getPool(connectionString);
  
  try {
    await pool.query('SELECT pg_drop_replication_slot($1)', [slotName]);
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

// Get WAL activity information
export async function getWalActivity(connectionString: string): Promise<{
  currentLsn: string;
  walWriteBytes: number;
  walSendBytes: number;
  archiveCount: number;
  archiveFailed: number;
  lastArchived: string | null;
  lastArchivedAt: Date | null;
  lastFailed: string | null;
  lastFailedAt: Date | null;
}> {
  const pool = getPool(connectionString);
  
  const lsnResult = await pool.query('SELECT pg_current_wal_lsn() as current_lsn');
  
  // Get WAL stats
  const walStatsResult = await pool.query(`
    SELECT 
      archived_count,
      failed_count,
      last_archived_wal,
      last_archived_time,
      last_failed_wal,
      last_failed_time
    FROM pg_stat_archiver
  `);
  
  // Get WAL write/send info from replication
  const walInfoResult = await pool.query(`
    SELECT 
      COALESCE(SUM(sent_lsn - '0/0'::pg_lsn), 0)::bigint as wal_send,
      COALESCE(SUM(write_lsn - '0/0'::pg_lsn), 0)::bigint as wal_write
    FROM pg_stat_replication
  `);
  
  const archiver = walStatsResult.rows[0] || {};
  const walInfo = walInfoResult.rows[0] || {};
  
  return {
    currentLsn: lsnResult.rows[0]?.current_lsn || '0/0',
    walWriteBytes: parseInt(walInfo.wal_write) || 0,
    walSendBytes: parseInt(walInfo.wal_send) || 0,
    archiveCount: archiver.archived_count || 0,
    archiveFailed: archiver.failed_count || 0,
    lastArchived: archiver.last_archived_wal,
    lastArchivedAt: archiver.last_archived_time,
    lastFailed: archiver.last_failed_wal,
    lastFailedAt: archiver.last_failed_time,
  };
}

// Compare schemas between two databases
export async function compareSchemas(
  sourceConnectionString: string,
  targetConnectionString: string
): Promise<{
  matched: boolean;
  differences: Array<{
    type: 'table' | 'column' | 'index' | 'constraint' | 'sequence' | 'extension';
    object: string;
    sourceState: string | null;
    targetState: string | null;
    action: 'create' | 'drop' | 'alter';
  }>;
}> {
  const [sourceSchema, targetSchema] = await Promise.all([
    getSchemaInfo(sourceConnectionString),
    getSchemaInfo(targetConnectionString),
  ]);
  
  const differences: Array<{
    type: 'table' | 'column' | 'index' | 'constraint' | 'sequence' | 'extension';
    object: string;
    sourceState: string | null;
    targetState: string | null;
    action: 'create' | 'drop' | 'alter';
  }> = [];
  
  // Compare tables
  const sourceTableNames = new Set(sourceSchema.tables.map(t => `${t.schema}.${t.name}`));
  const targetTableNames = new Set(targetSchema.tables.map(t => `${t.schema}.${t.name}`));
  
  for (const tableName of sourceTableNames) {
    if (!targetTableNames.has(tableName)) {
      differences.push({
        type: 'table',
        object: tableName,
        sourceState: 'exists',
        targetState: null,
        action: 'create',
      });
    }
  }
  
  for (const tableName of targetTableNames) {
    if (!sourceTableNames.has(tableName)) {
      differences.push({
        type: 'table',
        object: tableName,
        sourceState: null,
        targetState: 'exists',
        action: 'drop',
      });
    }
  }
  
  // Compare extensions
  const sourceExtensions = new Set(sourceSchema.extensions);
  const targetExtensions = new Set(targetSchema.extensions);
  
  for (const ext of sourceExtensions) {
    if (!targetExtensions.has(ext)) {
      differences.push({
        type: 'extension',
        object: ext,
        sourceState: 'installed',
        targetState: null,
        action: 'create',
      });
    }
  }
  
  // Compare indexes
  const sourceIndexNames = new Set(sourceSchema.indexes.map(i => i.name));
  const targetIndexNames = new Set(targetSchema.indexes.map(i => i.name));
  
  for (const indexName of sourceIndexNames) {
    if (!targetIndexNames.has(indexName)) {
      differences.push({
        type: 'index',
        object: indexName,
        sourceState: 'exists',
        targetState: null,
        action: 'create',
      });
    }
  }
  
  return {
    matched: differences.length === 0,
    differences,
  };
}

// Sync data between databases (using logical replication or direct copy)
export async function syncData(
  sourceConnectionString: string,
  targetConnectionString: string,
  options: {
    tables?: string[];
    fullSync?: boolean;
    truncateTarget?: boolean;
  } = {}
): Promise<{
  success: boolean;
  error?: string;
  tablesSync: number;
  rowsCopied: number;
}> {
  const sourcePool = getPool(sourceConnectionString);
  const targetPool = getPool(targetConnectionString);
  
  try {
    const sourceSchema = await getSchemaInfo(sourceConnectionString);
    const tablesToSync = options.tables 
      ? sourceSchema.tables.filter(t => options.tables!.includes(t.name))
      : sourceSchema.tables;
    
    let totalRowsCopied = 0;
    
    for (const table of tablesToSync) {
      const fullTableName = `"${table.schema}"."${table.name}"`;
      
      // Get column info
      const columnsResult = await sourcePool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [table.schema, table.name]);
      
      const columns = columnsResult.rows.map(r => `"${r.column_name}"`);
      
      if (columns.length === 0) continue;
      
      // Optionally truncate target table
      if (options.truncateTarget) {
        await targetPool.query(`TRUNCATE ${fullTableName} CASCADE`);
      }
      
      // Copy data in batches
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const selectQuery = `SELECT ${columns.join(', ')} FROM ${fullTableName} LIMIT ${batchSize} OFFSET ${offset}`;
        const dataResult = await sourcePool.query(selectQuery);
        
        if (dataResult.rows.length === 0) {
          hasMore = false;
          continue;
        }
        
        // Build INSERT statement
        const placeholders = dataResult.rows.map((_, rowIdx) => 
          `(${columns.map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`).join(', ')})`
        ).join(', ');
        
        const values = dataResult.rows.flatMap(row => columns.map(col => row[col.replace(/"/g, '')]));
        
        const insertQuery = `INSERT INTO ${fullTableName} (${columns.join(', ')}) VALUES ${placeholders} ON CONFLICT DO NOTHING`;
        await targetPool.query(insertQuery, values);
        
        totalRowsCopied += dataResult.rows.length;
        offset += batchSize;
        
        if (dataResult.rows.length < batchSize) {
          hasMore = false;
        }
      }
    }
    
    return {
      success: true,
      tablesSync: tablesToSync.length,
      rowsCopied: totalRowsCopied,
    };
  } catch (error) {
    const err = error as Error;
    return {
      success: false,
      error: err.message,
      tablesSync: 0,
      rowsCopied: 0,
    };
  }
}

// Setup streaming replication on replica
export async function setupStreamingReplication(
  primaryConnectionString: string,
  replicaConnectionString: string,
  slotName: string
): Promise<{
  success: boolean;
  error?: string;
  slotCreated: boolean;
  primaryConnInfo: string;
}> {
  try {
    // Test both connections first
    const [primaryTest, replicaTest] = await Promise.all([
      testConnection(primaryConnectionString),
      testConnection(replicaConnectionString),
    ]);
    
    if (!primaryTest.success) {
      return {
        success: false,
        error: `Primary connection failed: ${primaryTest.error}`,
        slotCreated: false,
        primaryConnInfo: '',
      };
    }
    
    if (!replicaTest.success) {
      return {
        success: false,
        error: `Replica connection failed: ${replicaTest.error}`,
        slotCreated: false,
        primaryConnInfo: '',
      };
    }
    
    // Create replication slot on primary
    const slotResult = await createReplicationSlot(primaryConnectionString, slotName, 'physical');
    if (!slotResult.success) {
      // Slot might already exist
      if (!slotResult.error?.includes('already exists')) {
        return {
          success: false,
          error: `Failed to create replication slot: ${slotResult.error}`,
          slotCreated: false,
          primaryConnInfo: '',
        };
      }
    }
    
    // Generate primary_conninfo for replica's recovery.conf
    const parsed = parseConnectionString(primaryConnectionString);
    const primaryConnInfo = `host=${parsed?.host} port=${parsed?.port} user=${parsed?.user} password=${parsed?.password} application_name=${slotName}`;
    
    return {
      success: true,
      slotCreated: slotResult.success,
      primaryConnInfo,
    };
  } catch (error) {
    const err = error as Error;
    return {
      success: false,
      error: err.message,
      slotCreated: false,
      primaryConnInfo: '',
    };
  }
}

// Get database statistics
export async function getDatabaseStats(connectionString: string): Promise<{
  databaseSize: number;
  activeConnections: number;
  maxConnections: number;
  transactionsCommitted: number;
  transactionsRolledBack: number;
  blocksRead: number;
  blocksHit: number;
  cacheHitRatio: number;
  tempFilesBytes: number;
  deadlocks: number;
}> {
  const pool = getPool(connectionString);
  
  const result = await pool.query(`
    SELECT 
      pg_database_size(current_database()) as db_size,
      (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
      (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
      xact_commit as txn_committed,
      xact_rollback as txn_rolledback,
      blks_read,
      blks_hit,
      CASE WHEN blks_hit + blks_read > 0 
           THEN round((blks_hit::numeric / (blks_hit + blks_read) * 100)::numeric, 2)
           ELSE 100 END as cache_hit_ratio,
      temp_bytes,
      deadlocks
    FROM pg_stat_database 
    WHERE datname = current_database()
  `);
  
  const row = result.rows[0] || {};
  
  return {
    databaseSize: parseInt(row.db_size) || 0,
    activeConnections: parseInt(row.active_connections) || 0,
    maxConnections: parseInt(row.max_connections) || 100,
    transactionsCommitted: parseInt(row.txn_committed) || 0,
    transactionsRolledBack: parseInt(row.txn_rolledback) || 0,
    blocksRead: parseInt(row.blks_read) || 0,
    blocksHit: parseInt(row.blks_hit) || 0,
    cacheHitRatio: parseFloat(row.cache_hit_ratio) || 100,
    tempFilesBytes: parseInt(row.temp_bytes) || 0,
    deadlocks: parseInt(row.deadlocks) || 0,
  };
}
