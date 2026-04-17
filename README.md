# dcma
~~Discord Music Activity (uses Discord Embedded App SDK)~~

> Notice: Since I can't use yt-dlp (lack of a reliable backend access), i'm discontinuing the development toward Discord Activities. However, it doesn't mean as a total disappearance of the web app — I'll just remove discord-related code and that's it.

> *P.S.: I need to replace the README soon lol.*


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
- VITE_LRC_BACKEND_BASE (e.g. https://my-backend.example.com)
- LRC_BACKEND_API_KEY
- VITE_DISCORD_CLIENT_ID

> VITE_LRC_BACKEND_BASE is the backend for translation and romanization. It is different from the deprecated Backend implementation.

## Notes
- Activity audio capture requires user gesture and may behave differently across clients.
- Use the voice-bot fallback for reliable in-channel playback.
- WASM (ffmpeg.wasm) is optional and heavy; used for waveform generation client-side.
- Keep bot tokens and secrets in secure env storage.
