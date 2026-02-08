import { redirect } from 'next/navigation';

// User registration is disabled - redirect to login
export default function RegisterPage() {
  redirect('/login');
}
