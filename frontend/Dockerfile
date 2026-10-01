# Built from the repo root (docker build -f frontend/Dockerfile .), since the
# frontend imports the API's contract from src/.
FROM node:24-alpine AS builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
COPY src/modules/api/contract/ ../src/modules/api/contract/
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000

COPY --from=builder --chown=node:node /app/frontend/.next/standalone ./
COPY --from=builder --chown=node:node /app/frontend/.next/static ./.next/static

USER node
EXPOSE 3000
CMD ["node", "server.js"]
