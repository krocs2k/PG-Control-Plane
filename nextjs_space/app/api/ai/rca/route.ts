export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { clusterId, issueDescription, incidentId } = body;

    if (!clusterId) {
      return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
    }

    // Gather evidence from multiple sources
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      include: {
        nodes: true,
        project: { include: { organization: true } },
      },
    });

    if (!cluster) {
      return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
    }

    // Get recent anomalies
    const anomalies = await prisma.anomaly.findMany({
      where: {
        clusterId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get recent metrics
    const metrics = await prisma.metric.findMany({
      where: {
        clusterId,
        timestamp: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    // Get recent audit logs (config changes)
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: { in: ['Cluster', 'Node'] },
        timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { timestamp: 'desc' },
      take: 20,
    });

    // Get recent incidents
    const incidents = await prisma.incident.findMany({
      where: {
        clusterId,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Build context for LLM
    const context = `
Cluster Information:
- Name: ${cluster.name}
- Status: ${cluster.status}
- Topology: ${cluster.topology}
- Replication Mode: ${cluster.replicationMode}
- Nodes: ${cluster.nodes.map(n => `${n.name} (${n.role}, ${n.status})`).join(', ')}

Recent Anomalies (last 24h):
${anomalies.map(a => `- [${a.createdAt.toISOString()}] ${a.severity} - ${a.type}: ${a.title}`).join('\n') || 'None detected'}

Metric Trends (last 6h):
${summarizeMetrics(metrics)}

Recent Configuration Changes:
${auditLogs.map(l => `- [${l.timestamp.toISOString()}] ${l.action} on ${l.entityType}`).join('\n') || 'None'}

Past Incidents (last 7 days):
${incidents.map(i => `- [${i.severity}] ${i.title}: ${i.status}`).join('\n') || 'None'}

Issue to Analyze:
${issueDescription || 'General system health and potential issues'}
`;

    // Call LLM for RCA
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
            content: `You are an expert PostgreSQL DBRE performing root cause analysis. Analyze the provided evidence and determine the most likely root cause(s) of the issue. Structure your response as JSON with the following format:
{
  "summary": "Brief summary of the issue",
  "rootCause": "Most likely root cause",
  "contributingFactors": ["factor1", "factor2"],
  "evidenceChain": [
    {"timestamp": "ISO timestamp", "event": "description", "relevance": "how it relates to the issue"}
  ],
  "recommendations": [
    {"priority": "HIGH|MEDIUM|LOW", "action": "what to do", "rationale": "why"}
  ],
  "preventionSuggestions": ["suggestion1", "suggestion2"]
}
Respond with raw JSON only.`,
          },
          {
            role: 'user',
            content: context,
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('LLM API error:', error);
      return NextResponse.json({ error: 'Failed to perform RCA' }, { status: 500 });
    }

    const llmResult = await response.json();
    const rcaContent = llmResult.choices?.[0]?.message?.content;

    let rca;
    try {
      rca = JSON.parse(rcaContent);
    } catch (e) {
      rca = { summary: rcaContent, error: 'Failed to parse structured response' };
    }

    // If incidentId provided, update the incident with RCA
    if (incidentId) {
      await prisma.incident.update({
        where: { id: incidentId },
        data: {
          rootCause: rca.rootCause,
          status: 'IDENTIFIED',
        },
      });
    }

    return NextResponse.json({
      clusterId,
      rca,
      evidenceSources: {
        anomalies: anomalies.length,
        metrics: metrics.length,
        auditLogs: auditLogs.length,
        incidents: incidents.length,
      },
    });
  } catch (error) {
    console.error('Error performing RCA:', error);
    return NextResponse.json({ error: 'Failed to perform RCA' }, { status: 500 });
  }
}

function summarizeMetrics(metrics: any[]) {
  const grouped: Record<string, number[]> = {};
  metrics.forEach(m => {
    if (!grouped[m.name]) grouped[m.name] = [];
    grouped[m.name].push(m.value);
  });

  return Object.entries(grouped)
    .map(([name, values]) => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      return `- ${name}: avg=${avg.toFixed(2)}, min=${min.toFixed(2)}, max=${max.toFixed(2)}`;
    })
    .join('\n');
}
