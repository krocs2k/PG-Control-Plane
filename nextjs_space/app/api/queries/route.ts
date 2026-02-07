export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

// Simulated query templates for demo
const sampleQueries = [
  { text: 'SELECT * FROM users WHERE email = $1', table: 'users', type: 'SELECT' },
  { text: 'SELECT o.*, u.name FROM orders o JOIN users u ON o.user_id = u.id WHERE o.status = $1', table: 'orders', type: 'SELECT' },
  { text: 'UPDATE inventory SET quantity = quantity - $1 WHERE product_id = $2', table: 'inventory', type: 'UPDATE' },
  { text: 'INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)', table: 'audit_logs', type: 'INSERT' },
  { text: 'SELECT p.*, c.name as category FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.created_at DESC LIMIT $1', table: 'products', type: 'SELECT' },
  { text: 'DELETE FROM sessions WHERE expires_at < NOW()', table: 'sessions', type: 'DELETE' },
  { text: 'SELECT COUNT(*) FROM transactions WHERE created_at > $1 GROUP BY status', table: 'transactions', type: 'SELECT' },
  { text: 'UPDATE users SET last_login = NOW() WHERE id = $1', table: 'users', type: 'UPDATE' },
];

function hashQuery(query: string): string {
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    const char = query.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function generateSimulatedStats(clusterId: string) {
  return sampleQueries.map((q, idx) => {
    const calls = Math.floor(Math.random() * 50000) + 100;
    const meanTime = Math.random() * 500 + 0.5;
    return {
      id: `sim-${idx}-${clusterId}`,
      clusterId,
      queryHash: hashQuery(q.text),
      queryText: q.text,
      calls,
      totalTime: calls * meanTime,
      minTime: meanTime * 0.1,
      maxTime: meanTime * 10,
      meanTime,
      rows: BigInt(calls * Math.floor(Math.random() * 100 + 1)),
      sharedBlksHit: BigInt(Math.floor(Math.random() * 1000000)),
      sharedBlksRead: BigInt(Math.floor(Math.random() * 10000)),
      tempBlksWritten: BigInt(Math.floor(Math.random() * 100)),
      firstSeen: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      lastSeen: new Date(),
    };
  });
}

function generateSlowQueries(clusterId: string) {
  const slowTemplates = [
    'SELECT * FROM large_table WHERE unindexed_column LIKE $1',
    'SELECT DISTINCT a.*, b.*, c.* FROM table_a a, table_b b, table_c c WHERE a.id = b.a_id',
    'UPDATE orders SET status = $1 WHERE created_at < $2',
    'SELECT * FROM users ORDER BY random() LIMIT 10',
    'SELECT COUNT(*) FROM transactions t1 WHERE EXISTS (SELECT 1 FROM transactions t2 WHERE t2.amount > t1.amount)',
  ];
  
  return slowTemplates.slice(0, 3 + Math.floor(Math.random() * 3)).map((text, idx) => ({
    id: `slow-${idx}-${clusterId}`,
    clusterId,
    queryText: text,
    duration: Math.random() * 10000 + 1000,
    database: 'production',
    username: ['app_user', 'admin', 'analytics'][Math.floor(Math.random() * 3)],
    waitEvent: ['IO:DataFileRead', 'Lock:relation', 'CPU', null][Math.floor(Math.random() * 4)],
    state: 'idle',
    analyzed: Math.random() > 0.5,
    capturedAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
  }));
}

function generateIndexRecommendations(clusterId: string) {
  return [
    {
      id: `idx-1-${clusterId}`,
      clusterId,
      tableName: 'orders',
      columnNames: 'status, created_at',
      indexType: 'btree',
      reason: 'Frequent queries filter by status and sort by created_at. A composite index would eliminate sequential scans.',
      estimatedGain: 85.5,
      ddlStatement: 'CREATE INDEX CONCURRENTLY idx_orders_status_created ON orders (status, created_at DESC);',
      status: 'PENDING',
    },
    {
      id: `idx-2-${clusterId}`,
      clusterId,
      tableName: 'users',
      columnNames: 'email',
      indexType: 'btree',
      reason: 'Email lookups are common for authentication. Unique index already exists but partial index for active users recommended.',
      estimatedGain: 45.2,
      ddlStatement: 'CREATE INDEX CONCURRENTLY idx_users_email_active ON users (email) WHERE active = true;',
      status: 'PENDING',
    },
    {
      id: `idx-3-${clusterId}`,
      clusterId,
      tableName: 'transactions',
      columnNames: 'user_id, created_at',
      indexType: 'btree',
      reason: 'User transaction history queries would benefit from a covering index.',
      estimatedGain: 72.8,
      ddlStatement: 'CREATE INDEX CONCURRENTLY idx_transactions_user_created ON transactions (user_id, created_at DESC);',
      status: 'PENDING',
    },
  ];
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get('clusterId');
    const type = searchParams.get('type') || 'stats';

    if (!clusterId) {
      return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
    }

    if (type === 'stats') {
      // Try to get from DB first, fallback to simulated
      let stats = await prisma.queryStats.findMany({
        where: { clusterId },
        orderBy: { meanTime: 'desc' },
        take: 50,
      });

      if (stats.length === 0) {
        stats = generateSimulatedStats(clusterId) as any;
      }

      return NextResponse.json(stats.map(s => ({
        ...s,
        rows: s.rows.toString(),
        sharedBlksHit: s.sharedBlksHit.toString(),
        sharedBlksRead: s.sharedBlksRead.toString(),
        tempBlksWritten: s.tempBlksWritten.toString(),
      })));
    }

    if (type === 'slow') {
      let slowQueries = await prisma.slowQuery.findMany({
        where: { clusterId },
        orderBy: { duration: 'desc' },
        take: 20,
      });

      if (slowQueries.length === 0) {
        slowQueries = generateSlowQueries(clusterId) as any;
      }

      return NextResponse.json(slowQueries);
    }

    if (type === 'recommendations') {
      let recommendations = await prisma.indexRecommendation.findMany({
        where: { clusterId },
        orderBy: { estimatedGain: 'desc' },
      });

      if (recommendations.length === 0) {
        recommendations = generateIndexRecommendations(clusterId) as any;
      }

      return NextResponse.json(recommendations);
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
  } catch (error) {
    console.error('Error fetching query stats:', error);
    return NextResponse.json({ error: 'Failed to fetch query stats' }, { status: 500 });
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

    if (action === 'refresh') {
      // Simulate refreshing stats from pg_stat_statements
      const stats = generateSimulatedStats(clusterId);
      
      for (const stat of stats) {
        await prisma.queryStats.upsert({
          where: {
            clusterId_queryHash: {
              clusterId,
              queryHash: stat.queryHash,
            },
          },
          create: {
            clusterId,
            queryHash: stat.queryHash,
            queryText: stat.queryText,
            calls: stat.calls,
            totalTime: stat.totalTime,
            minTime: stat.minTime,
            maxTime: stat.maxTime,
            meanTime: stat.meanTime,
            rows: stat.rows,
            sharedBlksHit: stat.sharedBlksHit,
            sharedBlksRead: stat.sharedBlksRead,
            tempBlksWritten: stat.tempBlksWritten,
          },
          update: {
            calls: stat.calls,
            totalTime: stat.totalTime,
            meanTime: stat.meanTime,
            lastSeen: new Date(),
          },
        });
      }

      await createAuditLog({
        userId: session.user.id,
        entityType: 'QueryStats',
        entityId: clusterId,
        action: 'REFRESH',
        afterState: { count: stats.length },
      });

      return NextResponse.json({ success: true, count: stats.length });
    }

    if (action === 'capture_slow') {
      // Simulate capturing a slow query
      const slowQueries = generateSlowQueries(clusterId);
      const captured = slowQueries[0];

      const slowQuery = await prisma.slowQuery.create({
        data: {
          clusterId,
          queryText: captured.queryText,
          duration: captured.duration,
          database: captured.database,
          username: captured.username,
          waitEvent: captured.waitEvent,
          state: captured.state,
        },
      });

      return NextResponse.json(slowQuery);
    }

    if (action === 'analyze') {
      const { queryId } = body;
      if (!queryId) {
        return NextResponse.json({ error: 'queryId is required' }, { status: 400 });
      }

      // Simulate AI analysis of the query
      const suggestions = [
        'Consider adding an index on the filtered columns',
        'Avoid SELECT * - specify only needed columns',
        'Use LIMIT clause to restrict result set',
        'Consider partitioning this table',
        'Review for N+1 query patterns in application code',
      ];

      const explainPlan = `Seq Scan on large_table  (cost=0.00..35000.00 rows=1000000 width=120)\n  Filter: (unindexed_column ~~ '%pattern%'::text)\n  Rows Removed by Filter: 999000`;

      const updated = await prisma.slowQuery.update({
        where: { id: queryId },
        data: {
          analyzed: true,
          analyzedAt: new Date(),
          explainPlan,
          suggestions: JSON.stringify(suggestions.slice(0, 3)),
        },
      });

      return NextResponse.json(updated);
    }

    if (action === 'apply_recommendation') {
      const { recommendationId } = body;
      if (!recommendationId) {
        return NextResponse.json({ error: 'recommendationId is required' }, { status: 400 });
      }

      const recommendation = await prisma.indexRecommendation.update({
        where: { id: recommendationId },
        data: {
          status: 'APPLIED',
          appliedAt: new Date(),
          appliedBy: session.user.id,
        },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: 'IndexRecommendation',
        entityId: recommendationId,
        action: 'APPLY',
        afterState: recommendation,
      });

      return NextResponse.json(recommendation);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error processing query action:', error);
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 });
  }
}
