import Link from 'next/link';
import { staffMetadata } from '@/lib/site-metadata';

export const metadata = staffMetadata('notFound');

export default function NotFound() {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Page not found</h1>
          <p>That address is not in the operation center.</p>
        </div>
        <div className="login-form" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Link href="/login" className="btn btn-primary" style={{ width: '100%', textDecoration: 'none' }}>
            Sign in
          </Link>
          <Link href="/" className="btn btn-secondary" style={{ width: '100%', textDecoration: 'none' }}>
            Open dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
