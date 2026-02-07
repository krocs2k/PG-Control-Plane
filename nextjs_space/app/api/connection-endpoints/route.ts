import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { EndpointMode, EndpointStatus } from '@prisma/client';

// Helper to generate unique slug
function generateSlug(clusterName: string, endpointName: string): string {
  const base = `${clusterName}-${endpointName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const uniqueSuffix = Math.random().toString(36).substring(2, 8);
  return `${base}-${uniqueSuffix}`;
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
  },
  domain: string,
  includeCredentials: boolean = false
): string {
  // Extract just the hostname (without protocol and port from the URL)
  const host = domain.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];
  const username = includeCredentials ? 'app_user' : '<username>';
  const password = includeCredentials ? '********' : '<password>';
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
        cluster,
        routingConfig,
        connectionString: generateConnectionString(endpoint, domain),
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
      connectionString: generateConnectionString(ep, domain),
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

    // Create endpoint
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
      },
    });

    await createAuditLog({
      userId: session.user.id,
      action: 'CREATE_CONNECTION_ENDPOINT',
      entityType: 'ConnectionEndpoint',
      entityId: endpoint.id,
      afterState: endpoint,
    });

    // Get domain dynamically from request headers
    const domain = getDynamicDomain(request);

    return NextResponse.json({
      ...endpoint,
      connectionString: generateConnectionString(endpoint, domain),
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
      beforeState: existingEndpoint,
      afterState: updatedEndpoint,
    });

    // Get domain dynamically from request headers
    const domain = getDynamicDomain(request);

    return NextResponse.json({
      ...updatedEndpoint,
      connectionString: generateConnectionString(updatedEndpoint, domain),
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
