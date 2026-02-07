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
    const { scanType, clusterId } = body;

    // Gather context data
    const clusters = await prisma.cluster.findMany({
      include: { nodes: true, project: true },
    });
    
    const auditLogs = await prisma.auditLog.findMany({
      take: 100,
      orderBy: { timestamp: 'desc' },
    });

    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
    });

    const targetCluster = clusterId 
      ? clusters.find(c => c.id === clusterId)
      : null;

    const clusterContext = targetCluster
      ? `Target Cluster: ${targetCluster.name} (${targetCluster.topology}, ${targetCluster.replicationMode})`
      : `All Clusters: ${clusters.map(c => c.name).join(', ')}`;

    let result: any = {};

    switch (scanType) {
      case 'compliance': {
        const systemPrompt = `You are a PostgreSQL compliance auditor. Evaluate cluster configurations against industry standards and best practices.
Format your response as JSON with fields: overallScore (0-100), complianceLevel (compliant/partial/non-compliant), findings (array of {category, status, finding, remediation, severity}), summary.`;
        
        const userPrompt = `Perform a compliance scan on this PostgreSQL infrastructure:
${clusterContext}

Cluster Details:
${clusters.map(c => `- ${c.name}: ${c.topology}, ${c.status}, ${c.nodes?.length || 0} nodes`).join('\n')}

Evaluate against: CIS PostgreSQL Benchmark, SOC2 requirements, GDPR data protection, PCI-DSS (if applicable).`;
        
        const llmResponse = await callLLM(systemPrompt, userPrompt);
        const parsed = parseJSONFromLLM(llmResponse);
        result = parsed || { summary: llmResponse };
        break;
      }

      case 'access_review': {
        const systemPrompt = `You are a database access control specialist. Review access patterns and user privileges.
Format your response as JSON with fields: riskScore (0-100), users (array of {user, role, riskLevel, findings}), recommendations (array), accessMatrix, summary.`;
        
        const userPrompt = `Review access controls for this PostgreSQL infrastructure:

Users:
${users.map(u => `- ${u.name} (${u.email}): Role=${u.role}`).join('\n')}

Recent Audit Activity (last 100 entries):
${auditLogs.slice(0, 20).map(l => `- ${l.action} by ${l.userId || 'system'} on ${l.entityType}`).join('\n')}

Clusters: ${clusters.map(c => c.name).join(', ')}

Analyze for: privilege escalation risks, unused accounts, excessive permissions, separation of duties.`;
        
        const llmResponse = await callLLM(systemPrompt, userPrompt);
        const parsed = parseJSONFromLLM(llmResponse);
        result = parsed || { summary: llmResponse };
        break;
      }

      case 'audit_analysis': {
        const systemPrompt = `You are a security analyst specializing in database audit logs. Analyze patterns and detect anomalies.
Format your response as JSON with fields: threatLevel (low/medium/high/critical), anomalies (array of {type, description, timestamp, severity}), patterns (array), recommendations (array), summary.`;
        
        const userPrompt = `Analyze these PostgreSQL audit logs for security concerns:

Recent Activity:
${auditLogs.map(l => `[${l.timestamp}] ${l.action} - ${l.entityType}/${l.entityId} by user ${l.userId || 'system'}`).join('\n')}

Look for: unusual access patterns, failed operations, bulk operations, off-hours activity, privilege changes.`;
        
        const llmResponse = await callLLM(systemPrompt, userPrompt);
        const parsed = parseJSONFromLLM(llmResponse);
        result = parsed || { summary: llmResponse };
        break;
      }

      case 'security_posture': {
        const systemPrompt = `You are a PostgreSQL security architect. Evaluate overall security posture.
Format your response as JSON with fields: securityScore (0-100), grade (A/B/C/D/F), categories (array of {name, score, status, issues}), criticalFindings (array), improvements (array of {priority, action, impact}), summary.`;
        
        const userPrompt = `Evaluate security posture for this PostgreSQL infrastructure:

Clusters:
${clusters.map(c => `- ${c.name}: Topology=${c.topology}, Replication=${c.replicationMode}, Status=${c.status}, Nodes=${c.nodes?.length || 0}`).join('\n')}

Users: ${users.length} total (Roles: ${[...new Set(users.map(u => u.role))].join(', ')})

Recent Activity Volume: ${auditLogs.length} audit entries

Evaluate: encryption status, access controls, network security, backup security, monitoring coverage, patch status (assumed).`;
        
        const llmResponse = await callLLM(systemPrompt, userPrompt);
        const parsed = parseJSONFromLLM(llmResponse);
        result = parsed || { summary: llmResponse };
        break;
      }

      case 'cost_analysis': {
        const systemPrompt = `You are a FinOps specialist for database infrastructure. Analyze resource utilization and costs.
Format your response as JSON with fields: estimatedMonthlyCost (USD), costBreakdown (object), optimizations (array of {area, currentCost, potentialSavings, recommendation}), utilizationScore (0-100), summary.`;
        
        const totalNodes = clusters.reduce((sum, c) => sum + (c.nodes?.length || 0), 0);
        const userPrompt = `Analyze cost and resource utilization for this PostgreSQL infrastructure:

Clusters: ${clusters.length}
Total Nodes: ${totalNodes}

Cluster Details:
${clusters.map(c => `- ${c.name}: ${c.topology} topology, ${c.nodes?.length || 0} nodes, ${c.replicationMode} replication`).join('\n')}

Assume standard cloud pricing. Analyze: right-sizing opportunities, reserved instance candidates, topology optimization, replication overhead.`;
        
        const llmResponse = await callLLM(systemPrompt, userPrompt);
        const parsed = parseJSONFromLLM(llmResponse);
        result = parsed || { summary: llmResponse };
        break;
      }

      default:
        return NextResponse.json({ error: 'Invalid scan type' }, { status: 400 });
    }

    // Store scan result
    await prisma.auditLog.create({
      data: {
        action: 'GOVERNANCE_SCAN',
        entityType: 'System',
        entityId: clusterId || 'all',
        afterState: JSON.stringify({ scanType, resultSummary: result.summary || result.securityScore || result.overallScore }),
        userId: (session.user as any).id,
      },
    });

    return NextResponse.json({ scanType, ...result });
  } catch (error) {
    console.error('Governance scan error:', error);
    return NextResponse.json(
      { error: 'Failed to perform governance scan' },
      { status: 500 }
    );
  }
}
