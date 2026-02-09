export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const SYSTEM_PROMPT = `You are an expert PostgreSQL Database Reliability Engineer (DBRE) and AI assistant for BroadPlane-DB. You help users manage PostgreSQL clusters, diagnose issues, and optimize performance.

You have access to the following tools that you can call by responding with JSON in this format:
{"tool": "tool_name", "params": {...}}

Available tools:
1. queryMetrics(clusterId, metricName, hours) - Get metrics data for a cluster
2. queryAnomalies(clusterId, severity) - Get detected anomalies
3. queryForecasts(clusterId) - Get AI forecasts
4. getTopology(clusterId) - Get cluster topology and node status
5. getRecommendations(clusterId, status) - Get AI recommendations
6. proposeChange(clusterId, changeType, description) - Propose a configuration change
7. runRCA(clusterId, issueDescription) - Run root cause analysis
8. generateReport(clusterId, reportType) - Generate a report

When answering questions:
- Be specific and cite evidence (metric values, timestamps, event IDs)
- Explain the reasoning behind your recommendations
- Consider the impact and risk of any suggested changes
- If you need more information, ask clarifying questions
- If you cannot determine something, say so rather than guessing

Current context will be provided in each message.`;

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { message, sessionId, clusterId, context } = body;

    if (!message || !sessionId) {
      return NextResponse.json({ error: 'message and sessionId are required' }, { status: 400 });
    }

    // Get chat history for this session
    const history = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 20, // Last 20 messages for context
    });

    // Build context about the cluster if provided
    let clusterContext = '';
    if (clusterId) {
      const cluster = await prisma.cluster.findUnique({
        where: { id: clusterId },
        include: {
          nodes: true,
          project: { include: { organization: true } },
        },
      });

      if (cluster) {
        const anomalies = await prisma.anomaly.findMany({
          where: { clusterId, resolved: false },
          orderBy: { createdAt: 'desc' },
          take: 5,
        });

        const forecasts = await prisma.forecast.findMany({
          where: { clusterId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        });

        clusterContext = `

Current Cluster Context:
- Cluster: ${cluster.name} (ID: ${cluster.id})
- Organization: ${cluster.project?.organization?.name}
- Project: ${cluster.project?.name} (${cluster.project?.environment})
- Status: ${cluster.status}
- Topology: ${cluster.topology}
- Replication Mode: ${cluster.replicationMode}
- Nodes: ${cluster.nodes.length} (${cluster.nodes.filter(n => n.role === 'PRIMARY').length} primary, ${cluster.nodes.filter(n => n.role === 'REPLICA').length} replicas)
  ${cluster.nodes.map(n => `  - ${n.name}: ${n.role} @ ${n.host}:${n.port} [${n.status}]`).join('\n')}

Active Anomalies (${anomalies.length}):
${anomalies.map(a => `- [${a.severity}] ${a.title}: ${a.description.substring(0, 100)}...`).join('\n') || 'None'}

Recent Forecasts:
${forecasts.map(f => `- ${f.metricType}: ${f.riskLevel} risk - ${f.description.substring(0, 80)}...`).join('\n') || 'None'}
`;
      }
    }

    // Save user message
    await prisma.chatMessage.create({
      data: {
        sessionId,
        clusterId,
        role: 'user',
        content: message,
      },
    });

    // Build messages array for LLM
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + clusterContext },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message + (context ? `\n\nAdditional context: ${context}` : '') },
    ];

    // Call LLM API with streaming
    const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages,
        stream: true,
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('LLM API error:', error);
      return NextResponse.json({ error: 'Failed to get AI response' }, { status: 500 });
    }

    // Stream the response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    let fullContent = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let partialRead = '';
          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;

            partialRead += decoder.decode(value, { stream: true });
            const lines = partialRead.split('\n');
            partialRead = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  // Save assistant message to database
                  await prisma.chatMessage.create({
                    data: {
                      sessionId,
                      clusterId,
                      role: 'assistant',
                      content: fullContent,
                    },
                  });
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                  return;
                }
                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content || '';
                  if (content) {
                    fullContent += content;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in chat:', error);
    return NextResponse.json({ error: 'Failed to process chat' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(messages);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return NextResponse.json({ error: 'Failed to fetch chat history' }, { status: 500 });
  }
}
