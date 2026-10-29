FROM node:22-alpine AS build
WORKDIR /app
# pnpm refuses to remove node_modules without a TTY unless CI is set.
ENV CI=true
RUN corepack enable
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json        packages/db/
COPY apps/web/package.json           apps/web/
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_DIST_DIR=.next-prod
RUN pnpm --filter @pmo/contracts build && pnpm --filter @pmo/web build

FROM node:22-alpine AS run
WORKDIR /app
# Docker sets HOSTNAME to the container id, and the Next standalone server
# binds to it — so 127.0.0.1 inside the container refuses, and the
# healthcheck reports unhealthy while the site is actually serving.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN apk add --no-cache curl && addgroup -S pmo && adduser -S pmo -G pmo
COPY --from=build --chown=pmo:pmo /app/apps/web/.next-prod/standalone ./
COPY --from=build --chown=pmo:pmo /app/apps/web/.next-prod/static ./apps/web/.next-prod/static
COPY --from=build --chown=pmo:pmo /app/apps/web/public ./apps/web/public
USER pmo
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=4s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/login || exit 1
CMD ["node", "apps/web/server.js"]
