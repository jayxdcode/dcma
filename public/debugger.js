// iframe debugger version 2
function iframeDebug() {
    const iframe = document.querySelector('#hitori-yt-player');
    if (!iframe) {
        console.error("Iframe #hitori-yt-player not found.");
        return;
    }

    // Create the Toggle Button
    const btn = document.createElement('button');
    btn.innerHTML = 'DEBUG MODE: OFF';
    btn.style.cssText = `
        position: fixed;
        top: 15px;
        right: 15px;
        z-index: 2147483647;
        padding: 12px 20px;
        background: #2c2f33;
        color: white;
        border: 2px solid #5865F2;
        border-radius: 8px;
        cursor: pointer;
        font-family: sans-serif;
        font-weight: bold;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    `;

    let isVisible = false;
    // Store original styles to revert accurately
    const originalStyles = iframe.style.cssText;

    btn.onclick = () => {
        if (!isVisible) {
            // Take over the whole view
            iframe.style.setProperty('position', 'fixed', 'important');
            iframe.style.setProperty('top', '0', 'important');
            iframe.style.setProperty('left', '0', 'important');
            iframe.style.setProperty('width', '100vw', 'important');
            iframe.style.setProperty('height', '100vh', 'important');
            iframe.style.setProperty('z-index', '2147483646', 'important');
            iframe.style.setProperty('pointer-events', 'auto', 'important');
            iframe.style.setProperty('display', 'block', 'important');

            btn.innerHTML = 'DEBUG MODE: ON';
            btn.style.background = '#ed4245';

            if (typeof injectEruda === 'function') injectEruda(); 
        } else {
            // REVERT: Clear the inline styles we added and restore original inline styles
            iframe.style.cssText = originalStyles;
            
            btn.innerHTML = 'DEBUG MODE: OFF';
            btn.style.background = '#2c2f33';
        }
        isVisible = !isVisible;
    };

    document.body.appendChild(btn);
}

(function() {
    // 1. Assign to window for manual console access
    window.iframeDebug = iframeDebug;
    
    // 2. RUN IMMEDIATELY
    // We use a small timeout or check DOMContentLoaded to ensure the iframe exists
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iframeDebug);
    } else {
        iframeDebug();
    }
    
    console.log('[debugger.js] Debugger initialized.');
})();
