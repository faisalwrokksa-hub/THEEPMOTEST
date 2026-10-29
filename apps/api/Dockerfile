# ── build ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
# pnpm refuses to remove node_modules without a TTY unless CI is set.
ENV CI=true
RUN corepack enable
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json        packages/db/
COPY apps/api/package.json           apps/api/
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps/api apps/api
# Read-only Phase 16D staging acceptance probes run inside the API container.
COPY scripts/phase16d-verify-staging-api.mjs scripts/phase16d-verify-staging-api.mjs
COPY scripts/rc1-release-gate.mjs scripts/rc1-release-gate.mjs
RUN pnpm --filter @pmo/contracts build \
 && pnpm --filter @pmo/db build \
 && pnpm --filter @pmo/api build
# `pnpm prune --prod` empties each workspace package's node_modules while
# leaving the store, so nothing resolves. Re-installing production-only
# dependencies rebuilds the links correctly instead.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# ── run ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
# Chromium is here to print PDFs, not to browse.
#
# Arabic in a PDF needs letters joined to their neighbours and mixed
# Arabic/Latin lines reordered by the bidirectional algorithm. No PDF library
# in the Node ecosystem does either, so the board pack is printed by a real
# browser — which means a real browser has to be in the image.
#
# Alpine's chromium package is used rather than the one Playwright downloads:
# it is built against musl, and `pnpm install --ignore-scripts` above skips
# Playwright's download step precisely so the two do not both ship.
#
# The Noto faces are the fallback floor. The pack loads Inter and IBM Plex
# Sans Arabic as webfonts, but if that fetch ever fails, a container with no
# fonts at all renders empty boxes instead of text.
RUN apk add --no-cache curl chromium fontconfig \
      font-noto font-noto-arabic ttf-freefont \
 && addgroup -S pmo && adduser -S pmo -G pmo
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
# Copy the whole tree in one layer. pnpm links packages into node_modules/.pnpm
# by relative symlink, so copying node_modules piecemeal leaves them dangling —
# which showed up as "Cannot find module 'reflect-metadata'".
COPY --from=build --chown=pmo:pmo /app /app
USER pmo
EXPOSE 4000
HEALTHCHECK --interval=20s --timeout=4s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/health || exit 1
CMD ["node", "apps/api/dist/main.js"]
