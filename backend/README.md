# Backend (yt-dlp streaming + search)

Deploy as Docker service (Render recommended).

ENV:
- PORT (default 8080)
- YTDLP_PATH (optional)
- STREAM_RATE_LIMIT_PER_HOUR (default 60)
- STREAM_CONCURRENT_PER_IP (default 2)

Endpoints:
- GET /api/search?q=QUERY&max=6
- GET /api/stream?url=URL
- GET /api/health
