 apt install -y curl ca-certificates gnupg build-essential nodejs python3

# Verify
node -v
npm -v
ffmpeg -version

# create venv in repo root (example)
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install yt-dlp
# Then you'll run the backend with YTDLP_PATH=.venv/bin/yt-dlp

# npm i --package-lock-only
npm ci
