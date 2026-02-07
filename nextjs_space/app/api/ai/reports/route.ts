export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get('id');

    if (!reportId) {
      return NextResponse.json({ error: 'Report ID required' }, { status: 400 });
    }

    await prisma.report.delete({
      where: { id: reportId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting report:', error);
    return NextResponse.json({ error: 'Failed to delete report' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get('clusterId');
    const type = searchParams.get('type');

    const reports = await prisma.report.findMany({
      where: {
        ...(clusterId && { clusterId }),
        ...(type && { type }),
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json(reports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { clusterId, type, prompt } = body;

    // Gather data for report
    let reportData: any = {};
    let context = '';

    if (clusterId) {
      const cluster = await prisma.cluster.findUnique({
        where: { id: clusterId },
        include: {
          nodes: true,
          project: { include: { organization: true } },
        },
      });

      if (cluster) {
        reportData.cluster = cluster;

        // Get metrics
        const metrics = await prisma.metric.findMany({
          where: {
            clusterId,
            timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { timestamp: 'desc' },
        });
        reportData.metrics = metrics;

        // Get anomalies
        const anomalies = await prisma.anomaly.findMany({
          where: {
            clusterId,
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        });
        reportData.anomalies = anomalies;

        // Get incidents
        const incidents = await prisma.incident.findMany({
          where: {
            clusterId,
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        });
        reportData.incidents = incidents;

        // Get recommendations
        const recommendations = await prisma.recommendation.findMany({
          where: { clusterId },
        });
        reportData.recommendations = recommendations;

        context = `
Cluster: ${cluster.name}
Organization: ${cluster.project?.organization?.name}
Project: ${cluster.project?.name} (${cluster.project?.environment})
Status: ${cluster.status}
Topology: ${cluster.topology}
Replication: ${cluster.replicationMode}
Nodes: ${cluster.nodes.length}

Metrics Summary (last 7 days):
${summarizeMetricsForReport(metrics)}

Anomalies (last 30 days): ${anomalies.length} total
- Critical: ${anomalies.filter(a => a.severity === 'CRITICAL').length}
- High: ${anomalies.filter(a => a.severity === 'HIGH').length}
- Medium: ${anomalies.filter(a => a.severity === 'MEDIUM').length}
- Low: ${anomalies.filter(a => a.severity === 'LOW').length}

Incidents (last 30 days): ${incidents.length} total
- SEV1: ${incidents.filter(i => i.severity === 'SEV1').length}
- SEV2: ${incidents.filter(i => i.severity === 'SEV2').length}
- Resolved: ${incidents.filter(i => i.status === 'RESOLVED').length}

Recommendations:
- Pending: ${recommendations.filter(r => r.status === 'PENDING').length}
- Applied: ${recommendations.filter(r => r.status === 'APPLIED').length}
`;
      }
    }

    // Define report type prompts
    const reportPrompts: Record<string, string> = {
      sla: `Generate a comprehensive SLA report including:
1. Executive Summary
2. Uptime metrics and availability percentage
3. Incident summary with MTTR
4. SLO compliance status
5. Key risk areas
6. Recommendations for improvement`,
      
      capacity: `Generate a capacity planning report including:
1. Executive Summary
2. Current resource utilization (CPU, memory, disk, connections)
3. Growth trends and projections
4. Capacity risks and saturation forecasts
5. Scaling recommendations
6. Cost optimization opportunities`,
      
      incident: `Generate an incident summary report including:
1. Executive Summary
2. Incident timeline and statistics
3. Root cause analysis patterns
4. Mean time to detection (MTTD) and resolution (MTTR)
5. Recurring issues identification
6. Process improvement recommendations`,
      
      security: `Generate a security posture report including:
1. Executive Summary
2. Access control review
3. Configuration compliance status
4. Vulnerability assessment summary
5. Audit log analysis
6. Security recommendations`,
      
      custom: prompt || 'Generate a comprehensive cluster health and operations report.',
    };

    const reportPrompt = reportPrompts[type] || reportPrompts.custom;

    // Call LLM to generate report
    const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert PostgreSQL DBRE generating professional reports. Create detailed, actionable reports with specific metrics and recommendations. Use markdown formatting for the report content. Include specific numbers and evidence from the provided data.`,
          },
          {
            role: 'user',
            content: `${reportPrompt}\n\nData Context:\n${context}`,
          },
        ],
        max_tokens: 3000,
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('LLM API error:', error);
      return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
    }

    const llmResult = await response.json();
    const reportContent = llmResult.choices?.[0]?.message?.content || 'Failed to generate report content';

    // Generate title based on type
    const titles: Record<string, string> = {
      sla: 'SLA Compliance Report',
      capacity: 'Capacity Planning Report',
      incident: 'Incident Summary Report',
      security: 'Security Posture Report',
      custom: 'Custom Analysis Report',
    };

    // Save report to database
    const report = await prisma.report.create({
      data: {
        clusterId,
        title: titles[type] || 'Analysis Report',
        type: type || 'custom',
        prompt,
        content: reportContent,
        data: JSON.stringify(reportData),
        createdBy: session.user.id,
      },
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}

function summarizeMetricsForReport(metrics: any[]) {
  const grouped: Record<string, { values: number[]; unit: string }> = {};
  metrics.forEach(m => {
    if (!grouped[m.name]) grouped[m.name] = { values: [], unit: m.unit || '' };
    grouped[m.name].values.push(m.value);
  });

  return Object.entries(grouped)
    .map(([name, { values, unit }]) => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      const p95 = values.sort((a, b) => a - b)[Math.floor(values.length * 0.95)] || max;
      return `- ${name}: avg=${avg.toFixed(2)}${unit}, p95=${p95.toFixed(2)}${unit}, max=${max.toFixed(2)}${unit}`;
    })
    .join('\n');
}
