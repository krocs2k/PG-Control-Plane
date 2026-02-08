import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { EndpointMode, EndpointStatus } from '@prisma/client';
import crypto from 'crypto';

// Helper to generate unique slug
function generateSlug(clusterName: string, endpointName: string): string {
  const base = `${clusterName}-${endpointName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const uniqueSuffix = Math.random().toString(36).substring(2, 8);
  return `${base}-${uniqueSuffix}`;
}

// Generate secure random username (prefix + random alphanumeric)
function generateSecureUsername(): string {
  const prefixes = ['ep', 'conn', 'app', 'svc', 'db'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const randomPart = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${randomPart}`;
}

// Generate secure random password (32 chars with mixed characters)
function generateSecurePassword(): string {
  const length = 32;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }
  // Ensure at least one of each type
  const ensureChars = [
    'abcdefghijklmnopqrstuvwxyz',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    '0123456789',
    '!@#$%^&*'
  ];
  ensureChars.forEach((chars, idx) => {
    const randomChar = chars[crypto.randomBytes(1)[0] % chars.length];
    const pos = idx * 4; // Spread them out
    password = password.substring(0, pos) + randomChar + password.substring(pos + 1);
  });
  return password;
}

// Generate both username and password
function generateCredentials(): { username: string; password: string } {
  return {
    username: generateSecureUsername(),
    password: generateSecurePassword(),
  };
}

// Extract domain from request headers (dynamic based on deployment)
function getDynamicDomain(request: NextRequest): string {
  // Priority: X-Forwarded-Host > Host header > fallback
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  
  const domain = forwardedHost || host || 'localhost:3000';
  return `${protocol}://${domain}`;
}

// Generate connection string based on endpoint config
function generateConnectionString(
  endpoint: {
    slug: string;
    port: number;
    sslMode: string;
    mode: EndpointMode;
    username?: string | null;
    password?: string | null;
  },
  domain: string,
  showCredentials: boolean = false
): string {
  // Extract just the hostname (without protocol and port from the URL)
  const host = domain.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];
  
  // Use stored credentials or placeholders
  const username = showCredentials && endpoint.username ? endpoint.username : '<username>';
  const password = showCredentials && endpoint.password ? endpoint.password : '<password>';
  const dbName = endpoint.slug;
  
  let params = `sslmode=${endpoint.sslMode}`;
  
  // Add mode-specific parameters
  switch (endpoint.mode) {
    case 'READ_ONLY':
      params += '&target_session_attrs=read-only';
      break;
    case 'WRITE_ONLY':
      params += '&target_session_attrs=read-write';
      break;
    case 'BALANCED':
      params += '&load_balance_hosts=random';
      break;
  }
  
  return `postgresql://${username}:${password}@${host}:${endpoint.port}/${dbName}?${params}`;
}

// GET - List connection endpoints for a cluster
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get('clusterId');
    const endpointId = searchParams.get('id');
    const showCredentials = searchParams.get('showCredentials') === 'true';

    // Get single endpoint details
    if (endpointId) {
      const endpoint = await prisma.connectionEndpoint.findUnique({
        where: { id: endpointId },
      });

      if (!endpoint) {
        return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
      }

      const cluster = await prisma.cluster.findUnique({
        where: { id: endpoint.clusterId },
        include: { nodes: true },
      });

      // Get routing config
      const routingConfig = await prisma.routingConfig.findUnique({
        where: { clusterId: endpoint.clusterId },
      });

      // Get domain dynamically from request headers
      const domain = getDynamicDomain(request);

      return NextResponse.json({
        ...endpoint,
        // Mask password unless explicitly requested
        password: showCredentials ? endpoint.password : (endpoint.password ? '********' : null),
        cluster,
        routingConfig,
        connectionString: generateConnectionString(endpoint, domain, false),
        connectionStringWithCredentials: showCredentials ? generateConnectionString(endpoint, domain, true) : null,
        hasCredentials: !!endpoint.username && !!endpoint.password,
        totalConnections: endpoint.totalConnections.toString(),
        bytesIn: endpoint.bytesIn.toString(),
        bytesOut: endpoint.bytesOut.toString(),
      });
    }

    // List endpoints for cluster
    if (!clusterId) {
      return NextResponse.json(
        { error: 'clusterId is required' },
        { status: 400 }
      );
    }

    const endpoints = await prisma.connectionEndpoint.findMany({
      where: { clusterId },
      orderBy: { createdAt: 'desc' },
    });

    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      include: { nodes: true },
    });

    // Get domain dynamically from request headers
    const domain = getDynamicDomain(request);

    // Add connection strings to endpoints
    const endpointsWithStrings = endpoints.map((ep) => ({
      ...ep,
      // Mask password unless explicitly requested
      password: showCredentials ? ep.password : (ep.password ? '********' : null),
      connectionString: generateConnectionString(ep, domain, false),
      connectionStringWithCredentials: showCredentials ? generateConnectionString(ep, domain, true) : null,
      hasCredentials: !!ep.username && !!ep.password,
      totalConnections: ep.totalConnections.toString(),
      bytesIn: ep.bytesIn.toString(),
      bytesOut: ep.bytesOut.toString(),
    }));

    // Simulate some live stats
    const simulatedEndpoints = endpointsWithStrings.map((ep) => ({
      ...ep,
      activeConnections: ep.status === 'ACTIVE' ? Math.floor(Math.random() * ep.maxConnections * 0.7) : 0,
    }));

    return NextResponse.json({
      endpoints: simulatedEndpoints,
      cluster,
      domain,
    });
  } catch (error) {
    console.error('Error fetching connection endpoints:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new connection endpoint
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      clusterId,
      name,
      mode = 'READ_WRITE',
      port = 5432,
      sslMode = 'require',
      maxConnections = 100,
      poolSize = 20,
      idleTimeout = 300,
      readWeight = 100,
      writeWeight = 100,
    } = body;

    if (!clusterId || !name) {
      return NextResponse.json(
        { error: 'clusterId and name are required' },
        { status: 400 }
      );
    }

    // Verify cluster exists
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
    });

    if (!cluster) {
      return NextResponse.json(
        { error: 'Cluster not found' },
        { status: 404 }
      );
    }

    // Generate unique slug
    const slug = generateSlug(cluster.name, name);
    
    // Auto-generate secure credentials
    const credentials = generateCredentials();

    // Create endpoint with credentials
    const endpoint = await prisma.connectionEndpoint.create({
      data: {
        clusterId,
        name,
        slug,
        mode: mode as EndpointMode,
        port,
        sslMode,
        maxConnections,
        poolSize,
        idleTimeout,
        readWeight,
        writeWeight,
        username: credentials.username,
        password: credentials.password,
        credentialsCreatedAt: new Date(),
      },
    });

    await createAuditLog({
      userId: session.user.id,
      action: 'CREATE_CONNECTION_ENDPOINT',
      entityType: 'ConnectionEndpoint',
      entityId: endpoint.id,
      afterState: { ...endpoint, password: '***REDACTED***' },
    });

    // Get domain dynamically from request headers
    const domain = getDynamicDomain(request);

    return NextResponse.json({
      ...endpoint,
      connectionString: generateConnectionString(endpoint, domain, false),
      connectionStringWithCredentials: generateConnectionString(endpoint, domain, true),
      hasCredentials: true,
      totalConnections: endpoint.totalConnections.toString(),
      bytesIn: endpoint.bytesIn.toString(),
      bytesOut: endpoint.bytesOut.toString(),
    });
  } catch (error) {
    console.error('Error creating connection endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH - Update connection endpoint
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, action, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Endpoint id is required' },
        { status: 400 }
      );
    }

    const existingEndpoint = await prisma.connectionEndpoint.findUnique({
      where: { id },
    });

    if (!existingEndpoint) {
      return NextResponse.json(
        { error: 'Endpoint not found' },
        { status: 404 }
      );
    }

    let updatedEndpoint;

    // Get domain dynamically from request headers
    const domain = getDynamicDomain(request);

    switch (action) {
      case 'enable':
        updatedEndpoint = await prisma.connectionEndpoint.update({
          where: { id },
          data: { status: 'ACTIVE' },
        });
        break;

      case 'disable':
        updatedEndpoint = await prisma.connectionEndpoint.update({
          where: { id },
          data: { status: 'DISABLED' },
        });
        break;

      case 'maintenance':
        updatedEndpoint = await prisma.connectionEndpoint.update({
          where: { id },
          data: { status: 'MAINTENANCE' },
        });
        break;

      case 'reset_stats':
        updatedEndpoint = await prisma.connectionEndpoint.update({
          where: { id },
          data: {
            activeConnections: 0,
            totalConnections: BigInt(0),
            bytesIn: BigInt(0),
            bytesOut: BigInt(0),
          },
        });
        break;

      case 'regenerate-credentials': {
        // Generate new secure credentials
        const newCredentials = generateCredentials();
        updatedEndpoint = await prisma.connectionEndpoint.update({
          where: { id },
          data: {
            username: newCredentials.username,
            password: newCredentials.password,
            credentialsCreatedAt: new Date(),
          },
        });

        await createAuditLog({
          userId: session.user.id,
          action: 'ENDPOINT_REGENERATE_CREDENTIALS',
          entityType: 'ConnectionEndpoint',
          entityId: id,
          beforeState: { ...existingEndpoint, password: '***REDACTED***' },
          afterState: { ...updatedEndpoint, password: '***REDACTED***' },
        });

        // Return with new credentials visible (one-time display)
        return NextResponse.json({
          ...updatedEndpoint,
          connectionString: generateConnectionString(updatedEndpoint, domain, false),
          connectionStringWithCredentials: generateConnectionString(updatedEndpoint, domain, true),
          hasCredentials: true,
          credentialsRegenerated: true,
          totalConnections: updatedEndpoint.totalConnections.toString(),
          bytesIn: updatedEndpoint.bytesIn.toString(),
          bytesOut: updatedEndpoint.bytesOut.toString(),
        });
      }

      default:
        // General update
        const allowedFields = [
          'name',
          'mode',
          'port',
          'sslMode',
          'maxConnections',
          'poolSize',
          'idleTimeout',
          'readWeight',
          'writeWeight',
          'status',
        ];

        const filteredData: Record<string, unknown> = {};
        for (const field of allowedFields) {
          if (updateData[field] !== undefined) {
            filteredData[field] = updateData[field];
          }
        }

        updatedEndpoint = await prisma.connectionEndpoint.update({
          where: { id },
          data: filteredData,
        });
    }

    await createAuditLog({
      userId: session.user.id,
      action: action ? `ENDPOINT_${action.toUpperCase()}` : 'UPDATE_CONNECTION_ENDPOINT',
      entityType: 'ConnectionEndpoint',
      entityId: id,
      beforeState: { ...existingEndpoint, password: '***REDACTED***' },
      afterState: { ...updatedEndpoint, password: '***REDACTED***' },
    });

    return NextResponse.json({
      ...updatedEndpoint,
      password: updatedEndpoint.password ? '********' : null,
      connectionString: generateConnectionString(updatedEndpoint, domain, false),
      hasCredentials: !!updatedEndpoint.username && !!updatedEndpoint.password,
      totalConnections: updatedEndpoint.totalConnections.toString(),
      bytesIn: updatedEndpoint.bytesIn.toString(),
      bytesOut: updatedEndpoint.bytesOut.toString(),
    });
  } catch (error) {
    console.error('Error updating connection endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Remove connection endpoint
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Endpoint id is required' },
        { status: 400 }
      );
    }

    const existingEndpoint = await prisma.connectionEndpoint.findUnique({
      where: { id },
    });

    if (!existingEndpoint) {
      return NextResponse.json(
        { error: 'Endpoint not found' },
        { status: 404 }
      );
    }

    await prisma.connectionEndpoint.delete({
      where: { id },
    });

    await createAuditLog({
      userId: session.user.id,
      action: 'DELETE_CONNECTION_ENDPOINT',
      entityType: 'ConnectionEndpoint',
      entityId: id,
      beforeState: existingEndpoint,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting connection endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
