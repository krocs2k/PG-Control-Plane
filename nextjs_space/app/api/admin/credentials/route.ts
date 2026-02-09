import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import crypto from 'crypto';

// Generate a secure 32-character password
function generateSecurePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+';
  let password = '';
  const randomBytes = crypto.randomBytes(32);
  for (let i = 0; i < 32; i++) {
    password += chars[randomBytes[i] % chars.length];
  }
  return password;
}

// Check admin permission
async function checkAdminPermission(session: { user?: { role?: string } } | null) {
  if (!session?.user) return false;
  return ['OWNER', 'ADMIN'].includes(session.user.role || '');
}

// GET - Get current credential status
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!await checkAdminPermission(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const credential = await prisma.superuserCredential.findFirst({
      include: {
        propagations: {
          include: {
            // We need node info
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get nodes for propagation status
    const nodes = await prisma.node.findMany({
      select: {
        id: true,
        name: true,
        host: true,
        clusterId: true,
        cluster: {
          select: { name: true }
        }
      }
    });

    // Get active alerts
    const alerts = await prisma.credentialAlert.findMany({
      where: { resolved: false },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate password age
    let passwordAge = 0;
    if (credential?.lastRotatedAt) {
      const now = new Date();
      const lastRotated = new Date(credential.lastRotatedAt);
      passwordAge = Math.floor((now.getTime() - lastRotated.getTime()) / (1000 * 60 * 60 * 24));
    }

    return NextResponse.json({
      credential: credential ? {
        id: credential.id,
        username: credential.username,
        currentPassword: credential.currentPassword,
        passwordHistoryCount: credential.passwordHistory.length,
        lastRotatedAt: credential.lastRotatedAt,
        rotationIntervalDays: credential.rotationIntervalDays,
        nextRotationAt: credential.nextRotationAt,
        status: credential.status,
        passwordAge
      } : null,
      propagations: credential?.propagations || [],
      nodes: nodes.map(n => ({
        ...n,
        clusterName: n.cluster.name
      })),
      alerts
    });
  } catch (error) {
    console.error('Error fetching credentials:', error);
    return NextResponse.json({ error: 'Failed to fetch credentials' }, { status: 500 });
  }
}

// POST - Create or rotate credentials
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!await checkAdminPermission(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'initialize') {
      // Check if credential already exists
      const existing = await prisma.superuserCredential.findFirst();
      if (existing) {
        return NextResponse.json({ error: 'Credentials already initialized' }, { status: 400 });
      }

      // Generate initial password
      const password = generateSecurePassword();
      const nextRotation = new Date();
      nextRotation.setDate(nextRotation.getDate() + 45);

      const credential = await prisma.superuserCredential.create({
        data: {
          username: 'pgdb_broadplane',
          currentPassword: password,
          passwordHistory: [],
          lastRotatedAt: new Date(),
          rotationIntervalDays: 45,
          nextRotationAt: nextRotation,
          status: 'ACTIVE'
        }
      });

      await createAuditLog({
        userId: session?.user?.id,
        entityType: 'SuperuserCredential',
        entityId: credential.id,
        action: 'CREATE',
        beforeState: null,
        afterState: { username: credential.username, status: 'ACTIVE' }
      });

      return NextResponse.json({
        success: true,
        credential: {
          id: credential.id,
          username: credential.username,
          currentPassword: credential.currentPassword,
          lastRotatedAt: credential.lastRotatedAt,
          nextRotationAt: credential.nextRotationAt
        }
      });
    }

    if (action === 'rotate') {
      const credential = await prisma.superuserCredential.findFirst();
      if (!credential) {
        return NextResponse.json({ error: 'No credentials found. Initialize first.' }, { status: 400 });
      }

      // Generate new password
      const newPassword = generateSecurePassword();
      
      // Update history - keep last 6 passwords
      const updatedHistory = [credential.currentPassword, ...credential.passwordHistory].slice(0, 6);
      
      const nextRotation = new Date();
      nextRotation.setDate(nextRotation.getDate() + 45);

      const updated = await prisma.superuserCredential.update({
        where: { id: credential.id },
        data: {
          currentPassword: newPassword,
          passwordHistory: updatedHistory,
          lastRotatedAt: new Date(),
          nextRotationAt: nextRotation,
          status: 'SYNCING'
        }
      });

      // Reset all propagation statuses to pending
      await prisma.credentialPropagation.updateMany({
        where: { credentialId: credential.id },
        data: { status: 'PENDING', lastAttemptAt: null }
      });

      await createAuditLog({
        userId: session?.user?.id,
        entityType: 'SuperuserCredential',
        entityId: credential.id,
        action: 'ROTATE',
        beforeState: { passwordHistoryCount: credential.passwordHistory.length },
        afterState: { passwordHistoryCount: updatedHistory.length }
      });

      return NextResponse.json({
        success: true,
        message: 'Password rotated. Propagation to nodes will begin.',
        credential: {
          id: updated.id,
          username: updated.username,
          currentPassword: updated.currentPassword,
          lastRotatedAt: updated.lastRotatedAt,
          nextRotationAt: updated.nextRotationAt,
          passwordHistoryCount: updated.passwordHistory.length
        }
      });
    }

    if (action === 'propagate') {
      const { nodeId } = body;
      
      const credential = await prisma.superuserCredential.findFirst();
      if (!credential) {
        return NextResponse.json({ error: 'No credentials found' }, { status: 400 });
      }

      const node = await prisma.node.findUnique({
        where: { id: nodeId },
        include: { cluster: true }
      });

      if (!node) {
        return NextResponse.json({ error: 'Node not found' }, { status: 404 });
      }

      // Try to propagate password to this node
      const result = await propagatePasswordToNode(node, credential);

      // Update propagation record
      await prisma.credentialPropagation.upsert({
        where: {
          credentialId_nodeId: {
            credentialId: credential.id,
            nodeId: node.id
          }
        },
        create: {
          credentialId: credential.id,
          nodeId: node.id,
          clusterId: node.clusterId,
          status: result.status,
          lastAttemptAt: new Date(),
          successAt: result.success ? new Date() : null,
          errorMessage: result.error || null,
          passwordUsed: result.passwordUsed || null
        },
        update: {
          status: result.status,
          lastAttemptAt: new Date(),
          successAt: result.success ? new Date() : undefined,
          errorMessage: result.error || null,
          passwordUsed: result.passwordUsed || null
        }
      });

      // Create alert if needs re-enrollment
      if (result.status === 'NEEDS_REENROLLMENT') {
        await prisma.credentialAlert.create({
          data: {
            nodeId: node.id,
            clusterId: node.clusterId,
            alertType: 'REENROLLMENT_REQUIRED',
            message: `Node ${node.name} (${node.host}) requires re-enrollment. None of the stored passwords were accepted.`
          }
        });
      }

      return NextResponse.json(result);
    }

    if (action === 'propagate-all') {
      const credential = await prisma.superuserCredential.findFirst();
      if (!credential) {
        return NextResponse.json({ error: 'No credentials found' }, { status: 400 });
      }

      const nodes = await prisma.node.findMany({
        include: { cluster: true }
      });

      const results = [];
      for (const node of nodes) {
        const result = await propagatePasswordToNode(node, credential);
        
        await prisma.credentialPropagation.upsert({
          where: {
            credentialId_nodeId: {
              credentialId: credential.id,
              nodeId: node.id
            }
          },
          create: {
            credentialId: credential.id,
            nodeId: node.id,
            clusterId: node.clusterId,
            status: result.status,
            lastAttemptAt: new Date(),
            successAt: result.success ? new Date() : null,
            errorMessage: result.error || null,
            passwordUsed: result.passwordUsed || null
          },
          update: {
            status: result.status,
            lastAttemptAt: new Date(),
            successAt: result.success ? new Date() : undefined,
            errorMessage: result.error || null,
            passwordUsed: result.passwordUsed || null
          }
        });

        if (result.status === 'NEEDS_REENROLLMENT') {
          const existingAlert = await prisma.credentialAlert.findFirst({
            where: { nodeId: node.id, resolved: false }
          });
          
          if (!existingAlert) {
            await prisma.credentialAlert.create({
              data: {
                nodeId: node.id,
                clusterId: node.clusterId,
                alertType: 'REENROLLMENT_REQUIRED',
                message: `Node ${node.name} (${node.host}) requires re-enrollment.`
              }
            });
          }
        }

        results.push({ nodeId: node.id, nodeName: node.name, ...result });
      }

      // Update credential status based on results
      const allSuccess = results.every(r => r.success);
      const anyFailed = results.some(r => r.status === 'NEEDS_REENROLLMENT');

      await prisma.superuserCredential.update({
        where: { id: credential.id },
        data: {
          status: allSuccess ? 'ACTIVE' : anyFailed ? 'NEEDS_REENROLLMENT' : 'ACTIVE'
        }
      });

      await createAuditLog({
        userId: session?.user?.id,
        entityType: 'SuperuserCredential',
        entityId: credential.id,
        action: 'PROPAGATE_ALL',
        beforeState: null,
        afterState: { totalNodes: nodes.length, successCount: results.filter(r => r.success).length }
      });

      return NextResponse.json({
        success: true,
        results,
        summary: {
          total: nodes.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          needsReenrollment: results.filter(r => r.status === 'NEEDS_REENROLLMENT').length
        }
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error managing credentials:', error);
    return NextResponse.json({ error: 'Failed to manage credentials' }, { status: 500 });
  }
}

// PATCH - Resolve alerts
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!await checkAdminPermission(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, alertId } = body;

    if (action === 'resolve-alert') {
      await prisma.credentialAlert.update({
        where: { id: alertId },
        data: {
          resolved: true,
          resolvedAt: new Date(),
          resolvedBy: session?.user?.name || session?.user?.email || 'Unknown'
        }
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error updating credentials:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

// Helper function to propagate password to a node
async function propagatePasswordToNode(
  node: { id: string; name: string; host: string; port: number; dbUser?: string | null; dbPassword?: string | null },
  credential: { currentPassword: string; passwordHistory: string[] }
): Promise<{ success: boolean; status: string; error?: string; passwordUsed?: string; passwordUpdatedOnDb?: boolean }> {
  // Import the postgres connection test function
  const { testNodeConnection, changeUserPassword } = await import('@/lib/postgres');
  
  // Passwords to try: current first, then history (oldest to newest order in history)
  const passwordsToTry = [credential.currentPassword, ...credential.passwordHistory];
  
  for (let i = 0; i < passwordsToTry.length; i++) {
    const password = passwordsToTry[i];
    const isCurrentPassword = i === 0;
    
    try {
      // Try to connect with this password
      const connectionResult = await testNodeConnection({
        host: node.host,
        port: node.port,
        user: 'pgdb_broadplane',
        password: password,
        database: 'postgres',
        ssl: true
      });

      if (connectionResult.success) {
        // Connection succeeded
        if (isCurrentPassword) {
          // Already using current password, we're good
          return {
            success: true,
            status: 'SUCCESS',
            passwordUsed: 'current'
          };
        } else {
          // Connected with old password, need to update to current
          try {
            await changeUserPassword({
              host: node.host,
              port: node.port,
              user: 'pgdb_broadplane',
              password: password,
              database: 'postgres',
              ssl: true
            }, 'pgdb_broadplane', credential.currentPassword);

            return {
              success: true,
              status: 'SUCCESS',
              passwordUsed: `history_${i}`,
              passwordUpdatedOnDb: true
            };
          } catch (changeErr) {
            return {
              success: false,
              status: 'FAILED',
              error: `Connected with old password but failed to update: ${changeErr}`,
              passwordUsed: `history_${i}`
            };
          }
        }
      }
    } catch (err) {
      // Connection failed with this password, try next
      continue;
    }
  }

  // None of the passwords worked
  return {
    success: false,
    status: 'NEEDS_REENROLLMENT',
    error: 'All passwords failed. Node requires manual re-enrollment.'
  };
}
