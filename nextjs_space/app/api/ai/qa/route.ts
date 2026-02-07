import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const LLM_API_URL = 'https://routellm.abacus.ai/v1/chat/completions';
const API_KEY = process.env.ABACUSAI_API_KEY;

function parseJSONFromLLM(response: string): any {
  // Remove markdown code blocks if present
  let cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  
  // Try to find JSON array
  const arrayMatch = cleaned.match(/\[\s*\{[\s\S]*?\}\s*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch (e) {
      console.error('Array parse error:', e);
    }
  }
  
  // Try to find JSON object
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch (e) {
      console.error('Object parse error:', e);
    }
  }
  
  // Try parsing the whole response
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('Full parse error:', e);
    return null;
  }
}

async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch(LLM_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4000,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, clusterId, context } = body;

    let cluster = null;
    let nodes: any[] = [];
    
    if (clusterId) {
      cluster = await prisma.cluster.findUnique({
        where: { id: clusterId },
        include: { nodes: true, project: true },
      });
      nodes = cluster?.nodes || [];
    }

    const clusterContext = cluster ? `
Cluster: ${cluster.name}
Topology: ${cluster.topology}
Replication Mode: ${cluster.replicationMode}
Status: ${cluster.status}
Nodes: ${nodes.map(n => `${n.name} (${n.role}, ${n.status})`).join(', ')}
` : 'No specific cluster selected.';

    let result: any = {};

    switch (action) {
      case 'generate_tests': {
        const systemPrompt = `You are a PostgreSQL QA expert. Generate comprehensive test cases for PostgreSQL clusters.
Format your response as a JSON array of test objects with fields: id, category, name, description, sql (if applicable), expectedOutcome, priority (high/medium/low).`;
        
        const userPrompt = `Generate test cases for this PostgreSQL cluster configuration:
${clusterContext}

Context: ${context || 'General cluster testing'}

Generate 8-10 test cases covering: replication health, failover scenarios, performance benchmarks, data integrity, connection handling, and backup/recovery.`;
        
        const llmResponse = await callLLM(systemPrompt, userPrompt);
        const parsed = parseJSONFromLLM(llmResponse);
        result = {
          tests: Array.isArray(parsed) ? parsed : [],
          rawResponse: llmResponse,
        };
        break;
      }

      case 'analyze_query': {
        const { query } = body;
        const systemPrompt = `You are a PostgreSQL query optimization expert. Analyze SQL queries and provide detailed optimization recommendations.
Format your response as JSON with fields: analysis, issues (array), recommendations (array), optimizedQuery (if applicable), estimatedImprovement.`;
        
        const userPrompt = `Analyze this PostgreSQL query for the cluster:
${clusterContext}

Query to analyze:
${query}

Provide detailed analysis including potential performance issues, index recommendations, and optimized version if applicable.`;
        
        const llmResponse = await callLLM(systemPrompt, userPrompt);
        const parsed = parseJSONFromLLM(llmResponse);
        result = parsed || { analysis: llmResponse };
        break;
      }

      case 'suggest_scenarios': {
        const systemPrompt = `You are a PostgreSQL reliability engineer. Generate comprehensive test scenarios for cluster resilience.
Format your response as a JSON array of scenario objects with fields: id, name, category, steps (array), expectedBehavior, rollbackPlan, riskLevel (low/medium/high).`;
        
        const userPrompt = `Generate test scenarios for this PostgreSQL cluster:
${clusterContext}

Focus on: ${context || 'failover, replication lag, network partitions, resource exhaustion'}

Generate 5-7 realistic test scenarios that would validate cluster resilience.`;
        
        const llmResponse = await callLLM(systemPrompt, userPrompt);
        const parsed = parseJSONFromLLM(llmResponse);
        result = {
          scenarios: Array.isArray(parsed) ? parsed : [],
          rawResponse: llmResponse,
        };
        break;
      }

      case 'validate_config': {
        const systemPrompt = `You are a PostgreSQL configuration validator. Check configurations against best practices.
Format your response as JSON with fields: valid (boolean), score (0-100), issues (array of {severity, message, recommendation}), summary.`;
        
        const userPrompt = `Validate this PostgreSQL cluster configuration:
${clusterContext}

Check for: proper replication setup, node distribution, failover readiness, and configuration consistency.`;
        
        const llmResponse = await callLLM(systemPrompt, userPrompt);
        const parsed = parseJSONFromLLM(llmResponse);
        result = parsed || { summary: llmResponse };
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
