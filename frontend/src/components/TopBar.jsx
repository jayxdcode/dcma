// src/components/TopBar.jsx
import React, { useEffect, useState } from 'react';
import { Typography, Avatar, Box } from '@mui/material';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import { useDiscord } from '../lib/discordSdk'; // adjust path if needed

function extractGuildFromSdk(sdk) {
  if (!sdk) return null;
  const candidates = [sdk.context, sdk._lastReadyPayload, sdk.lastPayload, sdk.readyPayload];
  for (const c of candidates) {
    if (!c) continue;
    if (c.guild && c.guild.id) return c.guild;
    if (c.guild_id || c.guildId) return { id: c.guild_id || c.guildId, icon: c.guild_icon || c.icon };
  }
  return null;
}

function buildGuildIconUrl(guild, size = 64) {
  if (!guild || !guild.id || !guild.icon) return null;
  const ext = String(guild.icon).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${ext}?size=${size}`;
}

export default function TopBar({ guildIconUrl: propGuildIconUrl }) {
  const { sdk } = useDiscord(); // will be provided by DiscordProvider wrapped at app root
  const [iconUrl, setIconUrl] = useState(propGuildIconUrl || '/assets/default-guild.png');
  
  useEffect(() => {
    // Prefer prop if provided (prop-drill fallback)
    if (propGuildIconUrl) {
      setIconUrl(propGuildIconUrl);
      return;
    }
    
    const guild = extractGuildFromSdk(sdk);
    const url = buildGuildIconUrl(guild, 128) || '/assets/default-guild.png';
    setIconUrl(url);
  }, [sdk, propGuildIconUrl]);
  
  return (
    <div className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div className="h-stack" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, background: 'linear-gradient(135deg, var(--accent), var(--accent-2))'
        }}>
          <GraphicEqIcon sx={{ color: '#000', fontSize: 20 }} />
        </div>
        <Typography variant="h6" fontWeight={700} sx={{ letterSpacing: -0.5 }}>Hitori</Typography>
      </div>

      {/* Guild avatar */}
      <Box>
        <Avatar
          src={iconUrl}
          alt="Guild avatar"
          sx={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            bgcolor: 'rgba(255,255,255,0.04)',
            // optional border:
            border: '1px solid rgba(255,255,255,0.06)'
          }}
        />
      </Box>
    </div>
  );
}