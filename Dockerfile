# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
# No ENTSO-E token at build time: VITE_ENTSOE_BIDDING_ZONE has a safe default
# (Spain) and MarketDataService falls back to mock prices if /entsoe-api is
# unreachable - which is always the case in this static image, since the
# ENTSO-E proxy is a Vite dev-server-only feature (see vite.config.ts).
# VITE_USE_KE routes market data through the KE bridge (served at /bridge by
# nginx in the KE stack); defaults to false for the standalone image.
ARG VITE_USE_KE=false
ARG VITE_KE_BRIDGE_URL=/bridge
ENV VITE_USE_KE=$VITE_USE_KE
ENV VITE_KE_BRIDGE_URL=$VITE_KE_BRIDGE_URL
RUN npm run build

# --- Serve stage ---
FROM nginx:1.27-alpine AS serve
# Default image ships the plain config; the KE stack passes NGINX_CONF=nginx.ke.conf
# to add the /bridge -> ke-bridge reverse proxy.
ARG NGINX_CONF=nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ || exit 1
