export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

// User registration is disabled - accounts are created by administrators only
export async function POST() {
  return NextResponse.json(
    { error: 'User registration is disabled. Please contact an administrator to create an account.' },
    { status: 403 }
  );
}
