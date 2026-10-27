#!/usr/bin/env bash
set -Eeuo pipefail

export POSTGRES_USER="${POSTGRES_USER:-postgres}"
export POSTGRES_DB="${POSTGRES_DB:-$POSTGRES_USER}"
export PORT="${PORT:-8787}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${TELEMETRY_API_KEY:?TELEMETRY_API_KEY is required}"

pids=()
cleanup() {
  trap - EXIT INT TERM
  if ((${#pids[@]})); then
    kill -TERM "${pids[@]}" 2>/dev/null || true
    wait "${pids[@]}" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

/usr/local/bin/docker-entrypoint.sh postgres &
pg_pid=$!
pids+=("$pg_pid")
ready=false
for ((attempt = 0; attempt < 120; attempt++)); do
  if ! kill -0 "$pg_pid" 2>/dev/null; then
    wait "$pg_pid" || exit $?
    exit 1
  fi
  if pg_isready -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo "PostgreSQL startup timed out" >&2
  exit 1
fi

export DATABASE_URL
DATABASE_URL=$(node --input-type=module -e 'const e = process.env; console.log(`postgresql://${encodeURIComponent(e.POSTGRES_USER)}:${encodeURIComponent(e.POSTGRES_PASSWORD)}@127.0.0.1:5432/${encodeURIComponent(e.POSTGRES_DB)}`)')
su-exec postgres node /app/dist/migrate.js &
migrate_pid=$!
pids+=("$migrate_pid")
wait "$migrate_pid"
pids=("$pg_pid")

su-exec postgres node /app/dist/serve.js &
pids+=("$!")
wait -n "${pids[@]}" || exit $?
exit 1
