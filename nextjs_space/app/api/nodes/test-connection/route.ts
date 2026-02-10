export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/types';
import { testConnection, parseConnectionString, buildConnectionString } from '@/lib/postgres';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.role, 'OPERATOR')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { connectionString, sslMode } = body ?? {};

    if (!connectionString) {
      return NextResponse.json(
        { error: 'Connection string is required' },
        { status: 400 }
      );
    }

    // Parse the connection string
    const parsed = parseConnectionString(connectionString);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid connection string format. Use: postgresql://user:password@host:port/database' },
        { status: 400 }
      );
    }

    if (!parsed.user || !parsed.password) {
      return NextResponse.json(
        { error: 'Authentication required. Include credentials in connection string: postgresql://user:password@host:port/database' },
        { status: 400 }
      );
    }

    // Build the full connection string with SSL mode if specified
    const fullConnectionString = buildConnectionString(
      parsed.host,
      parsed.port,
      parsed.database,
      parsed.user,
      parsed.password,
      sslMode || parsed.sslMode || 'disable'
    );

    // Actually test the connection
    const result = await testConnection(fullConnectionString);

    return NextResponse.json({
      success: result.success,
      error: result.error,
      pgVersion: result.pgVersion,
      serverInfo: result.serverInfo,
    });
  } catch (error) {
    console.error('Error testing connection:', error);
    return NextResponse.json(
      { error: 'Failed to test connection' },
      { status: 500 }
    );
  }
}
