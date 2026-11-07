import LoginForm from './LoginForm';
import { safeCallbackUrl } from '@/lib/safe-callback';
import { staffMetadata } from '@/lib/site-metadata';

export const metadata = staffMetadata('login');

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const params = await searchParams;
  return <LoginForm callbackUrl={safeCallbackUrl(params.callbackUrl)} />;
}
