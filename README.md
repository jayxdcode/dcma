# dcma
Discord Music Activity (uses Discord Embedded App SDK)


## Deploy
- ~~Backend (yt-dlp stream): Render (Docker)~~ **(deprecated)**
- ~~Voice-bot: Render (Docker)~~ **(not implemented)**
- Frontend (React + Vite): Vercel or Netlify

## Env vars (backend)
- PORT (optional)
- YTDLP_PATH (optional)
- STREAM_RATE_LIMIT_PER_HOUR (default 60)
- STREAM_CONCURRENT_PER_IP (default 2)

## Env vars (voice-bot)
- BOT_TOKEN (required)
- BACKEND_BASE (backend base URL)

## Frontend
- VITE_BACKEND_BASE (e.g. https://my-backend.example.com)
- VITE_DISCORD_CLIENT_ID

## Notes
- Activity audio capture requires user gesture and may behave differently across clients.
- Use the voice-bot fallback for reliable in-channel playback.
- WASM (ffmpeg.wasm) is optional and heavy; used for waveform generation client-side.
- Keep bot tokens and secrets in secure env storage.
