#!/usr/bin/env bash
# Fail closed: no registry, no push, no DB/Stripe secrets. Run after both images
# were built from the current source in the disposable GitHub CI runner.
set -euo pipefail

for spec in 'epmo-api:ci|/app/apps/api/dist/main.js|4000/tcp' \
            'epmo-web:ci|/app/apps/web/server.js|3000/tcp'; do
  IFS='|' read -r image entrypoint port <<< "$spec"

  # Image inspection never executes application code, and verifies the build
  # produced actual image content and a non-root final user.
  user="$(docker image inspect --format '{{.Config.User}}' "$image")"
  [[ "$user" == 'pmo' ]] || { echo "BLOCKED: $image does not use pmo runtime account"; exit 1; }
  check="$(docker image inspect --format '{{json .Config.Healthcheck.Test}}' "$image")"
  [[ "$check" != 'null' && -n "$check" ]] || { echo "BLOCKED: missing healthcheck in $image"; exit 1; }
  exposed="$(docker image inspect --format '{{json .Config.ExposedPorts}}' "$image")"
  [[ "$exposed" == *"$port"* ]] || { echo "BLOCKED: missing expected port in $image"; exit 1; }

  # Execute only a shell and check the contents, never start API/web services.
  # This catches broken multi-stage COPY paths and unexpectedly rooted images.
  docker run --rm --network none --read-only --entrypoint sh "$image" \
    -c 'test "$(id -u)" -ne 0 && test -s "$1"' -- "$entrypoint"
  echo "PASS $image: non-root, healthcheck, expected port, deployable entrypoint"
done
