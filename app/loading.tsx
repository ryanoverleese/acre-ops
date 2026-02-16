export default function Loading() {
  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>&nbsp;</h2>
        </div>
      </header>
      <div className="content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <style dangerouslySetInnerHTML={{ __html: `
          .splash-icon {
            width: 48px; height: 48px;
            animation: splash-draw 2s ease-in-out infinite;
          }
          .splash-drop-path {
            stroke-dasharray: 80;
            stroke-dashoffset: 80;
            animation: splash-stroke 2s ease-in-out infinite;
          }
          .splash-timer {
            margin-top: 16px;
            font-family: 'SF Mono', 'Fira Code', 'Courier New', monospace;
            font-size: 13px; color: var(--text-muted, #475569);
            display: flex; align-items: center; gap: 6px;
          }
          .splash-timer-dot {
            width: 6px; height: 6px; border-radius: 50%;
            background: #3b82f6;
            animation: splash-blink 1s ease-in-out infinite;
          }
          .splash-label {
            margin-top: 12px;
            font-size: 13px; color: var(--text-muted, #64748b);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          }
          @keyframes splash-stroke {
            0% { stroke-dashoffset: 80; opacity: 0.3; }
            40% { stroke-dashoffset: 0; opacity: 1; }
            60% { stroke-dashoffset: 0; opacity: 1; }
            100% { stroke-dashoffset: -80; opacity: 0.3; }
          }
          @keyframes splash-draw {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.06); }
          }
          @keyframes splash-blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}} />

        <div className="splash-icon">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              className="splash-drop-path"
              d="M12 2.69C12 2.69 7 8.33 7 13a5 5 0 0010 0c0-4.67-5-10.31-5-10.31z"
              stroke="#3b82f6"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M9.5 14a2.5 2.5 0 003 2.4"
              stroke="#60a5fa"
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.5"
            />
          </svg>
        </div>

        <div className="splash-label">Loading data...</div>

        <div className="splash-timer">
          <div className="splash-timer-dot" />
          <span id="splash-counter">0.0s</span>
        </div>

        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var start = Date.now();
            var el = document.getElementById('splash-counter');
            if (!el) return;
            setInterval(function(){
              el.textContent = ((Date.now() - start) / 1000).toFixed(1) + 's';
            }, 100);
          })();
        `}} />
      </div>
    </>
  );
}
