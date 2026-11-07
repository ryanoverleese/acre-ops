import LoginForm from './LoginForm';
import { staffMetadata } from '@/lib/site-metadata';

export const metadata = staffMetadata('login');

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl?.startsWith('/') && !params.callbackUrl.startsWith('//')
    ? params.callbackUrl
    : '/';
  return <LoginForm callbackUrl={callbackUrl} />;
}
