import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import crypto from 'crypto';

// Generate a secure API key
function generateApiKey(): string {
  return `cpf_${crypto.randomBytes(32).toString('hex')}`;
}

// Generate a unique instance ID
function generateInstanceId(): string {
  return `cp_${crypto.randomBytes(16).toString('hex')}`;
}

// Get dynamic domain from request
function getDynamicDomain(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  const domain = forwardedHost || host || 'localhost:3000';
  return `${protocol}://${domain}`;
}

// Check admin permissions
async function checkAdminPermission(session: { user?: { id?: string; role?: string } } | null) {
  if (!session?.user) return false;
  return session.user.role === 'OWNER' || session.user.role === 'ADMIN';
}

// GET - Get federation status, identity, and connected nodes
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!await checkAdminPermission(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Get local identity
    let identity = await prisma.controlPlaneIdentity.findFirst();
    
    if (!identity) {
      // Auto-create identity if it doesn't exist
      const domain = getDynamicDomain(request);
      identity = await prisma.controlPlaneIdentity.create({
        data: {
          instanceId: generateInstanceId(),
          name: 'Primary Control Plane',
          domain,
          role: 'STANDALONE',
          apiKey: generateApiKey(),
        },
      });
    }

    // Get pending requests
    if (action === 'pending-requests') {
      const requests = await prisma.federationRequest.findMany({
        where: {
          status: 'PENDING',
          toInstanceId: identity.instanceId,
        },
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({ requests });
    }

    // Get all federated nodes
    const federatedNodes = await prisma.federatedNode.findMany({
      include: {
        syncLogs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get all requests
    const requests = await prisma.federationRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Check for promotion requests that have expired
    const now = new Date();
    const expiredPromotions = await prisma.federationRequest.findMany({
      where: {
        requestType: 'PROMOTION',
        status: 'PENDING',
        expiresAt: { lt: now },
      },
    });

    // Auto-promote if we have expired promotion requests from us
    for (const req of expiredPromotions) {
      if (identity && req.fromInstanceId === identity.instanceId) {
        // We requested promotion and it timed out - we become principle
        await prisma.controlPlaneIdentity.update({
          where: { id: identity.id },
          data: { role: 'PRINCIPLE', principleId: null },
        });

        // Update the node to be a partner
        const node = await prisma.federatedNode.findFirst({
          where: { instanceId: req.toInstanceId || undefined },
        });
        if (node) {
          await prisma.federatedNode.update({
            where: { id: node.id },
            data: { role: 'PARTNER' },
          });
        }

        await prisma.federationRequest.update({
          where: { id: req.id },
          data: { status: 'ACKNOWLEDGED' },
        });

        // Refresh identity
        identity = await prisma.controlPlaneIdentity.findFirst();
      }
    }

    // Get sync statistics
    const syncStats = await prisma.syncLog.groupBy({
      by: ['status'],
      _count: true,
    });

    return NextResponse.json({
      identity: {
        ...identity,
        apiKey: identity?.apiKey?.substring(0, 10) + '...',  // Partial key for display
      },
      federatedNodes,
      requests,
      syncStats,
      currentDomain: getDynamicDomain(request),
    });
  } catch (error) {
    console.error('Error fetching federation status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create/update identity, send partnership requests
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!await checkAdminPermission(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, ...data } = body;

    switch (action) {
      case 'update-identity': {
        const { name } = data;
        let identity = await prisma.controlPlaneIdentity.findFirst();
        const domain = getDynamicDomain(request);

        if (identity) {
          identity = await prisma.controlPlaneIdentity.update({
            where: { id: identity.id },
            data: { name, domain },
          });
        } else {
          identity = await prisma.controlPlaneIdentity.create({
            data: {
              instanceId: generateInstanceId(),
              name,
              domain,
              role: 'STANDALONE',
              apiKey: generateApiKey(),
            },
          });
        }

        await createAuditLog({
          userId: session?.user?.id,
          action: 'UPDATE_FEDERATION_IDENTITY',
          entityType: 'ControlPlaneIdentity',
          entityId: identity.id,
          afterState: { name, domain },
        });

        return NextResponse.json({
          identity: {
            ...identity,
            apiKey: identity.apiKey.substring(0, 10) + '...',
          },
        });
      }

      case 'regenerate-api-key': {
        const identity = await prisma.controlPlaneIdentity.findFirst();
        if (!identity) {
          return NextResponse.json({ error: 'No identity configured' }, { status: 400 });
        }

        const newKey = generateApiKey();
        await prisma.controlPlaneIdentity.update({
          where: { id: identity.id },
          data: { apiKey: newKey },
        });

        await createAuditLog({
          userId: session?.user?.id,
          action: 'REGENERATE_FEDERATION_API_KEY',
          entityType: 'ControlPlaneIdentity',
          entityId: identity.id,
        });

        return NextResponse.json({ apiKey: newKey });
      }

      case 'send-partnership-request': {
        const { targetDomain, message } = data;
        if (!targetDomain) {
          return NextResponse.json({ error: 'Target domain is required' }, { status: 400 });
        }

        const identity = await prisma.controlPlaneIdentity.findFirst();
        if (!identity) {
          return NextResponse.json({ error: 'No identity configured' }, { status: 400 });
        }

        // Create outgoing request record
        const federationRequest = await prisma.federationRequest.create({
          data: {
            fromInstanceId: identity.instanceId,
            fromName: identity.name,
            fromDomain: identity.domain,
            requestType: 'PARTNERSHIP',
            status: 'PENDING',
            message,
            apiKey: identity.apiKey,
          },
        });

        // In a real implementation, this would make an HTTP request to the target
        // For now, we simulate by creating a node entry
        const existingNode = await prisma.federatedNode.findFirst({
          where: { domain: targetDomain },
        });

        if (!existingNode) {
          await prisma.federatedNode.create({
            data: {
              instanceId: `pending_${crypto.randomBytes(8).toString('hex')}`,
              name: 'Pending Connection',
              domain: targetDomain,
              role: 'PRINCIPLE',  // We're requesting to be a partner, so they're principle
              status: 'PENDING',
            },
          });
        }

        await createAuditLog({
          userId: session?.user?.id,
          action: 'SEND_PARTNERSHIP_REQUEST',
          entityType: 'FederationRequest',
          entityId: federationRequest.id,
          afterState: { targetDomain, message },
        });

        return NextResponse.json({ request: federationRequest });
      }

      case 'request-promotion': {
        const { nodeId } = data;
        if (!nodeId) {
          return NextResponse.json({ error: 'Node ID is required' }, { status: 400 });
        }

        const identity = await prisma.controlPlaneIdentity.findFirst();
        if (!identity) {
          return NextResponse.json({ error: 'No identity configured' }, { status: 400 });
        }

        if (identity.role !== 'PARTNER') {
          return NextResponse.json({ error: 'Only partners can request promotion' }, { status: 400 });
        }

        const principleNode = await prisma.federatedNode.findUnique({
          where: { id: nodeId },
        });

        if (!principleNode || principleNode.role !== 'PRINCIPLE') {
          return NextResponse.json({ error: 'Invalid principle node' }, { status: 400 });
        }

        // Create promotion request with 30 second timeout
        const expiresAt = new Date(Date.now() + 30000);
        const promotionRequest = await prisma.federationRequest.create({
          data: {
            nodeId,
            fromInstanceId: identity.instanceId,
            fromName: identity.name,
            fromDomain: identity.domain,
            toInstanceId: principleNode.instanceId,
            requestType: 'PROMOTION',
            status: 'PENDING',
            expiresAt,
          },
        });

        await prisma.federatedNode.update({
          where: { id: nodeId },
          data: {
            promotionRequestAt: new Date(),
            promotionRequestBy: identity.instanceId,
          },
        });

        await createAuditLog({
          userId: session?.user?.id,
          action: 'REQUEST_PROMOTION',
          entityType: 'FederationRequest',
          entityId: promotionRequest.id,
          afterState: { nodeId, expiresAt },
        });

        return NextResponse.json({
          request: promotionRequest,
          expiresAt,
          message: 'Promotion request sent. You will be promoted automatically if no response in 30 seconds.',
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in federation POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH - Respond to requests, manage nodes, promote partners
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!await checkAdminPermission(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, ...data } = body;

    switch (action) {
      case 'respond-to-request': {
        const { requestId, accept } = data;
        if (!requestId) {
          return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
        }

        const federationRequest = await prisma.federationRequest.findUnique({
          where: { id: requestId },
        });

        if (!federationRequest || federationRequest.status !== 'PENDING') {
          return NextResponse.json({ error: 'Request not found or already processed' }, { status: 404 });
        }

        const identity = await prisma.controlPlaneIdentity.findFirst();
        if (!identity) {
          return NextResponse.json({ error: 'No identity configured' }, { status: 400 });
        }

        if (accept) {
          // Update request status
          await prisma.federationRequest.update({
            where: { id: requestId },
            data: {
              status: 'ACKNOWLEDGED',
              respondedAt: new Date(),
              respondedBy: session?.user?.id,
            },
          });

          if (federationRequest.requestType === 'PARTNERSHIP') {
            // We become principle, they become partner
            await prisma.controlPlaneIdentity.update({
              where: { id: identity.id },
              data: { role: 'PRINCIPLE' },
            });

            // Create or update federated node
            let node = await prisma.federatedNode.findFirst({
              where: { instanceId: federationRequest.fromInstanceId },
            });

            if (node) {
              node = await prisma.federatedNode.update({
                where: { id: node.id },
                data: {
                  name: federationRequest.fromName,
                  domain: federationRequest.fromDomain,
                  role: 'PARTNER',
                  apiKey: federationRequest.apiKey,
                  status: 'CONNECTED',
                  lastHeartbeat: new Date(),
                },
              });
            } else {
              node = await prisma.federatedNode.create({
                data: {
                  instanceId: federationRequest.fromInstanceId,
                  name: federationRequest.fromName,
                  domain: federationRequest.fromDomain,
                  role: 'PARTNER',
                  apiKey: federationRequest.apiKey,
                  status: 'CONNECTED',
                  lastHeartbeat: new Date(),
                },
              });
            }

            await createAuditLog({
              userId: session?.user?.id,
              action: 'ACCEPT_PARTNERSHIP',
              entityType: 'FederatedNode',
              entityId: node.id,
              afterState: { fromDomain: federationRequest.fromDomain },
            });

            return NextResponse.json({
              message: 'Partnership accepted. You are now the Principle.',
              node,
            });
          } else if (federationRequest.requestType === 'PROMOTION') {
            // We were principle, now demote to partner
            const requesterNode = await prisma.federatedNode.findFirst({
              where: { instanceId: federationRequest.fromInstanceId },
            });

            if (requesterNode) {
              // Demote ourselves
              await prisma.controlPlaneIdentity.update({
                where: { id: identity.id },
                data: {
                  role: 'PARTNER',
                  principleId: federationRequest.fromInstanceId,
                },
              });

              // Update the requester to be principle
              await prisma.federatedNode.update({
                where: { id: requesterNode.id },
                data: {
                  role: 'PRINCIPLE',
                  promotionRequestAt: null,
                  promotionRequestBy: null,
                },
              });

              await createAuditLog({
                userId: session?.user?.id,
                action: 'ACCEPT_PROMOTION',
                entityType: 'FederatedNode',
                entityId: requesterNode.id,
                afterState: { newPrinciple: federationRequest.fromInstanceId },
              });

              return NextResponse.json({
                message: 'Promotion accepted. You are now a Partner.',
              });
            }
          }
        } else {
          // Reject request
          await prisma.federationRequest.update({
            where: { id: requestId },
            data: {
              status: 'REJECTED',
              respondedAt: new Date(),
              respondedBy: session?.user?.id,
            },
          });

          await createAuditLog({
            userId: session?.user?.id,
            action: 'REJECT_FEDERATION_REQUEST',
            entityType: 'FederationRequest',
            entityId: requestId,
          });

          return NextResponse.json({ message: 'Request rejected' });
        }

        return NextResponse.json({ success: true });
      }

      case 'promote-partner': {
        const { nodeId } = data;
        if (!nodeId) {
          return NextResponse.json({ error: 'Node ID is required' }, { status: 400 });
        }

        const identity = await prisma.controlPlaneIdentity.findFirst();
        if (!identity || identity.role !== 'PRINCIPLE') {
          return NextResponse.json({ error: 'Only Principle can promote partners' }, { status: 403 });
        }

        const partnerNode = await prisma.federatedNode.findUnique({
          where: { id: nodeId },
        });

        if (!partnerNode || partnerNode.role !== 'PARTNER') {
          return NextResponse.json({ error: 'Invalid partner node' }, { status: 400 });
        }

        // Demote ourselves to partner
        await prisma.controlPlaneIdentity.update({
          where: { id: identity.id },
          data: {
            role: 'PARTNER',
            principleId: partnerNode.instanceId,
          },
        });

        // Promote the partner to principle
        await prisma.federatedNode.update({
          where: { id: nodeId },
          data: { role: 'PRINCIPLE' },
        });

        // Update all other partners to point to new principle
        await prisma.federatedNode.updateMany({
          where: {
            id: { not: nodeId },
            role: 'PARTNER',
          },
          data: { role: 'PARTNER' },  // They remain partners but will get updated principle info
        });

        await createAuditLog({
          userId: session?.user?.id,
          action: 'PROMOTE_PARTNER',
          entityType: 'FederatedNode',
          entityId: nodeId,
          afterState: { newPrinciple: partnerNode.instanceId },
        });

        return NextResponse.json({
          message: `${partnerNode.name} has been promoted to Principle. You are now a Partner.`,
        });
      }

      case 'disconnect-node': {
        const { nodeId } = data;
        if (!nodeId) {
          return NextResponse.json({ error: 'Node ID is required' }, { status: 400 });
        }

        const node = await prisma.federatedNode.findUnique({
          where: { id: nodeId },
        });

        if (!node) {
          return NextResponse.json({ error: 'Node not found' }, { status: 404 });
        }

        // Delete sync logs first
        await prisma.syncLog.deleteMany({
          where: { nodeId },
        });

        // Delete the node
        await prisma.federatedNode.delete({
          where: { id: nodeId },
        });

        // If we were a partner connected to this principle, become standalone
        const identity = await prisma.controlPlaneIdentity.findFirst();
        if (identity?.principleId === node.instanceId) {
          await prisma.controlPlaneIdentity.update({
            where: { id: identity.id },
            data: {
              role: 'STANDALONE',
              principleId: null,
            },
          });
        }

        await createAuditLog({
          userId: session?.user?.id,
          action: 'DISCONNECT_FEDERATED_NODE',
          entityType: 'FederatedNode',
          entityId: nodeId,
          beforeState: node,
        });

        return NextResponse.json({ message: 'Node disconnected' });
      }

      case 'toggle-sync': {
        const { nodeId, enabled } = data;
        if (!nodeId) {
          return NextResponse.json({ error: 'Node ID is required' }, { status: 400 });
        }

        const node = await prisma.federatedNode.update({
          where: { id: nodeId },
          data: { syncEnabled: enabled },
        });

        await createAuditLog({
          userId: session?.user?.id,
          action: enabled ? 'ENABLE_SYNC' : 'DISABLE_SYNC',
          entityType: 'FederatedNode',
          entityId: nodeId,
        });

        return NextResponse.json({ node });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in federation PATCH:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Remove federation request
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!await checkAdminPermission(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('requestId');

    if (!requestId) {
      return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
    }

    await prisma.federationRequest.delete({
      where: { id: requestId },
    });

    await createAuditLog({
      userId: session?.user?.id,
      action: 'DELETE_FEDERATION_REQUEST',
      entityType: 'FederationRequest',
      entityId: requestId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting federation request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
