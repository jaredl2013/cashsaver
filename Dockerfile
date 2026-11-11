# syntax=docker/dockerfile:1

# ---- Build stage: install everything, compile the designer, then drop dev deps ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Toolchain in case better-sqlite3 has no prebuilt binary for this platform.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- Runtime stage ----
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    CASH_SAVER_DATA_DIR=/data
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/server.js /app/db.js /app/files.js /app/session-store.js /app/auth.js /app/package.json ./
RUN mkdir -p /data && chown node:node /data
USER node
# data.sqlite (designs, flyers, products, uploads) lives here: mount a volume.
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
