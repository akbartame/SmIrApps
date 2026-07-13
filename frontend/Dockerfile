# ── Frontend: Multi-mode Dockerfile ───────────────────
ARG BUILD_MODE=prod

# ── Development stage ──────────────────────────────────
FROM node:24.5.0-alpine AS dev

WORKDIR /app/frontend

COPY package*.json ./
RUN npm ci

COPY . ./

ENV VITE_HOST=0.0.0.0

EXPOSE 5173

CMD ["npm", "run", "dev"]

# ── Production build stage ─────────────────────────────
FROM node:24.5.0-alpine AS builder

WORKDIR /app/frontend

COPY package*.json ./
RUN npm ci

COPY . ./

RUN npm run build

# ── Production runtime with nginx ──────────────────────
FROM nginx:1.27.0-alpine AS prod

# Create unprivileged nginx user (nginx runs as root by default)
RUN addgroup -S nginx && adduser -S nginx -G nginx

# Copy nginx config with gzip and caching
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built frontend from builder stage
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Fix permissions for nginx user
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chmod -R 755 /usr/share/nginx/html

USER nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

# ── Final stage: select based on BUILD_MODE ───────────
FROM ${BUILD_MODE}