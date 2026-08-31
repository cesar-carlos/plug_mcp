# syntax=docker/dockerfile:1
#
# Official node:*-alpine images vendor npm/yarn with CRITICAL/HIGH CVEs.
# Start from Alpine (clean), install the Node 24.19.0 musl binary from
# unofficial-builds, and ship only `node` in the runtime (no npm/npx/yarn).

ARG NODE_VERSION=24.19.0
# SHASUMS256 from https://unofficial-builds.nodejs.org/download/release/v24.19.0/
ARG NODE_MUSL_X64_SHA256=ebcb19941bf6a34ada2141727ffda66fb2a4bf315f5c02c8f1fc9e48a2045e06
ARG NODE_MUSL_ARM64_SHA256=d4249874f581a0a5b2e8b6881e8b13637898374e68ef2c15f82868a83787d94d

FROM alpine:3.24 AS node-base
ARG NODE_VERSION
ARG NODE_MUSL_X64_SHA256
ARG NODE_MUSL_ARM64_SHA256
RUN apk add --no-cache libstdc++ ca-certificates \
  && apk add --no-cache --virtual .fetch-deps curl \
  && alpineArch="$(apk --print-arch)" \
  && case "$alpineArch" in \
    x86_64) ARCH=x64 CHECKSUM="$NODE_MUSL_X64_SHA256" ;; \
    aarch64) ARCH=arm64 CHECKSUM="$NODE_MUSL_ARM64_SHA256" ;; \
    *) echo "unsupported arch: $alpineArch" >&2; exit 1 ;; \
  esac \
  && curl -4 --retry 5 --retry-all-errors --connect-timeout 20 -fsSL -o node.tar.xz \
    "https://unofficial-builds.nodejs.org/download/release/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${ARCH}-musl.tar.xz" \
  && echo "${CHECKSUM}  node.tar.xz" | sha256sum -c - \
  && tar -xJf node.tar.xz -C /usr/local --strip-components=1 --no-same-owner \
  && ln -sf /usr/local/bin/node /usr/local/bin/nodejs \
  && rm -f node.tar.xz \
  && apk del .fetch-deps \
  && node --version \
  && npm --version

FROM node-base AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node-base AS prod-deps
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM alpine:3.24 AS runtime
ARG GIT_SHA=unknown
WORKDIR /app
ENV NODE_ENV=production
ENV GIT_SHA=${GIT_SHA}
RUN apk add --no-cache libstdc++ ca-certificates \
  && addgroup -S mcp && adduser -S mcp -G mcp
COPY --from=node-base /usr/local/bin/node /usr/local/bin/node
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY docs/mcp/error-mapping.md ./docs/mcp/error-mapping.md
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && chown -R mcp:mcp /app
USER mcp
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3333/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
