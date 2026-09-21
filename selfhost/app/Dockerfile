FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG EKKO_SITE_VERSION=local
ARG SUBCONVERTER_VERSION=v1.3.0
ENV NEXT_TELEMETRY_DISABLED=1 \
    EKKO_SITE_VERSION=$EKKO_SITE_VERSION \
    SUBCONVERTER_VERSION=$SUBCONVERTER_VERSION
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
# Carried into the runtime image so a published tag reports its own version
# instead of falling back to "local". This image answers for the site only:
# the rules are released on their own tag, and the engine image reports their
# version at runtime.
ARG EKKO_SITE_VERSION=local
ARG SUBCONVERTER_VERSION=v1.3.0
ENV EKKO_SITE_VERSION=$EKKO_SITE_VERSION \
    SUBCONVERTER_VERSION=$SUBCONVERTER_VERSION \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN useradd --system --uid 10001 --create-home --shell /usr/sbin/nologin nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
