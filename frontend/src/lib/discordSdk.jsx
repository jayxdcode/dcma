// src/lib/discordSdk.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';

const DiscordContext = createContext({ sdk: null, readyPayload: null });

/** Singleton SDK instance */
let sdkInstance = null;

/**
 * Initialize the Discord Embedded App SDK.
 */
export async function initDiscordSdk(clientId, opts = {}) {
  const { timeout = 4500 } = opts;
  if (!clientId) return null;
  if (sdkInstance) return sdkInstance;
  
  try {
    const sdk = new DiscordSDK(clientId);
    sdkInstance = sdk;
    
    await Promise.race([
      sdk.ready(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Discord SDK timeout')), timeout))
    ]);
    
    return sdkInstance;
  } catch (err) {
    console.warn('Failed to initialize DiscordSDK:', err);
    return null;
  }
}

export function getDiscordSdk() {
  return sdkInstance;
}

/**
 * GENERATE BOT LINKS
 */

// Returns the CDN link for the Bot/Application icon
export function getBotIconUrl(clientId, iconHash, size = 256) {
  if (!clientId || !iconHash) return null;
  return `https://cdn.discordapp.com/app-icons/${clientId}/${iconHash}.png?size=${size}`;
}

// Returns the link to the Bot's App Directory profile
export function getBotDirectoryLink(clientId) {
  if (!clientId) return '#';
  return `https://discord.com/application-directory/${clientId}`;
}

/**
 * GUILD ICON LOGIC
 */
export function setGuildIconOnElement(elementId, { size = 256, fallback } = {}) {
  const el = document.getElementById(elementId);
  if (!el) return false;
  
  const sdk = sdkInstance;
  if (!sdk || !sdk.readyPayload) {
    if (fallback) el.src = fallback;
    return false;
  }

  // Guild info is usually inside the readyPayload after handshake
  const guild = sdk.readyPayload.guild;
  const guildId = sdk.guildId || guild?.id;
  const iconHash = guild?.icon;

  if (guildId && iconHash) {
    const isAnimated = iconHash.startsWith('a_');
    const ext = isAnimated ? 'gif' : 'png';
    el.src = `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${ext}?size=${size}`;
    return true;
  }
  
  if (fallback) el.src = fallback;
  return false;
}

/**
 * REACT PROVIDER
 */
export function DiscordProvider({ children, clientId }) {
  const [sdk, setSdk] = useState(null);
  const [readyPayload, setReadyPayload] = useState(null);
  
  useEffect(() => {
    let mounted = true;
    
    const start = async () => {
      const s = await initDiscordSdk(clientId);
      if (!mounted || !s) return;

      setSdk(s);
      setReadyPayload(s.readyPayload);

      // Give React one tick to render the <img> before searching the DOM
      setTimeout(() => {
        setGuildIconOnElement('guild-icon', { 
          fallback: 'https://cdn.discordapp.com/embed/avatars/0.png' 
        });
      }, 50);
    };

    start();
    return () => { mounted = false; };
  }, [clientId]);
  
  return (
    <DiscordContext.Provider value={{ sdk, readyPayload }}>
      {children}
    </DiscordContext.Provider>
  );
}

export function useDiscord() {
  return useContext(DiscordContext);
}
