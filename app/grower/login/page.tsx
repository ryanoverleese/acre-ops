import GrowerLoginForm from './GrowerLoginForm';
import { safeCallbackUrl } from '@/lib/safe-callback';
import { staffMetadata } from '@/lib/site-metadata';

export const metadata = staffMetadata('growerLogin');

export default async function GrowerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const params = await searchParams;
  const callback = safeCallbackUrl(params.callbackUrl);
  const next = callback === '/grower' || !callback.startsWith('/grower') ? '/grower/fields' : callback;
  return <GrowerLoginForm callbackUrl={next} />;
}
