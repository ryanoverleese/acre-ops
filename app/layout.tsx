import type { Metadata } from 'next';
import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import './globals.css';
import AppShell from '@/components/AppShell';
import LoadingBar from '@/components/LoadingBar';
import Providers from '@/components/Providers';
import BootSplash from '@/components/BootSplash';

const AskAI = dynamic(() => import('@/components/AskAI'), { loading: () => null });

export const metadata: Metadata = {
  title: 'Acre Insights Operation Center',
  description: 'Agricultural probe management system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="dns-prefetch" href="https://api.baserow.io" />
        <link rel="preconnect" href="https://api.baserow.io" />
      </head>
      <body>
        <BootSplash />
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var s=Date.now(),e=document.getElementById('boot-splash-elapsed');
            if(!e)return;
            var iv=setInterval(function(){
              if(!e||!document.contains(e)){clearInterval(iv);return}
              e.textContent=((Date.now()-s)/1000).toFixed(1)+'s';
            },100);
          })();
        `}} />
        <Providers>
          <Suspense fallback={null}>
            <LoadingBar />
          </Suspense>
          <div className="app">
            <AppShell>{children}</AppShell>
          </div>
          <AskAI />
        </Providers>
      </body>
    </html>
  );
}
