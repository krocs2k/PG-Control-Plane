export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { hasPermission } from '@/lib/types';
import bcrypt from 'bcryptjs';

// Parse PostgreSQL connection string
function parseConnectionString(connStr: string): {
  host: string;
  port: number;
  database?: string;
  user?: string;
  password?: string;
  sslMode?: string;
} | null {
  try {
    const regex = /^postgres(?:ql)?:\/\/(?:([^:]+):([^@]+)@)?([^:/]+):?(\d+)?(?:\/([^?]+))?(?:\?(.*))?$/;
    const match = connStr.match(regex);
    
    if (!match) return null;
    
    const [, user, password, host, port, database, queryString] = match;
    const params: Record<string, string> = {};
    
    if (queryString) {
      queryString.split('&').forEach((param) => {
        const [key, value] = param.split('=');
        params[key] = decodeURIComponent(value);
      });
    }
    
    return {
      host,
      port: port ? parseInt(port, 10) : 5432,
      database,
      user,
      password,
      sslMode: params.sslmode || params.ssl_mode || 'require',
    };
  } catch {
    return null;
  }
}

function buildConnectionString(
  host: string,
  port: number,
  database?: string,
  user?: string,
  password?: string,
  sslMode?: string
): string {
  let connStr = 'postgresql://';
  if (user) {
    connStr += encodeURIComponent(user);
    if (password) {
      connStr += ':' + encodeURIComponent(password);
    }
    connStr += '@';
  }
  connStr += `${host}:${port}`;
  if (database) {
    connStr += '/' + database;
  }
  if (sslMode) {
    connStr += `?sslmode=${sslMode}`;
  }
  return connStr;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const node = await prisma.node.findUnique({
      where: { id: params?.id },
      include: { cluster: { include: { project: true } } },
    });

    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    // Mask sensitive data
    return NextResponse.json({
      ...node,
      dbPasswordHash: node.dbPasswordHash ? '***' : null,
      connectionString: node.connectionString
        ? node.connectionString.replace(/:([^@]+)@/, ':***@')
        : null,
    });
  } catch (error) {
    console.error('Error fetching node:', error);
    return NextResponse.json({ error: 'Failed to fetch node' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.role, 'OPERATOR')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const beforeState = await prisma.node.findUnique({ where: { id: params?.id } });
    if (!beforeState) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      name,
      connectionString,
      dbUser,
      dbPassword,
      role,
      status,
      sslEnabled,
      sslMode,
      syncEnabled,
      replicationEnabled,
    } = body ?? {};

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;
    if (sslEnabled !== undefined) updateData.sslEnabled = sslEnabled;
    if (sslMode !== undefined) updateData.sslMode = sslMode;
    if (syncEnabled !== undefined) {
      updateData.syncEnabled = syncEnabled;
      updateData.syncStatus = syncEnabled ? 'PENDING' : 'NOT_CONFIGURED';
    }
    if (replicationEnabled !== undefined) updateData.replicationEnabled = replicationEnabled;

    // Handle connection string update
    if (connectionString) {
      const parsed = parseConnectionString(connectionString);
      if (!parsed) {
        return NextResponse.json(
          { error: 'Invalid connection string format' },
          { status: 400 }
        );
      }

      const finalUser = dbUser || parsed.user;
      const finalPassword = dbPassword || parsed.password;

      if (!finalUser || !finalPassword) {
        return NextResponse.json(
          { error: 'Database credentials are required' },
          { status: 400 }
        );
      }

      const fullConnectionString = buildConnectionString(
        parsed.host,
        parsed.port,
        parsed.database,
        finalUser,
        finalPassword,
        sslMode || parsed.sslMode || 'require'
      );

      const passwordHash = await bcrypt.hash(finalPassword, 10);

      updateData.host = parsed.host;
      updateData.port = parsed.port;
      updateData.connectionString = fullConnectionString;
      updateData.dbUser = finalUser;
      updateData.dbPasswordHash = passwordHash;
      updateData.connectionVerified = false;
      updateData.connectionError = null;
    } else if (dbUser || dbPassword) {
      // Update credentials only
      if (dbUser) updateData.dbUser = dbUser;
      if (dbPassword) {
        const passwordHash = await bcrypt.hash(dbPassword, 10);
        updateData.dbPasswordHash = passwordHash;
        
        // Rebuild connection string with new password if we have one
        if (beforeState.connectionString) {
          const parsed = parseConnectionString(beforeState.connectionString);
          if (parsed) {
            updateData.connectionString = buildConnectionString(
              parsed.host,
              parsed.port,
              parsed.database,
              dbUser || beforeState.dbUser || parsed.user,
              dbPassword,
              sslMode || beforeState.sslMode || parsed.sslMode
            );
          }
        }
      }
      updateData.connectionVerified = false;
    }

    const node = await prisma.node.update({
      where: { id: params?.id },
      data: updateData,
    });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Node',
      entityId: node.id,
      action: 'UPDATE',
      beforeState: { ...beforeState, dbPasswordHash: '[REDACTED]', connectionString: '[REDACTED]' },
      afterState: { ...node, dbPasswordHash: '[REDACTED]', connectionString: '[REDACTED]' },
    });

    return NextResponse.json({
      ...node,
      dbPasswordHash: '***',
      connectionString: node.connectionString
        ? node.connectionString.replace(/:([^@]+)@/, ':***@')
        : null,
    });
  } catch (error) {
    console.error('Error updating node:', error);
    return NextResponse.json({ error: 'Failed to update node' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.role, 'ADMIN')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const beforeState = await prisma.node.findUnique({ where: { id: params?.id } });

    await prisma.node.delete({ where: { id: params?.id } });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Node',
      entityId: params?.id,
      action: 'DELETE',
      beforeState: beforeState
        ? { ...beforeState, dbPasswordHash: '[REDACTED]', connectionString: '[REDACTED]' }
        : undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting node:', error);
    return NextResponse.json({ error: 'Failed to delete node' }, { status: 500 });
  }
}
