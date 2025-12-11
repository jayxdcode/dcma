FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg curl ca-certificates gnupg nodejs npm && \
    pip3 install yt-dlp && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* /app/
RUN npm install --production || true
COPY . /app

ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]
