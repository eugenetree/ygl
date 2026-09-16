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

# bgutil-ytdlp-pot-provider is the yt-dlp plugin half of the PO token provider;
# its version must match the pot-provider image tag in docker-compose.yml.
# curl_cffi lets yt-dlp impersonate a browser's TLS fingerprint on the requests
# YouTube asks it to (captions, player); without it yt-dlp warns and sends them bare.
RUN apk add --no-cache curl python3 py3-pip openvpn iproute2 && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    mkdir -p node_modules/ytdlp-nodejs/bin && \
    ln -s /usr/local/bin/yt-dlp node_modules/ytdlp-nodejs/bin/yt-dlp && \
    pip install --no-cache-dir --break-system-packages bgutil-ytdlp-pot-provider==2.0.0 curl_cffi

COPY --from=builder /usr/src/app/src/modules/scraping/scrapers/channel-discovery/data ./dist/src/modules/scraping/scrapers/channel-discovery/data

# entrypoint.scraper.sh handles VPN startup
COPY entrypoint.scraper.sh ./
RUN chmod +x entrypoint.scraper.sh

CMD ["sh", "./entrypoint.scraper.sh"]
