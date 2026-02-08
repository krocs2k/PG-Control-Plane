import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const LLM_API_URL = 'https://apps.abacus.ai/v1/chat/completions';
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
      model: 'gpt-4.1-mini',
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
    const { action, clusterId, currentVersion, workloadType } = body;

    const clusters = await prisma.cluster.findMany({
      include: { nodes: true, project: true },
    });

    const targetCluster = clusterId
      ? clusters.find(c => c.id === clusterId)
      : null;

    const infrastructureContext = `
Total Clusters: ${clusters.length}
Cluster Configurations:
${clusters.map(c => `- ${c.name}: ${c.topology}, ${c.replicationMode}, ${c.nodes?.length || 0} nodes`).join('\n')}
${targetCluster ? `\nTarget Cluster: ${targetCluster.name}` : ''}
`;

    let result: any = {};

    switch (action) {
      case 'version_recommendations': {
        const systemPrompt = `You are a PostgreSQL version expert. Provide upgrade recommendations based on current setup and industry trends.
Format your response as JSON with fields: currentVersion, recommendedVersion, releaseDate, eolDate, upgradeUrgency (low/medium/high/critical), newFeatures (array), securityFixes (array), upgradeSteps (array), risks (array), summary.`;
        
        const userPrompt = `Provide PostgreSQL version recommendations:

Current Setup: ${currentVersion || 'PostgreSQL 14.x (assumed)'}
${infrastructureContext}

Workload Type: ${workloadType || 'Mixed OLTP/OLAP'}

Consider: security patches, performance improvements, new features, compatibility, LTS status.`;
        
        const llmResponse = await callLLM(systemPrompt, userPrompt);
        const parsed = parseJSONFromLLM(llmResponse);
        result = parsed || { summary: llmResponse };
        break;
      }

      case 'extension_suggestions': {
        const systemPrompt = `You are a PostgreSQL extensions specialist. Recommend extensions based on workload patterns.
Format your response as JSON with fields: recommended (array of {name, version, category, useCase, installCommand, configTips}), alreadyOptimal (array), notRecommended (array of {name, reason}), summary.`;
        
        const userPrompt = `Suggest PostgreSQL extensions for this infrastructure:
${infrastructureContext}

Workload Type: ${workloadType || 'General purpose'}

Consider extensions for: monitoring (pg_stat_statements), partitioning, JSON handling, full-text search, connection pooling, replication monitoring, performance.`;
        
        const llmResponse = await callLLM(systemPrompt, userPrompt);
        const parsed = parseJSONFromLLM(llmResponse);
        result = parsed || { summary: llmResponse };
        break;
      }

      case 'config_optimization': {
        const systemPrompt = `You are a PostgreSQL performance tuning expert. Provide configuration optimization recommendations.
Format your response as JSON with fields: category, currentAssumption, recommendations (array of {parameter, currentValue, recommendedValue, impact, explanation}), estimatedImprovement, warnings (array), summary.`;
        
        const userPrompt = `Optimize PostgreSQL configuration for:
${infrastructureContext}

Workload Type: ${workloadType || 'Mixed workload'}
Assumed Server Specs: 16 cores, 64GB RAM, NVMe storage

Optimize: memory settings, WAL configuration, checkpoint settings, connection limits, parallel query settings, autovacuum tuning.`;
        
        const llmResponse = await callLLM(systemPrompt, userPrompt);
        const parsed = parseJSONFromLLM(llmResponse);
        result = parsed || { summary: llmResponse };
        break;
      }

      case 'upgrade_path': {
        const systemPrompt = `You are a PostgreSQL migration specialist. Plan detailed upgrade paths.
Format your response as JSON with fields: fromVersion, toVersion, estimatedDowntime, phases (array of {phase, duration, steps, risks, rollbackPlan}), prerequisites (array), postUpgradeChecks (array), summary.`;
        
        const userPrompt = `Plan an upgrade path for this PostgreSQL infrastructure:
${infrastructureContext}

Current Version: ${currentVersion || 'PostgreSQL 14.x'}
Target: Latest stable version

Consider: logical replication upgrade, pg_upgrade options, blue-green deployment, rollback strategies.`;
        
        const llmResponse = await callLLM(systemPrompt, userPrompt);
        const parsed = parseJSONFromLLM(llmResponse);
        result = parsed || { summary: llmResponse };
        break;
      }

      case 'architecture_review': {
        const systemPrompt = `You are a PostgreSQL architect. Review and suggest architectural improvements.
Format your response as JSON with fields: currentArchitecture, score (0-100), strengths (array), weaknesses (array), recommendations (array of {area, current, suggested, effort, impact}), futureConsiderations (array), summary.`;
        
        const userPrompt = `Review the architecture of this PostgreSQL infrastructure:
${infrastructureContext}

Evaluate: topology choices, replication strategy, node distribution, failover capabilities, scalability potential, disaster recovery readiness.`;
        
        const llmResponse = await callLLM(systemPrompt, userPrompt);
        const parsed = parseJSONFromLLM(llmResponse);
        result = parsed || { summary: llmResponse };
        break;
      }

      case 'technology_trends': {
        const systemPrompt = `You are a database technology analyst. Provide insights on PostgreSQL ecosystem trends.
Format your response as JSON with fields: trends (array of {name, description, relevance, adoptionLevel, timeframe}), emergingTools (array of {name, category, description, maturity}), deprecations (array), industryShifts (array), actionItems (array), summary.`;
        
        const userPrompt = `Analyze technology trends relevant to this PostgreSQL infrastructure:
${infrastructureContext}

Cover: PostgreSQL roadmap, cloud-native developments, Kubernetes operators, observability tools, AI/ML integration, distributed SQL evolution.`;
        
        const llmResponse = await callLLM(systemPrompt, userPrompt);
        const parsed = parseJSONFromLLM(llmResponse);
        result = parsed || { summary: llmResponse };
        break;
      }

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
