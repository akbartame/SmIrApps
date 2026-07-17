# --- deps: has the toolchain better-sqlite3 needs to build its native addon ---
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# --- runtime: no build toolchain, just node_modules + app code ---
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# DB_PATH / ARCHIVE_OUT_DIR default to ./data and ./archive (see config/index.js);
# docker-compose.yml overrides these to /app/data and /app/archive explicitly
# and mounts named volumes there.
RUN mkdir -p data archive \
    && addgroup --system app && adduser --system --ingroup app app \
    && chown -R app:app /app
USER app

EXPOSE 3000
CMD ["node", "index.js"]
