export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get('clusterId');

    const forecasts = await prisma.forecast.findMany({
      where: clusterId ? { clusterId } : {},
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json(forecasts);
  } catch (error) {
    console.error('Error fetching forecasts:', error);
    return NextResponse.json({ error: 'Failed to fetch forecasts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { clusterId } = body;

    if (!clusterId) {
      return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
    }

    // Get recent metrics for forecasting
    const metrics = await prisma.metric.findMany({
      where: {
        clusterId,
        timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { timestamp: 'desc' },
    });

    // Group by metric name and calculate trends
    const metricGroups: Record<string, number[]> = {};
    metrics.forEach(m => {
      if (!metricGroups[m.name]) metricGroups[m.name] = [];
      metricGroups[m.name].push(m.value);
    });

    const forecasts = [];
    const now = new Date();

    // Disk usage forecast
    if (metricGroups['disk_usage'] && metricGroups['disk_usage'].length > 1) {
      const values = metricGroups['disk_usage'];
      const currentValue = values[0];
      const avgGrowth = (values[0] - values[values.length - 1]) / values.length;
      const daysToFull = avgGrowth > 0 ? Math.floor((100 - currentValue) / avgGrowth) : 999;
      const predictedValue = Math.min(currentValue + avgGrowth * 7 * 24, 100); // 7 days forecast
      
      forecasts.push({
        clusterId,
        metricType: 'disk_usage',
        currentValue,
        predictedValue,
        predictedAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        confidence: 0.85,
        riskLevel: daysToFull < 14 ? 'HIGH' : daysToFull < 30 ? 'MEDIUM' : 'LOW',
        description: `Disk usage is projected to reach ${predictedValue.toFixed(1)}% in 7 days based on current growth trends. ${daysToFull < 30 ? `Storage exhaustion expected in approximately ${daysToFull} days.` : 'Storage capacity is healthy.'}`,
      });
    }

    // Connection capacity forecast
    if (metricGroups['active_connections'] && metricGroups['active_connections'].length > 1) {
      const values = metricGroups['active_connections'];
      const currentValue = values[0];
      const maxConnections = 200; // Simulated max
      const avgGrowth = (values[0] - values[values.length - 1]) / values.length;
      const predictedValue = Math.min(currentValue + avgGrowth * 7 * 24, maxConnections);
      const utilizationPct = (currentValue / maxConnections) * 100;
      
      forecasts.push({
        clusterId,
        metricType: 'connection_capacity',
        currentValue,
        predictedValue,
        predictedAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        confidence: 0.75,
        riskLevel: utilizationPct > 80 ? 'HIGH' : utilizationPct > 60 ? 'MEDIUM' : 'LOW',
        description: `Connection pool is at ${utilizationPct.toFixed(0)}% capacity (${currentValue}/${maxConnections}). ${utilizationPct > 70 ? 'Consider increasing max_connections or implementing connection pooling.' : 'Connection capacity is healthy.'}`,
      });
    }

    // Replication stability forecast
    if (metricGroups['replication_lag'] && metricGroups['replication_lag'].length > 1) {
      const values = metricGroups['replication_lag'];
      const avgLag = values.reduce((a, b) => a + b, 0) / values.length;
      const maxLag = Math.max(...values);
      const variance = values.reduce((sum, v) => sum + Math.pow(v - avgLag, 2), 0) / values.length;
      const instability = variance > 1000;
      
      forecasts.push({
        clusterId,
        metricType: 'replication_stability',
        currentValue: avgLag,
        predictedValue: instability ? avgLag * 1.5 : avgLag,
        predictedAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        confidence: 0.7,
        riskLevel: maxLag > 500 ? 'HIGH' : maxLag > 200 ? 'MEDIUM' : 'LOW',
        description: `Average replication lag is ${avgLag.toFixed(0)}ms with peak of ${maxLag.toFixed(0)}ms. ${instability ? 'High variance detected - replication may become unstable under load.' : 'Replication is stable.'}`,
      });
    }

    // SLO breach probability
    if (metricGroups['query_latency_p95'] && metricGroups['query_latency_p95'].length > 1) {
      const values = metricGroups['query_latency_p95'];
      const avgLatency = values.reduce((a, b) => a + b, 0) / values.length;
      const sloTarget = 50; // 50ms SLO
      const breachCount = values.filter(v => v > sloTarget).length;
      const breachProbability = (breachCount / values.length) * 100;
      
      forecasts.push({
        clusterId,
        metricType: 'slo_breach_probability',
        currentValue: breachProbability,
        predictedValue: Math.min(breachProbability * 1.1, 100),
        predictedAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        confidence: 0.8,
        riskLevel: breachProbability > 10 ? 'HIGH' : breachProbability > 5 ? 'MEDIUM' : 'LOW',
        description: `Current SLO breach probability is ${breachProbability.toFixed(1)}% (target: ${sloTarget}ms P95 latency). ${breachProbability > 5 ? 'Query optimization or capacity increase recommended.' : 'SLO compliance is healthy.'}`,
      });
    }

    // Save forecasts to database
    if (forecasts.length > 0) {
      await prisma.forecast.createMany({
        data: forecasts,
      });
    }

    return NextResponse.json(forecasts);
  } catch (error) {
    console.error('Error generating forecasts:', error);
    return NextResponse.json({ error: 'Failed to generate forecasts' }, { status: 500 });
  }
}
