export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name } = body ?? {};

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create new org for new users
    const org = await prisma.organization.create({
      data: {
        name: `${name || email.split('@')[0]}'s Organization`,
      },
    });

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: 'OWNER',
        orgId: org.id,
      },
    });

    // Create default project
    await prisma.project.create({
      data: {
        name: 'Default Project',
        environment: 'DEV',
        orgId: org.id,
      },
    });

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
