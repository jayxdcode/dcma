// src/components/TopBar.jsx
import React, { useEffect, useState } from 'react';
import {
  Typography,
  Avatar,
  Box,
  IconButton,
  Popover,
  Card,
  CardContent,
  CardActions,
  Button,
  Tooltip,
  Link,
  Divider,
  Stack,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import InfoIcon from '@mui/icons-material/Info';
import { useDiscord, getBotIconUrl, getBotDirectoryLink } from '../lib/discordSdk'; // adjust path if needed

// ---------- Helpers ----------
function extractGuildFromSdk(sdk, readyPayload) {
  if (!sdk && !readyPayload) return null;
  const candidates = [readyPayload, sdk?.context, sdk?._lastReadyPayload, sdk?.lastPayload, sdk?.readyPayload];
  for (const c of candidates) {
    if (!c) continue;
    if (c.guild && c.guild.id) return c.guild;
    if (c.guild_id || c.guildId) {
      return {
        id: c.guild_id || c.guildId,
        icon: c.guild_icon || c.icon || c.guildIcon,
        name: c.guild_name || c.guildName || c.name,
      };
    }
  }
  return null;
}

function buildGuildIconUrl(guild, size = 64) {
  if (!guild || !guild.id || !guild.icon) return null;
  const ext = String(guild.icon).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${ext}?size=${size}`;
}

function buildInviteUrl(clientId, permissions = 0, scopes = ['bot', 'applications.commands']) {
  if (!clientId) return null;
  const scopeParam = encodeURIComponent(scopes.join(' '));
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=${scopeParam}`;
}

// ---------- BotCard (shown inside Popover) ----------
function BotCard({ sdk, readyPayload, guild, onClose }) {
  const clientId = sdk?.clientId;
  const botIconId = readyPayload?.config?.application_icon;
  const botName = readyPayload?.config?.application_name || 'Bot';
  const botSummary = readyPayload?.config?.description || readyPayload?.config?.summary || '';
  const botIconUrl = getBotIconUrl(clientId, botIconId);
  
  const dirLink = getBotDirectoryLink ? getBotDirectoryLink(clientId) : null;
  const inviteLink = buildInviteUrl(clientId);
  
  async function handleOpenInvite() {
    if (!inviteLink) return;
    const w = window.open(inviteLink, '_blank', 'noopener,noreferrer');
    // If window.open blocked or returned null, copy link to clipboard as fallback
    if (!w) {
      try {
        await navigator.clipboard.writeText(inviteLink);
        alert('Invite link copied to clipboard.');
      } catch {
        alert('Could not open invite link and failed to copy to clipboard.');
      }
    } else {
      // focus opened window where possible and close popover
      try { w.focus(); } catch (e) {}
      onClose?.();
    }
  }
  
  async function handleCopyInvite() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      // small inline feedback (you can replace this with a Snackbar)
      alert('Invite link copied to clipboard.');
    } catch (err) {
      console.error('copy failed', err);
      alert('Failed to copy link — please copy it manually:\n' + inviteLink);
    }
  }
  
  return (
    <Card sx={{ width: 320, p: 0 }}>
      <CardContent>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar src={botIconUrl} alt={botName} sx={{ width: 64, height: 64, borderRadius: '12px' }} />
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>{botName}</Typography>
            {botSummary ? (
              <Typography variant="body2" sx={{ opacity: 0.85 }}>{botSummary}</Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">No description available.</Typography>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              {dirLink && (
                <Link href={dirLink} target="_blank" rel="noreferrer" underline="none" color="inherit">
                  <Button size="small" startIcon={<OpenInNewIcon fontSize="small" />}>View App Profile</Button>
                </Link>
              )}
            </Stack>
          </Box>
        </Stack>

        <Divider sx={{ my: 1.5 }} />

        {guild ? (
          <Box sx={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar src={buildGuildIconUrl(guild, 64)} sx={{ width: 40, height: 40 }} />
              <Box>
                <Typography variant="subtitle2" fontWeight={600}>{guild.name || 'Server'}</Typography>
                <Typography variant="caption" color="text.secondary">Server ID: {guild.id}</Typography>
              </Box>
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No server context available.
          </Typography>
        )}
      </CardContent>

      <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
        <Box>
          <Tooltip title="Open invite (will open a new tab) or fallback to copying">
            <Button size="small" variant="contained" onClick={handleOpenInvite}>Add to Server</Button>
          </Tooltip>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Copy invite link">
            <IconButton size="small" onClick={handleCopyInvite}><ContentCopyIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="More bot info">
            <IconButton size="small" disabled={!dirLink} href={dirLink} component={dirLink ? 'a' : 'button'} target="_blank" rel="noreferrer">
              <InfoIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </CardActions>
    </Card>
  );
}

// ---------- TopBar ----------
export default function TopBar({ guildIconUrl: propGuildIconUrl }) {
  const { sdk, readyPayload } = useDiscord(); // provided by DiscordProvider at app root
  const [anchorEl, setAnchorEl] = useState(null);
  const [iconUrl, setIconUrl] = useState(propGuildIconUrl || '/assets/default-guild.png');
  
  useEffect(() => {
    // Priority:
    // 1) If the app/bot has an application_icon (new icon setting) -> use bot/app icon
    // 2) If propGuildIconUrl provided -> use that
    // 3) If SDK guild icon available -> use guild icon
    // 4) Fallback -> default image
    const appIconId = readyPayload?.config?.application_icon;
    const clientId = sdk?.clientId;
    if (appIconId && clientId) {
      try {
        const botAppIconUrl = getBotIconUrl(clientId, appIconId);
        setIconUrl(botAppIconUrl);
        return;
      } catch (e) {
        // continue to fallbacks
        console.warn('failed to build app icon url', e);
      }
    }
    
    if (propGuildIconUrl) {
      setIconUrl(propGuildIconUrl);
      return;
    }
    
    const guild = extractGuildFromSdk(sdk, readyPayload);
    const guildIcon = buildGuildIconUrl(guild, 128);
    setIconUrl(guildIcon || '/assets/default-guild.png');
  }, [sdk, readyPayload, propGuildIconUrl]);
  
  const handleOpen = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);
  const open = Boolean(anchorEl);
  const id = open ? 'bot-popover' : undefined;
  
  const guild = extractGuildFromSdk(sdk, readyPayload);
  
  return (
    <div className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div className="h-stack" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, background: 'linear-gradient(135deg, var(--accent), var(--accent-2))'
        }}>
          <GraphicEqIcon sx={{ color: '#000', fontSize: 20 }} />
        </div>
        <Typography variant="h6" fontWeight={700} sx={{ letterSpacing: -0.5 }}>Hitori</Typography>
      </div>

      {/* Right side: clickable avatar (shows bot/app icon when available) */}
      <Box>
        <Tooltip title="Bot / App profile">
          <IconButton aria-describedby={id} onClick={handleOpen} size="small" sx={{ p: 0 }}>
            <Avatar
              src={iconUrl}
              alt="Bot / Guild avatar"
              sx={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                bgcolor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)'
              }}
            />
          </IconButton>
        </Tooltip>

        <Popover
          id={id}
          open={open}
          anchorEl={anchorEl}
          onClose={handleClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          disableRestoreFocus
        >
          <Box sx={{ p: 1 }}>
            <BotCard sdk={sdk} readyPayload={readyPayload} guild={guild} onClose={handleClose} />
          </Box>
        </Popover>
      </Box>
    </div>
  );
}