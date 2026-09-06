FROM node:22-alpine AS builder
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx tsc

# ── App runtime: bot, api, sync-elastic, migrations ───────────────────────────
FROM node:22-alpine AS app
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /usr/src/app/dist ./dist

# ── Scraper runtime: app + yt-dlp + OpenVPN ──────────────────────────────────
FROM app AS scraper

RUN apk add --no-cache curl python3 openvpn iproute2 && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    mkdir -p node_modules/ytdlp-nodejs/bin && \
    ln -s /usr/local/bin/yt-dlp node_modules/ytdlp-nodejs/bin/yt-dlp

COPY --from=builder /usr/src/app/src/modules/scraping/scrapers/channel-discovery/data ./dist/src/modules/scraping/scrapers/channel-discovery/data

# entrypoint.scraper.sh handles VPN startup
COPY entrypoint.scraper.sh ./
RUN chmod +x entrypoint.scraper.sh

CMD ["sh", "./entrypoint.scraper.sh"]
