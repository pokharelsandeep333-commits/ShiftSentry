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

psql_run() {
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d app -q
}

echo "Starting $IMAGE ..."
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=app \
  "$IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d app >/dev/null 2>&1; then break; fi
  sleep 1
done
if ! docker exec "$CONTAINER" pg_isready -U postgres -d app >/dev/null 2>&1; then
  echo "FAIL  Postgres did not become ready." >&2
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
