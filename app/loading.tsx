export default function Loading() {
  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>&nbsp;</h2>
        </div>
      </header>
      <div className="content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="splash-icon">
          <svg viewBox="0 0 24 24" fill="none" width="48" height="48">
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
          <span id="splash-elapsed">0.0s</span>
        </div>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var s=Date.now(),e=document.getElementById('splash-elapsed');
            if(!e)return;
            var iv=setInterval(function(){
              if(!e||!document.contains(e)){clearInterval(iv);return}
              e.textContent=((Date.now()-s)/1000).toFixed(1)+'s';
            },100);
          })();
        `}} />
      </div>
    </>
  );
}
