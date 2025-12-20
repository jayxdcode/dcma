// src/lib/discordSdk.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';

const DiscordContext = createContext({ sdk: null });

/** Singleton SDK instance (module-level) */
let sdkInstance = null;

/**
 * Initialize the Discord Embedded App SDK singleton.
 * - clientId: string (required to initialize; pass null in local dev to skip)
 * - opts.timeout: ms to wait for sdk.ready() before timing out (default 4500)
 */
export async function initDiscordSdk(clientId, opts = {}) {
  const { timeout = 4500 } = opts;
  if (!clientId) return null; // allow skipping in local/dev
  if (sdkInstance) return sdkInstance;
  
  try {
    const sdk = new DiscordSDK(clientId);
    sdkInstance = sdk;
    
    // wait for ready() but don't block forever in local/dev
    await Promise.race([
      sdk.ready(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('discord sdk ready() timeout')), timeout))
    ]).catch(err => {
      // not fatal — SDK object still exists and may become usable later
      console.warn('Discord SDK ready() failed or timed out:', err);
    });
    
    return sdkInstance;
  } catch (err) {
    console.warn('Failed to create DiscordSDK', err);
    sdkInstance = null;
    return null;
  }
}

/** Return the singleton SDK (may be null if not initialized) */
export function getDiscordSdk() {
  return sdkInstance;
}

/**
 * Try to find guild info from SDK payloads and set an external <img> by id.
 * elementId: DOM id of the <img>
 * options:
 *   - size: number (img size param for CDN) default 256
 *   - fallback: fallback URL to use if no guild/icon found
 * Returns true if guild icon applied, false otherwise.
 */
export function setGuildIconOnElement(elementId, { size = 256, fallback } = {}) {
  const el = document.getElementById(elementId);
  if (!el) return false;
  
  const sdk = sdkInstance;
  let guild = null;
  
  if (sdk) {
    const candidates = [sdk.context, sdk._lastReadyPayload, sdk.lastPayload, sdk.readyPayload];
    for (const c of candidates) {
      if (!c) continue;
      if (c.guild && c.guild.id) { guild = c.guild; break; }
      if (c.guild_id || c.guildId) {
        guild = { id: c.guild_id || c.guildId, icon: c.guild_icon || c.icon };
        break;
      }
    }
  }
  
  if (guild && guild.id && guild.icon) {
    const ext = String(guild.icon).startsWith('a_') ? 'gif' : 'png';
    el.src = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${ext}?size=${size}`;
    return true;
  }
  
  if (fallback) el.src = fallback;
  return false;
}

/**
 * React provider that initializes the SDK once and puts it in context.
 * Usage: wrap your app with <DiscordProvider clientId={...}>...</DiscordProvider>
 */
export function DiscordProvider({ children, clientId }) {
  const [sdk, setSdk] = useState(getDiscordSdk());
  
  useEffect(() => {
    let mounted = true;
    (async () => {
      const s = await initDiscordSdk(clientId);
      if (mounted) setSdk(s);
      // attempt to set the external guild icon automatically (non-blocking)
      try {
        setGuildIconOnElement('guild-icon', { fallback: '/assets/default-guild.png' });
      } catch (e) { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, [clientId]);
  
  return <DiscordContext.Provider value={{ sdk }}>{children}</DiscordContext.Provider>;
}

/** hook for consumers */
export function useDiscord() {
  return useContext(DiscordContext);
}