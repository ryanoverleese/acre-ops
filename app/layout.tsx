import type { Metadata } from 'next';
import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import './globals.css';
import AppShell from '@/components/AppShell';
import LoadingBar from '@/components/LoadingBar';
import SplashDismiss from '@/components/SplashDismiss';
import Providers from '@/components/Providers';

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
        {/* Cold start splash — pure HTML/CSS, renders before JS */}
        <div id="splash-screen">
          <style dangerouslySetInnerHTML={{ __html: `
            #splash-screen {
              position: fixed; inset: 0; z-index: 9999;
              display: flex; flex-direction: column; align-items: center; justify-content: center;
              background: #0f1724;
              transition: opacity 0.4s ease, visibility 0.4s ease;
            }
            #splash-screen.hidden {
              opacity: 0; visibility: hidden; pointer-events: none;
            }
            .splash-drop {
              width: 48px; height: 48px;
              animation: splash-pulse 1.8s ease-in-out infinite;
            }
            .splash-drop svg { width: 100%; height: 100%; }
            .splash-title {
              margin-top: 16px;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              font-size: 18px; font-weight: 600;
              color: #e2e8f0; letter-spacing: 0.02em;
            }
            .splash-subtitle {
              margin-top: 4px;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              font-size: 12px; color: #64748b;
            }
            .splash-timer {
              margin-top: 20px;
              font-family: 'SF Mono', 'Fira Code', monospace;
              font-size: 13px; color: #475569;
              display: flex; align-items: center; gap: 6px;
            }
            .splash-timer-dot {
              width: 6px; height: 6px; border-radius: 50%;
              background: #3b82f6;
              animation: splash-blink 1s ease-in-out infinite;
            }
            .splash-ripple {
              position: absolute;
              width: 80px; height: 80px;
              border-radius: 50%;
              border: 2px solid rgba(59, 130, 246, 0.15);
              animation: splash-ripple 2.4s ease-out infinite;
            }
            .splash-ripple:nth-child(2) { animation-delay: 0.8s; }
            .splash-ripple:nth-child(3) { animation-delay: 1.6s; }
            @keyframes splash-pulse {
              0%, 100% { transform: translateY(0) scale(1); }
              50% { transform: translateY(-8px) scale(1.05); }
            }
            @keyframes splash-blink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.3; }
            }
            @keyframes splash-ripple {
              0% { transform: scale(0.6); opacity: 0.6; }
              100% { transform: scale(2.5); opacity: 0; }
            }
          `}} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="splash-ripple" />
            <div className="splash-ripple" />
            <div className="splash-ripple" />
            <div className="splash-drop">
              <svg viewBox="0 0 24 24" fill="none">
                <defs>
                  <linearGradient id="dropGrad" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#2563eb" />
                  </linearGradient>
                </defs>
                <path d="M12 2.69l-.66.72C11.14 3.63 7 8.33 7 13a5 5 0 0010 0c0-4.67-4.14-9.37-4.34-9.59L12 2.69z" fill="url(#dropGrad)" />
                <ellipse cx="10" cy="12.5" rx="1.2" ry="2" fill="rgba(255,255,255,0.3)" transform="rotate(-15 10 12.5)" />
              </svg>
            </div>
          </div>
          <div className="splash-title">Acre Insights</div>
          <div className="splash-subtitle">Operation Center</div>
          <div className="splash-timer">
            <div className="splash-timer-dot" />
            <span id="splash-counter">0.0s</span>
          </div>
          <script dangerouslySetInnerHTML={{ __html: `
            (function(){
              var start = Date.now();
              var el = document.getElementById('splash-counter');
              if (!el) return;
              var iv = setInterval(function(){
                var s = ((Date.now() - start) / 1000).toFixed(1);
                el.textContent = s + 's';
              }, 100);
              window.__splashInterval = iv;
            })();
          `}} />
        </div>

        <Providers>
          <SplashDismiss />
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
