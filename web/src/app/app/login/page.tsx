import { redirect } from 'next/navigation';

export default function LoginPage() {
  // The login flow is now unified into the /app/unlock page.
  redirect('/app/unlock');
}
