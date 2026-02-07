export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get('clusterId');
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');

    const incidents = await prisma.incident.findMany({
      where: {
        ...(clusterId && { clusterId }),
        ...(status && { status: status as any }),
        ...(severity && { severity: severity as any }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json(incidents);
  } catch (error) {
    console.error('Error fetching incidents:', error);
    return NextResponse.json({ error: 'Failed to fetch incidents' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { clusterId, severity, title, description } = body;

    if (!clusterId || !severity || !title || !description) {
      return NextResponse.json(
        { error: 'clusterId, severity, title, and description are required' },
        { status: 400 }
      );
    }

    const incident = await prisma.incident.create({
      data: {
        clusterId,
        severity,
        title,
        description,
        status: 'OPEN',
      },
    });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Incident',
      entityId: incident.id,
      action: 'CREATE',
      afterState: incident,
    });

    return NextResponse.json(incident);
  } catch (error) {
    console.error('Error creating incident:', error);
    return NextResponse.json({ error: 'Failed to create incident' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, status, rootCause, timeline, actionItems } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await prisma.incident.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    const incident = await prisma.incident.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(rootCause && { rootCause }),
        ...(timeline && { timeline }),
        ...(actionItems && { actionItems }),
        ...(status === 'RESOLVED' && { resolvedAt: new Date() }),
      },
    });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Incident',
      entityId: id,
      action: 'UPDATE',
      beforeState: existing,
      afterState: incident,
    });

    return NextResponse.json(incident);
  } catch (error) {
    console.error('Error updating incident:', error);
    return NextResponse.json({ error: 'Failed to update incident' }, { status: 500 });
  }
}
