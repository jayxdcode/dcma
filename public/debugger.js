// iframe debugger version 1
(function() {
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
        z-index: 2147483647; /* Max z-index possible */
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
            
            injectEruda(); // Ensure Eruda is loaded when shown
        } else {
            // Revert to hidden/small state
            iframe.style.setProperty('position', 'absolute', 'important');
            iframe.style.setProperty('top', '-9999px', 'important');
            iframe.style.setProperty('left', '-9999px', 'important');
            iframe.style.setProperty('width', '1px', 'important');
            iframe.style.setProperty('height', '1px', 'important');
            iframe.style.setProperty('pointer-events', 'none', 'important');
            
            btn.innerHTML = 'DEBUG MODE: OFF';
            btn.style.background = '#2c2f33';
        }
        isVisible = !isVisible;
    };

    document.body.appendChild(btn);
})();
