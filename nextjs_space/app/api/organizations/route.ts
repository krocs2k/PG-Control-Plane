export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
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
      include: { 
        _count: { select: { projects: true, users: true } },
        users: {
          select: { id: true, name: true, email: true, role: true },
          take: 5,
        },
      },
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

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.role, 'ADMIN')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { id, name } = body ?? {};

    if (!id) {
      return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
    }

    const existingOrg = await prisma.organization.findUnique({
      where: { id },
    });

    if (!existingOrg) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const updatedOrg = await prisma.organization.update({
      where: { id },
      data: { name: name || existingOrg.name },
    });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Organization',
      entityId: id,
      action: 'UPDATE',
      beforeState: existingOrg,
      afterState: updatedOrg,
    });

    return NextResponse.json(updatedOrg);
  } catch (error) {
    console.error('Error updating organization:', error);
    return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.role, 'ADMIN')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
    }

    const existingOrg = await prisma.organization.findUnique({
      where: { id },
      include: { _count: { select: { users: true, projects: true } } },
    });

    if (!existingOrg) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Check if org has users or projects
    if (existingOrg._count.users > 0 || existingOrg._count.projects > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete organization with existing users or projects. Please reassign or delete them first.' 
      }, { status: 400 });
    }

    await prisma.organization.delete({
      where: { id },
    });

    await createAuditLog({
      userId: session.user.id,
      entityType: 'Organization',
      entityId: id,
      action: 'DELETE',
      beforeState: existingOrg,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting organization:', error);
    return NextResponse.json({ error: 'Failed to delete organization' }, { status: 500 });
  }
}
