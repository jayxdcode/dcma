# backend/Dockerfile (fixed)
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive

# install OS packages (python, ffmpeg, node, npm, curl, ca-certs)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3 python3-venv python3-distutils ffmpeg curl ca-certificates gnupg \
      nodejs npm \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# install yt-dlp standalone binary (official release)
# use the "latest" release; optional: pin a specific version by replacing 'latest' with '2025.12.03' etc.
RUN curl -L -o /usr/local/bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# copy package.json and install node deps (production)
COPY package.json package-lock.json* /app/
RUN npm ci --production || npm install --production

COPY . /app

ENV PORT=8080
EXPOSE 8080

CMD ["node", "index.js"]
