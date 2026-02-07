export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const ANOMALY_TEMPLATES = [
  {
    type: 'LAG_SPIKE',
    severity: 'HIGH',
    title: 'Replication Lag Spike Detected',
    description: 'Replication lag has exceeded the configured threshold of 100ms, currently at {value}ms. This may indicate network issues, high write load, or replica capacity constraints.',
  },
  {
    type: 'LATENCY_ANOMALY',
    severity: 'MEDIUM',
    title: 'Query Latency Anomaly',
    description: 'P95 query latency has increased by {value}% compared to the baseline. This deviation may be caused by slow queries, lock contention, or resource saturation.',
  },
  {
    type: 'DISK_PRESSURE',
    severity: 'HIGH',
    title: 'Disk Space Critical',
    description: 'Disk usage has reached {value}%. At current growth rate, disk exhaustion is expected in {days} days. Consider expanding storage or implementing cleanup policies.',
  },
  {
    type: 'CPU_SPIKE',
    severity: 'MEDIUM',
    title: 'CPU Usage Spike',
    description: 'CPU utilization has spiked to {value}%, which is {percent}% above normal. This may impact query performance and should be investigated.',
  },
  {
    type: 'CONNECTION_SURGE',
    severity: 'MEDIUM',
    title: 'Connection Pool Near Capacity',
    description: 'Active connections have reached {value} ({percent}% of max). Connection pooling or limit adjustments may be required.',
  },
  {
    type: 'WAL_GROWTH',
    severity: 'LOW',
    title: 'WAL Growth Above Normal',
    description: 'WAL write rate has increased to {value} MB/s, {percent}% above baseline. This may affect backup times and storage costs.',
  },
];

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get('clusterId');
    const resolved = searchParams.get('resolved');
    const severity = searchParams.get('severity');

    const anomalies = await prisma.anomaly.findMany({
      where: {
        ...(clusterId && { clusterId }),
        ...(resolved !== null && { resolved: resolved === 'true' }),
        ...(severity && { severity: severity as any }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json(anomalies);
  } catch (error) {
    console.error('Error fetching anomalies:', error);
    return NextResponse.json({ error: 'Failed to fetch anomalies' }, { status: 500 });
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

    if (action === 'detect') {
      // Simulate anomaly detection based on metrics
      const metrics = await prisma.metric.findMany({
        where: {
          clusterId,
          timestamp: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }, // Last 2 hours
        },
        orderBy: { timestamp: 'desc' },
      });

      const detectedAnomalies = [];

      // Check for lag spikes
      const lagMetrics = metrics.filter(m => m.name === 'replication_lag');
      const highLag = lagMetrics.find(m => m.value > 200);
      if (highLag) {
        const template = ANOMALY_TEMPLATES[0];
        detectedAnomalies.push({
          clusterId,
          nodeId: highLag.nodeId,
          type: template.type as any,
          severity: template.severity as any,
          title: template.title,
          description: template.description.replace('{value}', highLag.value.toFixed(0)),
          metricValue: highLag.value,
          threshold: 200,
          evidence: JSON.stringify({ metricId: highLag.id, timestamp: highLag.timestamp }),
        });
      }

      // Check for disk pressure
      const diskMetrics = metrics.filter(m => m.name === 'disk_usage');
      const highDisk = diskMetrics.find(m => m.value > 75);
      if (highDisk) {
        const template = ANOMALY_TEMPLATES[2];
        const growthRate = 0.5; // Simulated growth rate
        const daysLeft = Math.floor((100 - highDisk.value) / growthRate);
        detectedAnomalies.push({
          clusterId,
          nodeId: highDisk.nodeId,
          type: template.type as any,
          severity: highDisk.value > 85 ? 'CRITICAL' as any : template.severity as any,
          title: template.title,
          description: template.description
            .replace('{value}', highDisk.value.toFixed(1))
            .replace('{days}', String(daysLeft)),
          metricValue: highDisk.value,
          threshold: 75,
          evidence: JSON.stringify({ metricId: highDisk.id, daysToExhaustion: daysLeft }),
        });
      }

      // Check for CPU spike
      const cpuMetrics = metrics.filter(m => m.name === 'cpu_usage');
      const highCpu = cpuMetrics.find(m => m.value > 80);
      if (highCpu) {
        const template = ANOMALY_TEMPLATES[3];
        const baseline = 40;
        const increase = ((highCpu.value - baseline) / baseline * 100).toFixed(0);
        detectedAnomalies.push({
          clusterId,
          nodeId: highCpu.nodeId,
          type: template.type as any,
          severity: highCpu.value > 90 ? 'HIGH' as any : template.severity as any,
          title: template.title,
          description: template.description
            .replace('{value}', highCpu.value.toFixed(1))
            .replace('{percent}', increase),
          metricValue: highCpu.value,
          threshold: 80,
          evidence: JSON.stringify({ metricId: highCpu.id, baseline }),
        });
      }

      // Create anomalies in database
      if (detectedAnomalies.length > 0) {
        await prisma.anomaly.createMany({
          data: detectedAnomalies,
          skipDuplicates: true,
        });
      }

      return NextResponse.json({
        detected: detectedAnomalies.length,
        anomalies: detectedAnomalies,
      });
    }

    // Create custom anomaly
    const anomaly = await prisma.anomaly.create({
      data: body,
    });

    return NextResponse.json(anomaly);
  } catch (error) {
    console.error('Error creating anomaly:', error);
    return NextResponse.json({ error: 'Failed to create anomaly' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, resolved } = body;

    const anomaly = await prisma.anomaly.update({
      where: { id },
      data: {
        resolved,
        resolvedAt: resolved ? new Date() : null,
      },
    });

    return NextResponse.json(anomaly);
  } catch (error) {
    console.error('Error updating anomaly:', error);
    return NextResponse.json({ error: 'Failed to update anomaly' }, { status: 500 });
  }
}
