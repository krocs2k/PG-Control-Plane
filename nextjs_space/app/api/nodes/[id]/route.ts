export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { hasPermission } from '@/lib/types';
import {
  parseConnectionString,
  buildConnectionString,
  testConnection,
} from '@/lib/postgres';

// Mask password in connection string for display
function maskConnectionString(connStr: string): string {
  if (!connStr) return '';
  return connStr.replace(/:([^:@]+)@/, ':***@');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const node = await prisma.node.findUnique({
      where: { id },
      include: { cluster: { include: { project: true } } },
    });

    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    // Mask sensitive data in response
    return NextResponse.json({
      ...node,
      dbPassword: node.dbPassword ? '***' : null,
      connectionString: node.connectionString
        ? maskConnectionString(node.connectionString)
        : null,
    });
  } catch (error) {
    console.error('Error fetching node:', error);
    return NextResponse.json({ error: 'Failed to fetch node' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.role, 'OPERATOR')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      name,
      connectionString,
      role,
      status,
      syncEnabled,
      replicationEnabled,
      sslEnabled,
      sslMode,
      testConnection: shouldTestConnection,
    } = body ?? {};

    // Fetch existing node with actual credentials
    const existingNode = await prisma.node.findUnique({ where: { id } });
    if (!existingNode) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    // Determine which connection string to use
    let finalConnectionString = existingNode.connectionString;
    let finalDbUser = existingNode.dbUser;
    let finalDbPassword = existingNode.dbPassword;
    let host = existingNode.host;
    let port = existingNode.port;
    let connectionModified = false;

    // Check if a new connection string was provided with actual credentials
    if (connectionString && !connectionString.includes('***') && !connectionString.includes('••••')) {
      const parsed = parseConnectionString(connectionString);
      if (!parsed) {
        return NextResponse.json(
          { error: 'Invalid connection string format. Use: postgresql://user:password@host:port/database' },
          { status: 400 }
        );
      }

      if (!parsed.user || !parsed.password) {
        return NextResponse.json(
          { error: 'Connection string must include credentials: postgresql://user:password@host:port/database' },
          { status: 400 }
        );
      }

      // Build the full connection string with exact credentials provided
      finalConnectionString = buildConnectionString(
        parsed.host,
        parsed.port,
        parsed.database,
        parsed.user,
        parsed.password,
        sslMode || parsed.sslMode || 'disable'
      );
      finalDbUser = parsed.user;
      finalDbPassword = parsed.password;
      host = parsed.host;
      port = parsed.port;
      connectionModified = true;
    }

    // Test connection if requested and credentials are available
    let connectionVerified = existingNode.connectionVerified;
    let connectionError: string | null = existingNode.connectionError;
    let pgVersion: string | null = existingNode.pgVersion;

    if (shouldTestConnection !== false && finalConnectionString) {
      const testResult = await testConnection(finalConnectionString);
      connectionVerified = testResult.success;
      connectionError = testResult.error || null;
      pgVersion = testResult.pgVersion || existingNode.pgVersion;

      if (!testResult.success && connectionModified) {
        return NextResponse.json(
          {
            error: 'Connection test failed with new credentials',
            details: testResult.error,
            allowForce: true,
          },
          { status: 400 }
        );
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;

    // If promoting to PRIMARY, demote any existing PRIMARY nodes in the cluster
    let demotedNodes: string[] = [];
    if (role === 'PRIMARY' && existingNode.role !== 'PRIMARY') {
      const existingPrimaries = await prisma.node.findMany({
        where: {
          clusterId: existingNode.clusterId,
          role: 'PRIMARY',
          id: { not: id },
        },
      });

      if (existingPrimaries.length > 0) {
        await prisma.node.updateMany({
          where: {
            clusterId: existingNode.clusterId,
            role: 'PRIMARY',
            id: { not: id },
          },
          data: { role: 'REPLICA' },
        });
        demotedNodes = existingPrimaries.map(n => n.id);
      }
    }
    if (syncEnabled !== undefined) {
      updateData.syncEnabled = syncEnabled;
      updateData.syncStatus = syncEnabled ? 'PENDING' : 'NOT_CONFIGURED';
    }
    if (replicationEnabled !== undefined) updateData.replicationEnabled = replicationEnabled;
    if (sslEnabled !== undefined) updateData.sslEnabled = sslEnabled;
    if (sslMode !== undefined) updateData.sslMode = sslMode;

    // Update connection fields if modified
    if (connectionModified) {
      updateData.connectionString = finalConnectionString;
      updateData.dbUser = finalDbUser;
      updateData.dbPassword = finalDbPassword;
      updateData.host = host;
      updateData.port = port;
    }

    // Update connection test results
    updateData.connectionVerified = connectionVerified;
    updateData.connectionError = connectionError;
    updateData.pgVersion = pgVersion;
    if (connectionVerified) {
      updateData.lastConnectionTest = new Date();
    }

    const updatedNode = await prisma.node.update({
      where: { id },
      data: updateData,
    });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Node',
      entityId: id,
      action: 'UPDATE',
      beforeState: { ...existingNode, dbPassword: '[REDACTED]', connectionString: '[REDACTED]' },
      afterState: { ...updatedNode, dbPassword: '[REDACTED]', connectionString: '[REDACTED]' },
    });

    // Return sanitized node with demoted nodes info
    return NextResponse.json({
      ...updatedNode,
      dbPassword: updatedNode.dbPassword ? '***' : null,
      connectionString: updatedNode.connectionString
        ? maskConnectionString(updatedNode.connectionString)
        : null,
      demotedNodes, // IDs of nodes that were demoted to REPLICA
    });
  } catch (error) {
    console.error('Error updating node:', error);
    return NextResponse.json({ error: 'Failed to update node' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.role, 'OPERATOR')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    const node = await prisma.node.findUnique({ where: { id } });
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    // Prevent deletion of primary node without confirmation
    if (node.role === 'PRIMARY') {
      const { searchParams } = new URL(request.url);
      const confirmPrimary = searchParams.get('confirmPrimary');
      if (confirmPrimary !== 'true') {
        return NextResponse.json(
          { error: 'Cannot delete primary node. Add ?confirmPrimary=true to confirm.' },
          { status: 400 }
        );
      }
    }

    await prisma.node.delete({ where: { id } });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Node',
      entityId: id,
      action: 'DELETE',
      beforeState: { ...node, dbPassword: '[REDACTED]', connectionString: '[REDACTED]' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting node:', error);
    return NextResponse.json({ error: 'Failed to delete node' }, { status: 500 });
  }
}
