#!/usr/bin/env bash
# Lance un PostgreSQL local de développement (Postgres.app) sur le port 54329.
set -euo pipefail
PGBIN="${PGBIN:-/Applications/Postgres.app/Contents/Versions/latest/bin}"
DATA="$(cd "$(dirname "$0")/.." && pwd)/.pgdata"
PORT="${PGPORT:-54329}"
if [ ! -d "$DATA" ]; then
  "$PGBIN/initdb" -D "$DATA" -U vrboost --auth=trust -E UTF8 --locale=C >/dev/null
fi
if ! "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
  "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/server.log" start >/dev/null
  sleep 2
fi
for db in vrboost vrboost_test; do
  "$PGBIN/psql" -h localhost -p "$PORT" -U vrboost -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
    || "$PGBIN/createdb" -h localhost -p "$PORT" -U vrboost "$db"
done
echo "PostgreSQL prêt sur localhost:$PORT (bases vrboost, vrboost_test)"
