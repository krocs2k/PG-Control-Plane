import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

// Verify federation API key
async function verifyFederationAuth(request: NextRequest): Promise<{ valid: boolean; identity?: { instanceId: string; role: string } }> {
  const authHeader = request.headers.get('x-federation-api-key');
  const instanceId = request.headers.get('x-federation-instance-id');

  if (!authHeader || !instanceId) {
    return { valid: false };
  }

  // Check if the API key matches a known federated node
  const node = await prisma.federatedNode.findFirst({
    where: {
      instanceId,
      apiKey: authHeader,
    },
  });

  if (node) {
    return { valid: true, identity: { instanceId, role: node.role } };
  }

  // Also check if it's our own API key (for testing)
  const identity = await prisma.controlPlaneIdentity.findFirst({
    where: { apiKey: authHeader },
  });

  if (identity) {
    return { valid: true, identity: { instanceId: identity.instanceId, role: identity.role } };
  }

  return { valid: false };
}

// Get all syncable data for a full sync
async function getFullSyncData() {
  const [organizations, projects, clusters, users, nodes] = await Promise.all([
    prisma.organization.findMany(),
    prisma.project.findMany(),
    prisma.cluster.findMany(),
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        orgId: true,
        createdAt: true,
        updatedAt: true,
        // Exclude sensitive fields
      },
    }),
    prisma.node.findMany(),
  ]);

  return {
    organizations,
    projects,
    clusters,
    users,
    nodes,
    timestamp: new Date().toISOString(),
  };
}

// Apply sync data from principle
async function applySyncData(data: {
  organizations?: Array<Record<string, unknown>>;
  projects?: Array<Record<string, unknown>>;
  clusters?: Array<Record<string, unknown>>;
  users?: Array<Record<string, unknown>>;
  nodes?: Array<Record<string, unknown>>;
}) {
  const results = {
    organizations: 0,
    projects: 0,
    clusters: 0,
    users: 0,
    nodes: 0,
  };

  // Sync organizations
  if (data.organizations) {
    for (const org of data.organizations) {
      await prisma.organization.upsert({
        where: { id: org.id as string },
        create: org as Parameters<typeof prisma.organization.create>[0]['data'],
        update: org as Parameters<typeof prisma.organization.update>[0]['data'],
      });
      results.organizations++;
    }
  }

  // Sync projects
  if (data.projects) {
    for (const project of data.projects) {
      await prisma.project.upsert({
        where: { id: project.id as string },
        create: project as Parameters<typeof prisma.project.create>[0]['data'],
        update: project as Parameters<typeof prisma.project.update>[0]['data'],
      });
      results.projects++;
    }
  }

  // Sync clusters
  if (data.clusters) {
    for (const cluster of data.clusters) {
      await prisma.cluster.upsert({
        where: { id: cluster.id as string },
        create: cluster as Parameters<typeof prisma.cluster.create>[0]['data'],
        update: cluster as Parameters<typeof prisma.cluster.update>[0]['data'],
      });
      results.clusters++;
    }
  }

  // Sync nodes
  if (data.nodes) {
    for (const node of data.nodes) {
      await prisma.node.upsert({
        where: { id: node.id as string },
        create: node as Parameters<typeof prisma.node.create>[0]['data'],
        update: node as Parameters<typeof prisma.node.update>[0]['data'],
      });
      results.nodes++;
    }
  }

  return results;
}

// GET - Pull sync data (for Partners to pull from Principle)
export async function GET(request: NextRequest) {
  try {
    // First check for federation auth
    const fedAuth = await verifyFederationAuth(request);
    
    if (!fedAuth.valid) {
      // Fall back to session auth for admin users
      const session = await getServerSession(authOptions);
      if (!session?.user || !['OWNER', 'ADMIN'].includes(session.user.role || '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const nodeId = searchParams.get('nodeId');

    // Get sync logs for a node
    if (action === 'sync-logs' && nodeId) {
      const logs = await prisma.syncLog.findMany({
        where: { nodeId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return NextResponse.json({ logs });
    }

    // Get full sync data (for partners pulling from principle)
    if (action === 'full-sync') {
      const identity = await prisma.controlPlaneIdentity.findFirst();
      if (!identity || identity.role !== 'PRINCIPLE') {
        return NextResponse.json(
          { error: 'Only Principle can provide sync data' },
          { status: 403 }
        );
      }

      const syncData = await getFullSyncData();
      return NextResponse.json(syncData);
    }

    // Default: return sync status
    const identity = await prisma.controlPlaneIdentity.findFirst();
    const recentSyncs = await prisma.syncLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { node: true },
    });

    return NextResponse.json({
      identity: identity ? { role: identity.role, instanceId: identity.instanceId } : null,
      recentSyncs,
    });
  } catch (error) {
    console.error('Error in sync GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Push sync data or trigger sync
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...data } = body;

    // Handle incoming sync data from principle
    if (action === 'receive-sync') {
      const fedAuth = await verifyFederationAuth(request);
      if (!fedAuth.valid) {
        return NextResponse.json({ error: 'Invalid federation credentials' }, { status: 401 });
      }

      const identity = await prisma.controlPlaneIdentity.findFirst();
      if (!identity || identity.role !== 'PARTNER') {
        return NextResponse.json(
          { error: 'Only Partners can receive sync data' },
          { status: 403 }
        );
      }

      // Find the source node
      const sourceNode = await prisma.federatedNode.findFirst({
        where: { instanceId: fedAuth.identity?.instanceId },
      });

      // Create sync log
      const syncLog = await prisma.syncLog.create({
        data: {
          nodeId: sourceNode?.id || 'unknown',
          direction: 'PULL',
          entityType: 'FULL',
          status: 'IN_PROGRESS',
          startedAt: new Date(),
        },
      });

      try {
        const results = await applySyncData(data.syncData || {});
        const totalCount = Object.values(results).reduce((a, b) => a + b, 0);

        await prisma.syncLog.update({
          where: { id: syncLog.id },
          data: {
            status: 'COMPLETED',
            entityCount: totalCount,
            completedAt: new Date(),
          },
        });

        if (sourceNode) {
          await prisma.federatedNode.update({
            where: { id: sourceNode.id },
            data: { lastSyncAt: new Date() },
          });
        }

        return NextResponse.json({
          success: true,
          results,
          syncLogId: syncLog.id,
        });
      } catch (syncError) {
        await prisma.syncLog.update({
          where: { id: syncLog.id },
          data: {
            status: 'FAILED',
            errorMessage: String(syncError),
            completedAt: new Date(),
          },
        });
        throw syncError;
      }
    }

    // Handle heartbeat
    if (action === 'heartbeat') {
      const fedAuth = await verifyFederationAuth(request);
      if (!fedAuth.valid) {
        return NextResponse.json({ error: 'Invalid federation credentials' }, { status: 401 });
      }

      const node = await prisma.federatedNode.findFirst({
        where: { instanceId: fedAuth.identity?.instanceId },
      });

      if (node) {
        await prisma.federatedNode.update({
          where: { id: node.id },
          data: {
            lastHeartbeat: new Date(),
            status: 'CONNECTED',
          },
        });
      }

      return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
    }

    // Trigger sync to partners (for Principle)
    if (action === 'trigger-sync') {
      const session = await getServerSession(authOptions);
      if (!session?.user || !['OWNER', 'ADMIN'].includes(session.user.role || '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const identity = await prisma.controlPlaneIdentity.findFirst();
      if (!identity || identity.role !== 'PRINCIPLE') {
        return NextResponse.json(
          { error: 'Only Principle can trigger sync' },
          { status: 403 }
        );
      }

      const { nodeId } = data;
      let partners;

      if (nodeId) {
        // Sync to specific partner
        partners = await prisma.federatedNode.findMany({
          where: { id: nodeId, role: 'PARTNER', syncEnabled: true },
        });
      } else {
        // Sync to all partners
        partners = await prisma.federatedNode.findMany({
          where: { role: 'PARTNER', syncEnabled: true },
        });
      }

      const syncData = await getFullSyncData();
      const syncResults = [];

      for (const partner of partners) {
        // Create sync log
        const syncLog = await prisma.syncLog.create({
          data: {
            nodeId: partner.id,
            direction: 'PUSH',
            entityType: 'FULL',
            status: 'IN_PROGRESS',
            startedAt: new Date(),
          },
        });

        try {
          // In a real implementation, this would make an HTTP request to the partner
          // For simulation, we'll just mark it as completed
          const totalCount = 
            (syncData.organizations?.length || 0) +
            (syncData.projects?.length || 0) +
            (syncData.clusters?.length || 0) +
            (syncData.users?.length || 0) +
            (syncData.nodes?.length || 0);

          await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: {
              status: 'COMPLETED',
              entityCount: totalCount,
              completedAt: new Date(),
            },
          });

          await prisma.federatedNode.update({
            where: { id: partner.id },
            data: { lastSyncAt: new Date() },
          });

          syncResults.push({
            partnerId: partner.id,
            partnerName: partner.name,
            success: true,
            entityCount: totalCount,
          });
        } catch (error) {
          await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: {
              status: 'FAILED',
              errorMessage: String(error),
              completedAt: new Date(),
            },
          });

          syncResults.push({
            partnerId: partner.id,
            partnerName: partner.name,
            success: false,
            error: String(error),
          });
        }
      }

      await createAuditLog({
        userId: session.user.id,
        action: 'TRIGGER_FEDERATION_SYNC',
        entityType: 'Federation',
        entityId: identity.instanceId,
        afterState: { syncResults },
      });

      return NextResponse.json({
        success: true,
        partnersSynced: syncResults.filter(r => r.success).length,
        partnersFailed: syncResults.filter(r => !r.success).length,
        results: syncResults,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in sync POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
