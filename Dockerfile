FROM node:22-alpine AS builder
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx tsc

FROM node:22-alpine
WORKDIR /usr/src/app

RUN apk add --no-cache curl python3 && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /usr/src/app/dist ./dist
# Dev seed fixtures: tsc does not emit .json, and `make db-fresh` seeds from
# the compiled entrypoint in a throwaway migrator container.
COPY --from=builder /usr/src/app/src/db/fixtures ./dist/src/db/fixtures

COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh
CMD ["sh", "./entrypoint.sh"]