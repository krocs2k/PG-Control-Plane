export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

// PostgreSQL version database
const PG_VERSIONS = {
  '17': { released: '2024-09-26', eol: '2029-11-13', status: 'current', lts: false },
  '16': { released: '2023-09-14', eol: '2028-11-09', status: 'supported', lts: true },
  '15': { released: '2022-10-13', eol: '2027-11-11', status: 'supported', lts: false },
  '14': { released: '2021-09-30', eol: '2026-11-12', status: 'supported', lts: false },
  '13': { released: '2020-09-24', eol: '2025-11-13', status: 'supported', lts: false },
  '12': { released: '2019-10-03', eol: '2024-11-14', status: 'eol-soon', lts: false },
};

// Feature highlights per version
const VERSION_FEATURES: Record<string, string[]> = {
  '17': [
    'Incremental backup support',
    'Enhanced JSON_TABLE function',
    'Improved COPY performance',
    'New pg_stat_checkpointer view',
    'Parallel CREATE INDEX improvements',
  ],
  '16': [
    'Logical replication from standby',
    'Parallel full/right outer hash joins',
    'SIMD-accelerated operations',
    'Extended statistics on expressions',
    'Improved query planning for window functions',
  ],
  '15': [
    'MERGE statement support',
    'Public/private schema separation',
    'LZ4/Zstd compression for pg_dump',
    'Improved in-memory and disk sorting',
    'Row-level security performance improvements',
  ],
};

// Extension recommendations
const EXTENSION_CATALOG = [
  { name: 'pg_stat_statements', version: '1.10', category: 'Monitoring', useCase: 'Track query execution statistics', installCommand: 'CREATE EXTENSION pg_stat_statements;', configTips: 'Add to shared_preload_libraries, set pg_stat_statements.track = all' },
  { name: 'pgaudit', version: '1.7', category: 'Security', useCase: 'Session and object audit logging', installCommand: 'CREATE EXTENSION pgaudit;', configTips: 'Configure pgaudit.log to specify audit scope' },
  { name: 'pg_repack', version: '1.5.0', category: 'Maintenance', useCase: 'Online table reorganization without locks', installCommand: 'CREATE EXTENSION pg_repack;', configTips: 'Run during low-traffic periods for best results' },
  { name: 'pg_cron', version: '1.6', category: 'Automation', useCase: 'Schedule database jobs from SQL', installCommand: 'CREATE EXTENSION pg_cron;', configTips: 'Add to shared_preload_libraries, requires cron.database_name setting' },
  { name: 'pgvector', version: '0.7.0', category: 'AI/ML', useCase: 'Vector similarity search for AI applications', installCommand: 'CREATE EXTENSION vector;', configTips: 'Create ivfflat or hnsw indexes for large datasets' },
  { name: 'timescaledb', version: '2.15', category: 'Time-Series', useCase: 'Time-series data optimization', installCommand: 'CREATE EXTENSION timescaledb;', configTips: 'Convert tables to hypertables for automatic partitioning' },
  { name: 'postgis', version: '3.4', category: 'Geospatial', useCase: 'Geographic object support', installCommand: 'CREATE EXTENSION postgis;', configTips: 'Use spatial indexes (GiST) for geometry columns' },
  { name: 'pg_partman', version: '5.0', category: 'Partitioning', useCase: 'Automated partition management', installCommand: 'CREATE EXTENSION pg_partman;', configTips: 'Use with pg_cron for automated maintenance' },
];

// Configuration recommendations based on workload
const CONFIG_TEMPLATES: Record<string, any[]> = {
  oltp: [
    { parameter: 'shared_buffers', recommendedValue: '25% of RAM', impact: 'high', explanation: 'Main memory cache for data pages' },
    { parameter: 'effective_cache_size', recommendedValue: '75% of RAM', impact: 'medium', explanation: 'Estimate of OS file cache' },
    { parameter: 'work_mem', recommendedValue: '64MB', impact: 'medium', explanation: 'Memory for sort operations per connection' },
    { parameter: 'maintenance_work_mem', recommendedValue: '2GB', impact: 'medium', explanation: 'Memory for maintenance operations' },
    { parameter: 'wal_buffers', recommendedValue: '64MB', impact: 'medium', explanation: 'WAL write buffer size' },
    { parameter: 'checkpoint_completion_target', recommendedValue: '0.9', impact: 'high', explanation: 'Spread checkpoint writes over time' },
    { parameter: 'random_page_cost', recommendedValue: '1.1', impact: 'medium', explanation: 'SSD-optimized random I/O cost' },
    { parameter: 'effective_io_concurrency', recommendedValue: '200', impact: 'medium', explanation: 'Concurrent I/O operations for SSD' },
  ],
  olap: [
    { parameter: 'shared_buffers', recommendedValue: '40% of RAM', impact: 'high', explanation: 'Larger cache for analytical workloads' },
    { parameter: 'effective_cache_size', recommendedValue: '80% of RAM', impact: 'medium', explanation: 'Higher estimate for large scans' },
    { parameter: 'work_mem', recommendedValue: '512MB', impact: 'high', explanation: 'Large sorts and hash operations' },
    { parameter: 'maintenance_work_mem', recommendedValue: '4GB', impact: 'medium', explanation: 'Faster index builds' },
    { parameter: 'max_parallel_workers_per_gather', recommendedValue: '4', impact: 'high', explanation: 'Parallel query execution' },
    { parameter: 'max_parallel_workers', recommendedValue: '8', impact: 'high', explanation: 'Total parallel workers' },
    { parameter: 'parallel_tuple_cost', recommendedValue: '0.01', impact: 'medium', explanation: 'Favor parallel plans' },
    { parameter: 'jit', recommendedValue: 'on', impact: 'medium', explanation: 'JIT compilation for complex queries' },
  ],
  mixed: [
    { parameter: 'shared_buffers', recommendedValue: '25% of RAM', impact: 'high', explanation: 'Balanced memory allocation' },
    { parameter: 'effective_cache_size', recommendedValue: '75% of RAM', impact: 'medium', explanation: 'Standard OS cache estimate' },
    { parameter: 'work_mem', recommendedValue: '128MB', impact: 'medium', explanation: 'Balanced for mixed workload' },
    { parameter: 'maintenance_work_mem', recommendedValue: '2GB', impact: 'medium', explanation: 'Reasonable maintenance budget' },
    { parameter: 'max_parallel_workers_per_gather', recommendedValue: '2', impact: 'medium', explanation: 'Conservative parallelism' },
    { parameter: 'checkpoint_completion_target', recommendedValue: '0.9', impact: 'high', explanation: 'Smooth checkpoint writes' },
    { parameter: 'wal_compression', recommendedValue: 'lz4', impact: 'medium', explanation: 'Reduce WAL volume' },
    { parameter: 'huge_pages', recommendedValue: 'try', impact: 'medium', explanation: 'Use huge pages if available' },
  ],
};

// Technology trends
const TECH_TRENDS = [
  { name: 'Kubernetes-Native PostgreSQL', description: 'Operators like CloudNativePG and Crunchy PGO for automated management', relevance: 'high', adoptionLevel: 'growing', timeframe: 'current' },
  { name: 'Vector Databases', description: 'pgvector enabling AI/ML workloads within PostgreSQL', relevance: 'high', adoptionLevel: 'rapid-growth', timeframe: 'current' },
  { name: 'Distributed PostgreSQL', description: 'Citus, YugabyteDB, CockroachDB for horizontal scaling', relevance: 'medium', adoptionLevel: 'established', timeframe: 'current' },
  { name: 'Serverless PostgreSQL', description: 'Auto-scaling, pay-per-query models like Neon, Aurora Serverless', relevance: 'medium', adoptionLevel: 'emerging', timeframe: '1-2 years' },
  { name: 'Observability Integration', description: 'Deep integration with OpenTelemetry, Prometheus, Grafana', relevance: 'high', adoptionLevel: 'standard', timeframe: 'current' },
  { name: 'AI-Powered Operations', description: 'ML-driven query optimization and anomaly detection', relevance: 'medium', adoptionLevel: 'emerging', timeframe: '2-3 years' },
];

const EMERGING_TOOLS = [
  { name: 'CloudNativePG', category: 'Kubernetes Operator', description: 'Cloud-native PostgreSQL operator for Kubernetes', maturity: 'production-ready' },
  { name: 'Neon', category: 'Serverless', description: 'Serverless PostgreSQL with branching', maturity: 'production-ready' },
  { name: 'Supabase', category: 'Platform', description: 'Open-source Firebase alternative built on PostgreSQL', maturity: 'production-ready' },
  { name: 'pgvector', category: 'AI/ML', description: 'Vector similarity search extension', maturity: 'production-ready' },
  { name: 'pg_duckdb', category: 'Analytics', description: 'DuckDB integration for analytical queries', maturity: 'experimental' },
  { name: 'OrioleDB', category: 'Storage Engine', description: 'Alternative table access method for PostgreSQL', maturity: 'beta' },
];

function getVersionRecommendations(currentVersion: string, clusters: any[]): any {
  const currentMajor = currentVersion?.match(/(\d+)/)?.[1] || '14';
  const current = PG_VERSIONS[currentMajor as keyof typeof PG_VERSIONS];
  
  // Recommend latest LTS or current version
  const recommended = '16';
  const recommendedInfo = PG_VERSIONS['16'];

  const upgradeUrgency = currentMajor === '12' ? 'critical' 
    : currentMajor === '13' ? 'high'
    : currentMajor === '14' ? 'medium' 
    : 'low';

  const newFeatures = VERSION_FEATURES[recommended] || [];
  
  const securityFixes = [
    'CVE-2024-XXXX: Fixed potential SQL injection in certain functions',
    'Improved password hashing algorithm support',
    'Enhanced row-level security policy enforcement',
    'Fixed privilege escalation in extension installation',
  ];

  const upgradeSteps = [
    'Review release notes and breaking changes',
    'Test application compatibility in staging environment',
    'Backup all databases using pg_dump or pg_basebackup',
    'Use pg_upgrade for in-place major version upgrade',
    'Run ANALYZE on all tables post-upgrade',
    'Monitor for performance regressions',
    'Update connection strings and client libraries',
  ];

  const risks = [
    { risk: 'Extension compatibility', mitigation: 'Verify all extensions support target version' },
    { risk: 'Query plan changes', mitigation: 'Test critical queries in staging first' },
    { risk: 'Application compatibility', mitigation: 'Review deprecated features in release notes' },
    { risk: 'Downtime during upgrade', mitigation: 'Use logical replication for minimal downtime' },
  ];

  return {
    currentVersion: `PostgreSQL ${currentMajor}`,
    recommendedVersion: `PostgreSQL ${recommended}`,
    releaseDate: recommendedInfo.released,
    eolDate: current?.eol || 'N/A',
    upgradeUrgency,
    newFeatures,
    securityFixes,
    upgradeSteps,
    risks,
    summary: `Currently running PostgreSQL ${currentMajor}. ${upgradeUrgency === 'critical' ? 'URGENT: ' : ''}Recommend upgrading to PostgreSQL ${recommended} for improved performance and security.`,
  };
}

function getExtensionSuggestions(clusters: any[], workloadType: string): any {
  const recommended = EXTENSION_CATALOG.filter(ext => {
    // Always recommend monitoring extensions
    if (ext.category === 'Monitoring' || ext.category === 'Security') return true;
    // Recommend based on workload
    if (workloadType === 'olap' && (ext.category === 'Partitioning' || ext.name === 'timescaledb')) return true;
    if (workloadType === 'ai' && ext.name === 'pgvector') return true;
    // General recommendations
    if (ext.category === 'Maintenance' || ext.category === 'Automation') return true;
    return false;
  });

  const alreadyOptimal = ['pg_buffercache', 'pg_prewarm'];

  const notRecommended = [
    { name: 'pg_hint_plan', reason: 'Can hide underlying query planning issues' },
    { name: 'pg_stat_kcache', reason: 'Requires kernel support, complex setup' },
  ];

  return {
    recommended,
    alreadyOptimal,
    notRecommended,
    totalRecommended: recommended.length,
    summary: `Recommended ${recommended.length} extensions for your ${workloadType || 'mixed'} workload. Priority: pg_stat_statements for monitoring.`,
  };
}

function getConfigOptimization(workloadType: string, clusters: any[]): any {
  const type = workloadType?.toLowerCase() || 'mixed';
  const template = CONFIG_TEMPLATES[type] || CONFIG_TEMPLATES.mixed;
  
  const recommendations = template.map(r => ({
    ...r,
    currentValue: 'default',
  }));

  const warnings = [
    'Always test configuration changes in staging first',
    'Monitor memory usage after increasing shared_buffers',
    'Restart required for some parameters (shared_buffers, huge_pages)',
    'work_mem is per-operation, not per-connection',
  ];

  return {
    category: type.toUpperCase(),
    currentAssumption: 'Default PostgreSQL configuration',
    recommendations,
    estimatedImprovement: type === 'olap' ? '40-60%' : type === 'oltp' ? '20-40%' : '25-45%',
    warnings,
    summary: `Generated ${recommendations.length} configuration recommendations for ${type.toUpperCase()} workload. Expected ${type === 'olap' ? '40-60%' : '20-40%'} performance improvement.`,
  };
}

function getUpgradePath(currentVersion: string, clusters: any[]): any {
  const currentMajor = currentVersion?.match(/(\d+)/)?.[1] || '14';
  const targetVersion = '17';

  const phases = [
    {
      phase: 'Preparation',
      duration: '1-2 weeks',
      steps: [
        'Audit current extensions and their version compatibility',
        'Review application SQL for deprecated features',
        'Set up staging environment with target version',
        'Document current performance baselines',
      ],
      risks: ['Missed compatibility issues'],
      rollbackPlan: 'No changes made yet - abort upgrade planning',
    },
    {
      phase: 'Testing',
      duration: '2-4 weeks',
      steps: [
        'Restore production backup to staging with new version',
        'Run full application test suite',
        'Execute performance benchmarks',
        'Test failover and recovery procedures',
      ],
      risks: ['Performance regressions', 'Application bugs'],
      rollbackPlan: 'Fix issues in staging before proceeding',
    },
    {
      phase: 'Execution',
      duration: '2-4 hours',
      steps: [
        'Announce maintenance window',
        'Stop application connections',
        'Create final backup',
        'Run pg_upgrade or logical replication cutover',
        'Verify data integrity',
        'Run ANALYZE on all tables',
      ],
      risks: ['Extended downtime', 'Data corruption'],
      rollbackPlan: 'Restore from pre-upgrade backup',
    },
    {
      phase: 'Validation',
      duration: '1 week',
      steps: [
        'Monitor application performance',
        'Check error logs for issues',
        'Validate all scheduled jobs work correctly',
        'Confirm replication is healthy',
      ],
      risks: ['Latent issues in production'],
      rollbackPlan: 'Maintain backup for 1 week, be prepared for emergency restore',
    },
  ];

  const prerequisites = [
    'Disk space for pg_upgrade (2x database size)',
    'Application compatibility verified',
    'Backup and restore tested',
    'Maintenance window scheduled',
    'Rollback plan documented and tested',
  ];

  const postUpgradeChecks = [
    'SELECT version() returns expected version',
    'All tables accessible and queryable',
    'Replication streaming normally',
    'No errors in PostgreSQL logs',
    'Application health checks passing',
    'Performance metrics within expected range',
  ];

  return {
    fromVersion: `PostgreSQL ${currentMajor}`,
    toVersion: `PostgreSQL ${targetVersion}`,
    estimatedDowntime: clusters.some(c => c.topology === 'HA') ? '< 1 minute (with logical replication)' : '2-4 hours',
    phases,
    prerequisites,
    postUpgradeChecks,
    summary: `Upgrade path from PostgreSQL ${currentMajor} to ${targetVersion}. ${clusters.some(c => c.topology === 'HA') ? 'Minimal downtime possible with logical replication.' : 'Plan for 2-4 hour maintenance window.'}`,
  };
}

function getArchitectureReview(clusters: any[]): any {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: any[] = [];
  let score = 70; // Base score

  // Evaluate HA configuration
  const haClusterCount = clusters.filter(c => c.topology === 'HA' || c.topology === 'MULTI_REGION').length;
  if (haClusterCount === clusters.length && clusters.length > 0) {
    strengths.push('All clusters configured for high availability');
    score += 10;
  } else if (haClusterCount > 0) {
    weaknesses.push('Some clusters lack HA configuration');
    recommendations.push({ area: 'Topology', current: 'Mixed HA/Standard', suggested: 'HA for all production clusters', effort: 'medium', impact: 'high' });
  } else if (clusters.length > 0) {
    weaknesses.push('No HA configured');
    score -= 15;
    recommendations.push({ area: 'Topology', current: 'Standard', suggested: 'Implement HA topology', effort: 'high', impact: 'critical' });
  }

  // Evaluate replication
  const syncReplCount = clusters.filter(c => c.replicationMode === 'SYNC').length;
  if (syncReplCount > 0) {
    strengths.push('Synchronous replication in use for data durability');
    score += 5;
  } else if (clusters.length > 0) {
    weaknesses.push('No synchronous replication configured');
    recommendations.push({ area: 'Replication', current: 'Async only', suggested: 'Add sync replication for critical data', effort: 'low', impact: 'high' });
  }

  // Evaluate node distribution
  const totalNodes = clusters.reduce((sum, c) => sum + (c.nodes?.length || 0), 0);
  if (totalNodes >= 3) {
    strengths.push('Good node distribution for redundancy');
    score += 5;
  }
  if (totalNodes < clusters.length * 2 && clusters.length > 0) {
    weaknesses.push('Limited node count per cluster');
    recommendations.push({ area: 'Capacity', current: `${totalNodes} total nodes`, suggested: 'Add replicas for read scaling', effort: 'medium', impact: 'medium' });
  }

  // Multi-region check
  const multiRegion = clusters.filter(c => c.topology === 'MULTI_REGION').length;
  if (multiRegion > 0) {
    strengths.push('Multi-region deployment for disaster recovery');
    score += 10;
  } else if (clusters.length > 0) {
    recommendations.push({ area: 'DR', current: 'Single region', suggested: 'Consider multi-region for DR', effort: 'high', impact: 'high' });
  }

  const futureConsiderations = [
    'Evaluate Kubernetes deployment with CloudNativePG operator',
    'Consider connection pooling with PgBouncer',
    'Implement automated failover testing',
    'Plan for horizontal read scaling',
    'Evaluate distributed PostgreSQL options for future growth',
  ];

  const currentArchitecture = clusters.length > 0
    ? `${clusters.length} cluster(s), ${totalNodes} total nodes, ${haClusterCount} HA-configured`
    : 'No clusters configured';

  return {
    currentArchitecture,
    score: Math.max(0, Math.min(100, score)),
    strengths,
    weaknesses,
    recommendations,
    futureConsiderations,
    summary: `Architecture score: ${Math.max(0, Math.min(100, score))}/100. ${strengths.length} strengths, ${weaknesses.length} areas for improvement.`,
  };
}

function getTechnologyTrends(): any {
  const deprecations = [
    'pg_dump --column-inserts deprecated for large datasets',
    'Recovery.conf removed in PostgreSQL 12+, use postgresql.conf',
    'wal_level = minimal becoming less recommended',
    'Trust authentication discouraged for production',
  ];

  const industryShifts = [
    'Cloud-native deployments becoming standard',
    'GitOps for database schema management',
    'Shift-left security with automated scanning',
    'Observability as a first-class concern',
  ];

  const actionItems = [
    'Evaluate pgvector for AI/ML use cases',
    'Consider Kubernetes-native deployment for new clusters',
    'Implement comprehensive observability stack',
    'Plan migration path from deprecated features',
    'Review cloud cost optimization opportunities',
  ];

  return {
    trends: TECH_TRENDS,
    emergingTools: EMERGING_TOOLS,
    deprecations,
    industryShifts,
    actionItems,
    summary: `Identified ${TECH_TRENDS.length} key trends and ${EMERGING_TOOLS.length} emerging tools. Priority: Kubernetes operators and vector database support.`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, clusterId, currentVersion, workloadType } = body;

    const clusters = await prisma.cluster.findMany({
      include: { nodes: true, project: true },
    });

    let result: any = {};

    switch (action) {
      case 'version_recommendations':
        result = getVersionRecommendations(currentVersion || 'PostgreSQL 14', clusters);
        break;

      case 'extension_suggestions':
        result = getExtensionSuggestions(clusters, workloadType || 'mixed');
        break;

      case 'config_optimization':
        result = getConfigOptimization(workloadType || 'mixed', clusters);
        break;

      case 'upgrade_path':
        result = getUpgradePath(currentVersion || 'PostgreSQL 14', clusters);
        break;

      case 'architecture_review':
        result = getArchitectureReview(clusters);
        break;

      case 'technology_trends':
        result = getTechnologyTrends();
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ action, ...result });
  } catch (error) {
    console.error('Tech Scout error:', error);
    return NextResponse.json(
      { error: 'Failed to process Tech Scout request' },
      { status: 500 }
    );
  }
}
