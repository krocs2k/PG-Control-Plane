import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // Redirect to dashboard if not authenticated
  if (!session?.user) {
    redirect('/login');
  }

  // Redirect to dashboard if not admin or owner
  const role = session.user.role;
  if (role !== 'ADMIN' && role !== 'OWNER') {
    redirect('/dashboard?error=unauthorized');
  }

  return <>{children}</>;
}
