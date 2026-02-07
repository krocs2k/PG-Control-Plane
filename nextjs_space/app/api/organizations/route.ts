export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { hasPermission } from '@/lib/types';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgs = await prisma.organization.findMany({
      where: session.user.orgId ? { id: session.user.orgId } : {},
      include: { _count: { select: { projects: true, users: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(orgs);
  } catch (error) {
    console.error('Error fetching organizations:', error);
    return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.role, 'ADMIN')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { name } = body ?? {};

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const org = await prisma.organization.create({
      data: { name },
    });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Organization',
      entityId: org.id,
      action: 'CREATE',
      afterState: org,
    });

    return NextResponse.json(org);
  } catch (error) {
    console.error('Error creating organization:', error);
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
  }
}
