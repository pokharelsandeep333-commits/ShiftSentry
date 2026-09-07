#!/usr/bin/env bash
#
# Runs the database test suites in supabase/tests against a throwaway Postgres.
#
# The business rules this project cares most about -- the earnings snapshot, the
# weekly caps, and every secrecy rule in the imposter game -- are enforced by
# triggers, policies and grants, not by TypeScript. `npm test` cannot reach any
# of that. This script can: it builds the schema the way production gets built,
# by applying every migration in order to an empty database, and then plays
# against it as the `authenticated` role.
#
# Everything runs inside one Docker container and talks to it with `docker exec`,
# rather than needing psql on the host or a CI service container. That is the
# only arrangement that behaves identically on a Windows workstation and an
# ubuntu-latest runner, and it keeps the whole thing to `docker` as a dependency.
#
# Usage:  npm run test:sql
#         KEEP_DB=1 npm run test:sql    # leave the container up to poke at it
set -euo pipefail

IMAGE="postgres:17-alpine"
CONTAINER="shiftsentry-sqltest-$$"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TESTS="$ROOT/supabase/tests"
HARNESS="$TESTS/harness"

cleanup() {
  if [ "${KEEP_DB:-}" = "1" ]; then
    echo ""
    echo "KEEP_DB=1 -- container '$CONTAINER' left running."
    echo "  docker exec -it $CONTAINER psql -U postgres -d app"
    echo "  docker rm -f $CONTAINER"
  else
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if ! docker info >/dev/null 2>&1; then
  echo "FAIL  Docker is not running. Start Docker Desktop and try again." >&2
  exit 1
fi

# Always over TCP, never the unix socket -- see the readiness loop below.
psql_run() {
  docker exec -i "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d app -q
}

echo "Starting $IMAGE ..."
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=app \
  -e PGPASSWORD=postgres \
  "$IMAGE" >/dev/null

# Readiness has to be checked over TCP, not over the unix socket.
#
# The official image runs a temporary server during initdb so it can execute its
# init scripts, then shuts that one down and starts the real one. The temporary
# server accepts unix-socket connections, so `pg_isready` with no -h reports
# ready during the init phase -- and the next statement then dies with "the
# database system is shutting down" as initdb finishes. It only surfaces on a
# cold pull, where the timing is slow enough to land in that window, which is
# why this passed locally and failed on the first CI run.
#
# That temporary server is started with `listen_addresses=''`, so a TCP check
# cannot reach it. Connecting to 127.0.0.1 succeeds only once the real server is
# up. The `select 1` is belt and braces: accepting a connection and being able to
# answer a query are not quite the same moment.
ready=0
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres -d app >/dev/null 2>&1 \
     && docker exec "$CONTAINER" psql -h 127.0.0.1 -U postgres -d app -tAc 'select 1' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "FAIL  Postgres did not become ready within 60s." >&2
  docker logs "$CONTAINER" 2>&1 | tail -20 >&2
  exit 1
fi

# Stand-ins for what the Supabase platform provides: the auth schema, the anon /
# authenticated / service_role roles, the default privileges those roles carry,
# and the realtime broadcast entry points. Without the default privileges in
# particular the migrations' `revoke all ...` statements would be no-ops here and
# the access-control tests would pass for the wrong reason.
psql_run < "$HARNESS/stubs.sql"
echo "  platform stubs applied"

applied=0
for migration in "$ROOT"/supabase/migrations/*.sql; do
  # -1 wraps each file in a transaction, the way the Supabase CLI applies them.
  # It is what catches "unsafe use of new value" when a migration adds an enum
  # value and uses it in the same file.
  if ! psql_run -1 < "$migration" 2>/tmp/sqltest-migration-error; then
    echo "FAIL  $(basename "$migration")" >&2
    sed -n '1,20p' /tmp/sqltest-migration-error >&2
    exit 1
  fi
  applied=$((applied + 1))
done
echo "  $applied migrations applied"

psql_run < "$HARNESS/seed.sql"
psql_run < "$HARNESS/helpers.sql"
echo "  fixtures loaded"
echo ""

failures=0
for suite in "$TESTS"/*.sql; do
  name="$(basename "$suite" .sql)"
  if output=$(psql_run < "$suite" 2>&1); then
    echo "PASS  $name"
    # Surface the suite's own narration, which names what was actually checked.
    echo "$output" | sed 's/^psql:[^ ]* NOTICE:  /      /;s/^NOTICE:  /      /' | grep -v '^\s*$' || true
  else
    echo "FAIL  $name" >&2
    echo "$output" | sed 's/^/      /' >&2
    failures=$((failures + 1))
  fi
  echo ""
done

if [ "$failures" -ne 0 ]; then
  echo "$failures suite(s) failed." >&2
  exit 1
fi

echo "All database suites passed."
