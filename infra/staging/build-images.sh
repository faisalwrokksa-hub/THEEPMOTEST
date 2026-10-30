#!/usr/bin/env bash
# Build revision-labelled local images; never deploy, push, migrate, or contact
# a remote host. Only run in an isolated clean checkout at the requested SHA.
set -euo pipefail
mode=${1:-}
if [[ $# -ne 1 || ( "$mode" != '--plan' && "$mode" != '--build' ) ]]; then
  echo 'Usage: EPMO_BUILD_SHA=<40hex> infra/staging/build-images.sh --plan|--build' >&2
  exit 2
fi
sha=${EPMO_BUILD_SHA:-}
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'BLOCKED: exact lowercase 40-character candidate SHA required' >&2
  exit 2
fi
api_image="epmo-staging-api:sha-$sha"
web_image="epmo-staging-web:sha-$sha"
if [[ "$mode" == '--plan' ]]; then
  printf 'PLAN ONLY: build local staging API image %s and web image %s\n' "$api_image" "$web_image"
  echo 'Requires clean isolated checkout at exact SHA; no push, deploy, or migration.'
  exit 0
fi
if [[ "${EPMO_STAGING_IMAGE_BUILD_CONFIRM:-}" != "BUILD_STAGING:$sha" ]]; then
  echo 'BLOCKED: explicit build confirmation for this exact SHA required' >&2
  exit 2
fi
command -v git >/dev/null || { echo 'BLOCKED: git required' >&2; exit 1; }
command -v docker >/dev/null || { echo 'BLOCKED: Docker required' >&2; exit 1; }
[[ "$(git rev-parse --verify HEAD)" == "$sha" ]] ||
  { echo 'BLOCKED: checkout HEAD differs from candidate SHA' >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] ||
  { echo 'BLOCKED: checkout is not clean' >&2; exit 1; }
[[ -f apps/api/Dockerfile && -f apps/web/Dockerfile ]] ||
  { echo 'BLOCKED: not at EPMO repository root' >&2; exit 1; }
# Never send .env.staging, ignored credentials, backups or untracked files
# to the Docker daemon. Build only from tracked files at this immutable SHA.
command -v tar >/dev/null || { echo 'BLOCKED: tar required' >&2; exit 1; }
context=$(mktemp -d)
cleanup() { [[ -n "${context:-}" && -d "$context" ]] && rm -rf -- "$context"; }
trap cleanup EXIT
git archive --format=tar "$sha" | tar -xf - -C "$context"
if find "$context" -type f \( -name '.env' -o -name '.env.staging' -o -name '.env.prod' \
  -o -name '*.key' -o -name '*.pem' -o -name '*.dump' \) | grep -q .; then
  echo 'BLOCKED: tracked secret-like file in immutable build context' >&2
  exit 1
fi
docker build --file "$context/apps/api/Dockerfile" --label "org.opencontainers.image.revision=$sha" --tag "$api_image" "$context"
docker build --file "$context/apps/web/Dockerfile" --label "org.opencontainers.image.revision=$sha" --tag "$web_image" "$context"
[[ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$api_image")" == "$sha" &&
   "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$web_image")" == "$sha" ]] ||
  { echo 'BLOCKED: built image revision label mismatch' >&2; exit 1; }
printf 'PASS: two local staging images built and revision-attested at %s; nothing deployed\n' "$sha"
