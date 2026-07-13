# ── Backend: Multi-mode Dockerfile ────────────────────
ARG BUILD_MODE=prod

# ── Production build stage ────────────────────────────
FROM node:24.5.0-alpine AS prod-builder

RUN apk add --no-cache python3 make g++

WORKDIR /app/backend

COPY package*.json ./
RUN npm ci

COPY . ./

# ── Production runtime stage ──────────────────────────
FROM node:24.5.0-alpine AS prod

WORKDIR /app/backend

# Install wget for health checks
RUN apk add --no-cache wget && \
    adduser -D -h /home/appuser appuser && \
    mkdir -p /app/backend/data && \
    chown appuser:appuser /app/backend/data

COPY --from=prod-builder --chown=appuser:appuser /app/backend/node_modules ./node_modules
COPY --from=prod-builder --chown=appuser:appuser /app/backend/src          ./src
COPY --from=prod-builder --chown=appuser:appuser /app/backend/index.js     ./index.js
COPY --from=prod-builder --chown=appuser:appuser /app/backend/package.json ./package.json

ENV NODE_ENV=production

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "index.js"]

# ── Development stage ──────────────────────────────────
FROM node:24.5.0-alpine AS dev

RUN apk add --no-cache python3 make g++

WORKDIR /app/backend

RUN adduser -D -h /home/appuser appuser && \
    mkdir -p /app/backend/data && \
    chown appuser:appuser /app/backend/data

COPY package*.json ./
RUN npm ci

COPY . ./
RUN chown -R appuser:appuser /app/backend

ENV NODE_ENV=development

USER appuser

EXPOSE 3000

CMD ["npm", "run", "dev"]

# ── Final stage: select based on BUILD_MODE ───────────
FROM ${BUILD_MODE}