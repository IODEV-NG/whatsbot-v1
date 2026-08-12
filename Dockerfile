# ─── WhatsBot V1 public client ─────────────────────────────────────────────────
# Multi-stage: build installs deps + generates the Prisma client, runtime is slim.
# Node 22 satisfies the engines requirement (>=22.3.0, needed for test mocks).

FROM node:22-alpine AS build
WORKDIR /app

# ffmpeg is required by the sticker command (wa-sticker-formatter shells out to it)
RUN apk add --no-cache ffmpeg

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

# ─── Runtime image ─────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache ffmpeg \
  && addgroup -S whatsbot && adduser -S whatsbot -G whatsbot

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app .

RUN mkdir -p /app/session && chown -R whatsbot:whatsbot /app

USER whatsbot

EXPOSE 3000

# Run migrations on boot (idempotent), then start the bot.
# The bot keeps running standalone or in remote-client mode depending on env.
CMD ["sh", "-c", "npx prisma migrate deploy && node index.js"]
