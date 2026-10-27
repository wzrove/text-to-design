FROM node:24-alpine AS build
WORKDIR /app
RUN npm install --global pnpm@12.4.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/ packages/shared/
COPY packages/telemetry/ packages/telemetry/
RUN pnpm --filter text-to-design-telemetry... install --frozen-lockfile --ignore-scripts
RUN pnpm --filter text-to-design-telemetry build

FROM postgres:16-alpine
RUN apk add --no-cache nodejs bash su-exec
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY --from=build /app/packages/telemetry/package.json ./package.json
COPY --from=build /app/packages/telemetry/dist/ ./dist/
COPY --from=build /app/packages/telemetry/drizzle/ ./drizzle/
COPY --chmod=755 packages/telemetry/docker-entrypoint.sh /usr/local/bin/telemetry-entrypoint.sh
EXPOSE 8787
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=3 CMD pg_isready -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" && node --input-type=module -e 'const r = await fetch(`http://127.0.0.1:${process.env.PORT}/healthz`); process.exit(r.ok ? 0 : 1)'
ENTRYPOINT ["/usr/local/bin/telemetry-entrypoint.sh"]
