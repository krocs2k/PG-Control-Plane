export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

// Test case templates for different cluster configurations
const TEST_TEMPLATES = {
  replication: [
    {
      category: 'Replication Health',
      name: 'Verify Streaming Replication Status',
      description: 'Check that all replicas are connected and streaming from primary',
      sql: "SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn FROM pg_stat_replication;",
      expectedOutcome: 'All replicas should show state=streaming with minimal LSN lag',
      priority: 'high',
    },
    {
      category: 'Replication Health',
      name: 'Check Replication Lag',
      description: 'Measure replication lag across all replicas',
      sql: "SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))::INT AS lag_seconds;",
      expectedOutcome: 'Lag should be under configured threshold (typically < 100ms)',
      priority: 'high',
    },
    {
      category: 'Replication Health',
      name: 'Validate WAL Sender Processes',
      description: 'Ensure WAL sender processes are running for each replica',
      sql: "SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'walsender';",
      expectedOutcome: 'Count should match number of replicas',
      priority: 'medium',
    },
  ],
  failover: [
    {
      category: 'Failover Readiness',
      name: 'Test Replica Promotion Readiness',
      description: 'Verify replicas can be promoted without data loss',
      sql: "SELECT pg_is_in_recovery(), pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();",
      expectedOutcome: 'Replica should be in recovery with synchronized LSN positions',
      priority: 'high',
    },
    {
      category: 'Failover Readiness',
      name: 'Validate Timeline Continuity',
      description: 'Check timeline IDs are consistent across cluster',
      sql: "SELECT timeline_id FROM pg_control_checkpoint();",
      expectedOutcome: 'All nodes should report same or sequential timeline IDs',
      priority: 'high',
    },
    {
      category: 'Failover Readiness',
      name: 'Test Connection Failover',
      description: 'Verify client connections can failover to new primary',
      sql: null,
      expectedOutcome: 'Connections should redirect within configured timeout',
      priority: 'medium',
    },
  ],
  performance: [
    {
      category: 'Performance',
      name: 'Benchmark Read Throughput',
      description: 'Measure queries per second on replica nodes',
      sql: "SELECT sum(calls) FROM pg_stat_statements WHERE query NOT LIKE '%pg_stat%';",
      expectedOutcome: 'QPS should meet baseline performance metrics',
      priority: 'medium',
    },
    {
      category: 'Performance',
      name: 'Check Connection Pool Efficiency',
      description: 'Verify connection pooling is reducing overhead',
      sql: "SELECT count(*), state FROM pg_stat_activity GROUP BY state;",
      expectedOutcome: 'Active connections should be efficiently utilized',
      priority: 'medium',
    },
    {
      category: 'Performance',
      name: 'Index Usage Analysis',
      description: 'Identify unused or missing indexes',
      sql: "SELECT schemaname, tablename, indexname, idx_scan FROM pg_stat_user_indexes WHERE idx_scan = 0;",
      expectedOutcome: 'No critical indexes should be unused',
      priority: 'low',
    },
  ],
  integrity: [
    {
      category: 'Data Integrity',
      name: 'Verify Data Checksums',
      description: 'Check data page checksums are enabled and valid',
      sql: "SHOW data_checksums;",
      expectedOutcome: 'Checksums should be enabled (on)',
      priority: 'high',
    },
    {
      category: 'Data Integrity',
      name: 'Check for Corruption',
      description: 'Run amcheck on critical tables',
      sql: "SELECT bt_index_check(c.oid) FROM pg_index i JOIN pg_class c ON i.indexrelid = c.oid LIMIT 5;",
      expectedOutcome: 'No corruption errors should be reported',
      priority: 'high',
    },
  ],
  backup: [
    {
      category: 'Backup & Recovery',
      name: 'Verify WAL Archiving',
      description: 'Check WAL archiving is functional',
      sql: "SELECT archived_count, failed_count, last_archived_wal FROM pg_stat_archiver;",
      expectedOutcome: 'No failed archives, recent archiving activity',
      priority: 'high',
    },
    {
      category: 'Backup & Recovery',
      name: 'Test Point-in-Time Recovery',
      description: 'Verify PITR capability to recent timestamp',
      sql: null,
      expectedOutcome: 'Should be able to recover to any point within retention window',
      priority: 'medium',
    },
  ],
};

const SCENARIO_TEMPLATES = [
  {
    name: 'Primary Node Failure',
    category: 'Failover',
    steps: [
      'Stop PostgreSQL service on primary node',
      'Monitor replica promotion via Patroni/pg_autoctl',
      'Verify client connections redirect to new primary',
      'Validate no data loss by checking LSN positions',
      'Confirm old primary can rejoin as replica',
    ],
    expectedBehavior: 'Automatic failover within configured timeout, zero data loss',
    rollbackPlan: 'Restore original primary from backup if promotion fails',
    riskLevel: 'medium',
  },
  {
    name: 'Network Partition (Split Brain)',
    category: 'Network',
    steps: [
      'Simulate network partition between primary and replicas',
      'Verify fencing mechanism activates',
      'Check that only one node accepts writes',
      'Restore network connectivity',
      'Verify cluster reconverges correctly',
    ],
    expectedBehavior: 'Fencing prevents split-brain, single writer maintained',
    rollbackPlan: 'Manual intervention to fence partitioned nodes',
    riskLevel: 'high',
  },
  {
    name: 'Replication Lag Spike',
    category: 'Replication',
    steps: [
      'Generate high write load on primary',
      'Monitor replication lag on all replicas',
      'Verify read routing adjusts based on lag thresholds',
      'Reduce write load',
      'Confirm replicas catch up within expected time',
    ],
    expectedBehavior: 'Lag-aware routing protects read consistency',
    rollbackPlan: 'Manually pause writes if lag becomes critical',
    riskLevel: 'low',
  },
  {
    name: 'Resource Exhaustion (Connections)',
    category: 'Resources',
    steps: [
      'Gradually increase connection count to max_connections',
      'Monitor connection pool behavior',
      'Verify graceful degradation under pressure',
      'Test connection queue behavior',
      'Reduce connections and verify recovery',
    ],
    expectedBehavior: 'Connection pooling handles overflow gracefully',
    rollbackPlan: 'Emergency connection termination script',
    riskLevel: 'medium',
  },
  {
    name: 'Disk Space Pressure',
    category: 'Resources',
    steps: [
      'Simulate disk space approaching threshold',
      'Verify alerting triggers correctly',
      'Test emergency vacuum procedures',
      'Check WAL cleanup behavior',
      'Restore available disk space',
    ],
    expectedBehavior: 'Proactive alerts before critical threshold',
    rollbackPlan: 'Emergency WAL cleanup and table truncation procedures',
    riskLevel: 'medium',
  },
  {
    name: 'Rolling Upgrade',
    category: 'Maintenance',
    steps: [
      'Upgrade replica nodes one at a time',
      'Verify replication continues after each upgrade',
      'Perform controlled failover to upgraded replica',
      'Upgrade original primary (now replica)',
      'Verify all nodes on new version',
    ],
    expectedBehavior: 'Zero-downtime upgrade with maintained replication',
    rollbackPlan: 'Failback to non-upgraded node if issues arise',
    riskLevel: 'medium',
  },
];

function analyzeQuery(query: string): any {
  const issues: any[] = [];
  const recommendations: any[] = [];
  const upperQuery = query.toUpperCase();

  // Check for SELECT *
  if (upperQuery.includes('SELECT *')) {
    issues.push({ severity: 'medium', message: 'Using SELECT * retrieves all columns which may include unnecessary data' });
    recommendations.push('Specify only required columns to reduce network transfer and memory usage');
  }

  // Check for missing WHERE clause
  if ((upperQuery.includes('UPDATE') || upperQuery.includes('DELETE')) && !upperQuery.includes('WHERE')) {
    issues.push({ severity: 'critical', message: 'UPDATE/DELETE without WHERE clause will affect all rows' });
    recommendations.push('Add a WHERE clause to limit affected rows');
  }

  // Check for LIKE with leading wildcard
  if (upperQuery.includes("LIKE '%") || upperQuery.includes("LIKE '%")) {
    issues.push({ severity: 'medium', message: 'Leading wildcard in LIKE prevents index usage' });
    recommendations.push('Consider using full-text search or restructuring the query');
  }

  // Check for implicit type conversion
  if (upperQuery.includes('::') || upperQuery.includes('CAST')) {
    issues.push({ severity: 'low', message: 'Type casting detected which may prevent index usage' });
    recommendations.push('Ensure column types match comparison values to enable index usage');
  }

  // Check for NOT IN subquery
  if (upperQuery.includes('NOT IN') && upperQuery.includes('SELECT')) {
    issues.push({ severity: 'medium', message: 'NOT IN with subquery can be slow and may behave unexpectedly with NULLs' });
    recommendations.push('Consider using NOT EXISTS or LEFT JOIN ... WHERE IS NULL pattern');
  }

  // Check for ORDER BY without LIMIT
  if (upperQuery.includes('ORDER BY') && !upperQuery.includes('LIMIT')) {
    issues.push({ severity: 'low', message: 'ORDER BY without LIMIT sorts entire result set' });
    recommendations.push('Add LIMIT if only top results are needed');
  }

  // Check for function on indexed column
  if (/WHERE\s+\w+\s*\([^)]+\)/.test(upperQuery)) {
    issues.push({ severity: 'medium', message: 'Function applied to column may prevent index usage' });
    recommendations.push('Create a functional index or restructure the query');
  }

  // Generate optimized query suggestions
  let optimizedQuery = query;
  if (upperQuery.includes('SELECT *')) {
    optimizedQuery = query.replace(/SELECT\s+\*/i, 'SELECT column1, column2, ... -- specify needed columns');
  }

  return {
    analysis: `Query analysis completed. Found ${issues.length} potential issue(s).`,
    issues,
    recommendations,
    optimizedQuery: issues.length > 0 ? optimizedQuery : null,
    estimatedImprovement: issues.length > 0 ? `${Math.min(issues.length * 15, 60)}% potential improvement` : 'Query appears well-optimized',
  };
}

function validateConfig(cluster: any, nodes: any[]): any {
  const issues: any[] = [];
  let score = 100;

  // Check node count
  if (nodes.length < 2) {
    issues.push({ severity: 'critical', message: 'Single node cluster has no redundancy', recommendation: 'Add at least one replica for high availability' });
    score -= 30;
  }

  // Check for primary
  const primaries = nodes.filter(n => n.role === 'PRIMARY');
  if (primaries.length === 0) {
    issues.push({ severity: 'critical', message: 'No primary node defined', recommendation: 'Designate a primary node' });
    score -= 40;
  } else if (primaries.length > 1) {
    issues.push({ severity: 'critical', message: 'Multiple primary nodes detected', recommendation: 'Ensure only one primary exists to prevent split-brain' });
    score -= 40;
  }

  // Check replicas
  const replicas = nodes.filter(n => n.role === 'REPLICA');
  if (replicas.length === 0 && nodes.length > 1) {
    issues.push({ severity: 'high', message: 'No replica nodes configured', recommendation: 'Configure replica nodes for read scaling and failover' });
    score -= 20;
  }

  // Check replication mode
  if (cluster?.replicationMode === 'ASYNC' && cluster?.topology === 'HA') {
    issues.push({ severity: 'medium', message: 'HA topology with async replication may lose committed transactions on failover', recommendation: 'Consider synchronous replication for zero data loss' });
    score -= 10;
  }

  // Check node statuses
  const unhealthyNodes = nodes.filter(n => n.status !== 'RUNNING' && n.status !== 'HEALTHY');
  if (unhealthyNodes.length > 0) {
    issues.push({ severity: 'high', message: `${unhealthyNodes.length} node(s) not healthy: ${unhealthyNodes.map(n => n.name).join(', ')}`, recommendation: 'Investigate and resolve node health issues' });
    score -= unhealthyNodes.length * 10;
  }

  // Check topology consistency
  if (cluster?.topology === 'MULTI_REGION' && nodes.length < 3) {
    issues.push({ severity: 'medium', message: 'Multi-region topology requires nodes in multiple regions', recommendation: 'Add nodes in additional regions for proper multi-region setup' });
    score -= 15;
  }

  return {
    valid: issues.filter(i => i.severity === 'critical').length === 0,
    score: Math.max(0, score),
    issues,
    summary: issues.length === 0 
      ? 'Configuration follows PostgreSQL best practices for high availability.'
      : `Found ${issues.length} configuration issue(s). Score: ${Math.max(0, score)}/100`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, clusterId } = body;

    let cluster = null;
    let nodes: any[] = [];
    
    if (clusterId) {
      cluster = await prisma.cluster.findUnique({
        where: { id: clusterId },
        include: { nodes: true, project: true },
      });
      nodes = cluster?.nodes || [];
    }

    let result: any = {};

    switch (action) {
      case 'generate_tests': {
        const tests: any[] = [];
        let id = 1;

        // Always include replication tests for clusters with replicas
        if (nodes.some(n => n.role === 'REPLICA')) {
          TEST_TEMPLATES.replication.forEach(t => tests.push({ ...t, id: `TC-${String(id++).padStart(3, '0')}` }));
        }

        // Include failover tests for HA/multi-region topologies
        if (cluster?.topology === 'HA' || cluster?.topology === 'MULTI_REGION') {
          TEST_TEMPLATES.failover.forEach(t => tests.push({ ...t, id: `TC-${String(id++).padStart(3, '0')}` }));
        }

        // Always include performance tests
        TEST_TEMPLATES.performance.forEach(t => tests.push({ ...t, id: `TC-${String(id++).padStart(3, '0')}` }));

        // Include integrity tests
        TEST_TEMPLATES.integrity.forEach(t => tests.push({ ...t, id: `TC-${String(id++).padStart(3, '0')}` }));

        // Include backup tests
        TEST_TEMPLATES.backup.forEach(t => tests.push({ ...t, id: `TC-${String(id++).padStart(3, '0')}` }));

        result = { tests };
        break;
      }

      case 'analyze_query': {
        const { query } = body;
        if (!query) {
          return NextResponse.json({ error: 'Query is required' }, { status: 400 });
        }
        result = analyzeQuery(query);
        break;
      }

      case 'suggest_scenarios': {
        const scenarios = SCENARIO_TEMPLATES.map((s, i) => ({
          ...s,
          id: `SC-${String(i + 1).padStart(3, '0')}`,
        }));

        // Filter scenarios based on cluster topology
        const filteredScenarios = scenarios.filter(s => {
          if (s.category === 'Failover' && nodes.length < 2) return false;
          if (s.category === 'Replication' && !nodes.some(n => n.role === 'REPLICA')) return false;
          return true;
        });

        result = { scenarios: filteredScenarios };
        break;
      }

      case 'validate_config': {
        result = validateConfig(cluster, nodes);
        break;
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('QA Copilot error:', error);
    return NextResponse.json(
      { error: 'Failed to process QA request' },
      { status: 500 }
    );
  }
}
