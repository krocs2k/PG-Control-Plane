export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get('clusterId');
    const status = searchParams.get('status');

    const recommendations = await prisma.recommendation.findMany({
      where: {
        ...(clusterId && { clusterId }),
        ...(status && { status: status as any }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json(recommendations);
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    return NextResponse.json({ error: 'Failed to fetch recommendations' }, { status: 500 });
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

    if (action === 'generate') {
      if (!clusterId) {
        return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
      }

      // Get anomalies and forecasts to generate recommendations
      const anomalies = await prisma.anomaly.findMany({
        where: { clusterId, resolved: false },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const forecasts = await prisma.forecast.findMany({
        where: { clusterId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const recommendations = [];

      // Generate recommendations based on anomalies
      for (const anomaly of anomalies) {
        if (anomaly.type === 'LAG_SPIKE' && anomaly.metricValue) {
          recommendations.push({
            clusterId,
            type: 'LAG_THRESHOLD' as any,
            title: 'Adjust Replication Lag Threshold',
            description: `Current replication lag (${anomaly.metricValue.toFixed(0)}ms) exceeds threshold. Consider adjusting the lag threshold for read routing to prevent stale reads while maintaining read availability.`,
            impact: 'Reads will be routed only to replicas within the new lag threshold, improving data consistency but potentially reducing read throughput during lag spikes.',
            risk: 'LOW',
            evidence: JSON.stringify({ anomalyId: anomaly.id, currentLag: anomaly.metricValue }),
            currentValue: '100ms',
            proposedValue: '250ms',
          });
        }

        if (anomaly.type === 'DISK_PRESSURE' && anomaly.metricValue && anomaly.metricValue > 80) {
          recommendations.push({
            clusterId,
            type: 'VACUUM_BLOAT' as any,
            title: 'Run VACUUM to Reclaim Disk Space',
            description: `Disk usage is at ${anomaly.metricValue.toFixed(1)}%. Running VACUUM FULL on bloated tables can reclaim significant disk space and improve query performance.`,
            impact: 'VACUUM FULL will lock tables during execution. Schedule during maintenance window.',
            risk: 'MEDIUM',
            evidence: JSON.stringify({ anomalyId: anomaly.id, diskUsage: anomaly.metricValue }),
            currentValue: `${anomaly.metricValue.toFixed(1)}% disk usage`,
            proposedValue: 'Run VACUUM FULL on large tables',
          });

          recommendations.push({
            clusterId,
            type: 'BACKUP_RETENTION' as any,
            title: 'Reduce Backup Retention Period',
            description: `Consider reducing backup retention from 30 days to 14 days to free up storage space while maintaining adequate recovery options.`,
            impact: 'Reduced point-in-time recovery window. Ensure compliance requirements are met.',
            risk: 'LOW',
            evidence: JSON.stringify({ anomalyId: anomaly.id, diskUsage: anomaly.metricValue }),
            currentValue: '30 days',
            proposedValue: '14 days',
          });
        }

        if (anomaly.type === 'CONNECTION_SURGE') {
          recommendations.push({
            clusterId,
            type: 'CONNECTION_POOLING' as any,
            title: 'Implement Connection Pooling',
            description: 'High connection count detected. Implementing or tuning connection pooling (PgBouncer) can reduce connection overhead and improve scalability.',
            impact: 'Requires application configuration changes. May affect long-running transactions.',
            risk: 'MEDIUM',
            evidence: JSON.stringify({ anomalyId: anomaly.id }),
            currentValue: 'Direct connections',
            proposedValue: 'PgBouncer with transaction pooling',
          });
        }
      }

      // Generate recommendations based on forecasts
      for (const forecast of forecasts) {
        if (forecast.riskLevel === 'HIGH' && forecast.metricType === 'disk_usage') {
          recommendations.push({
            clusterId,
            type: 'ADD_REPLICA' as any,
            title: 'Expand Storage Capacity',
            description: `Disk usage forecast indicates storage exhaustion risk. Consider expanding storage volume or adding a larger replica.`,
            impact: 'Storage expansion may require brief downtime or failover depending on infrastructure.',
            risk: 'LOW',
            evidence: JSON.stringify({ forecastId: forecast.id, predicted: forecast.predictedValue }),
            currentValue: `${forecast.currentValue.toFixed(1)}%`,
            proposedValue: 'Expand by 50%',
          });
        }

        if (forecast.riskLevel === 'HIGH' && forecast.metricType === 'connection_capacity') {
          recommendations.push({
            clusterId,
            type: 'ADD_REPLICA' as any,
            title: 'Add Read Replica for Load Distribution',
            description: 'Connection capacity is approaching limits. Adding a read replica can distribute query load and provide additional connection capacity.',
            impact: 'Additional infrastructure cost. Requires routing configuration update.',
            risk: 'LOW',
            evidence: JSON.stringify({ forecastId: forecast.id, currentConnections: forecast.currentValue }),
            currentValue: `${forecast.currentValue.toFixed(0)} connections`,
            proposedValue: 'Add 1 read replica',
          });
        }
      }

      // Save recommendations
      if (recommendations.length > 0) {
        await prisma.recommendation.createMany({
          data: recommendations,
        });
      }

      return NextResponse.json({
        generated: recommendations.length,
        recommendations,
      });
    }

    // Create custom recommendation
    const recommendation = await prisma.recommendation.create({
      data: body,
    });

    return NextResponse.json(recommendation);
  } catch (error) {
    console.error('Error creating recommendation:', error);
    return NextResponse.json({ error: 'Failed to create recommendation' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, action } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await prisma.recommendation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 });
    }

    let updateData: any = {};

    switch (action) {
      case 'approve':
        updateData = { status: 'APPROVED' };
        break;
      case 'apply':
        updateData = {
          status: 'APPLIED',
          appliedAt: new Date(),
          appliedBy: session.user.id,
        };
        break;
      case 'rollback':
        updateData = {
          status: 'ROLLED_BACK',
          rolledBackAt: new Date(),
          rolledBackBy: session.user.id,
        };
        break;
      case 'reject':
        updateData = { status: 'REJECTED' };
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const recommendation = await prisma.recommendation.update({
      where: { id },
      data: updateData,
    });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Recommendation',
      entityId: id,
      action: action.toUpperCase(),
      beforeState: existing,
      afterState: recommendation,
    });

    return NextResponse.json(recommendation);
  } catch (error) {
    console.error('Error updating recommendation:', error);
    return NextResponse.json({ error: 'Failed to update recommendation' }, { status: 500 });
  }
}
