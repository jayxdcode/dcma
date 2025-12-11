FROM node:18-bullseye
WORKDIR /app
COPY package.json package-lock.json* /app/
RUN npm ci --production
COPY . /app
ENV NODE_ENV=production
CMD ["node", "stream-bot.js"]
