#!/usr/bin/env bash
# pnpm pages — does every screen actually render, in both languages?
#
# Typechecking does not catch a page that throws at render: a variable that
# shadows the translate function is `any`, so `t('…')` compiles and then fails
# in the browser. This signs in, walks all 25 screens in English and Arabic,
# and reports anything that returned an error or a React error boundary.
set -uo pipefail

WEB=${WEB:-http://localhost:3000}
USER_ID=${SMOKE_USER:-fatima@al-nakheel.test}
PASS=${SMOKE_PASS:-pmoalign-dev}

PATHS=(/ /my-work /activity /portfolios /projects /board /planner /governance /raid /decisions
       /approvals /analytics /financials /benefits /resources /reports /reports/board-pack
       /documents /updates /stakeholders /studio /integrations /settings /platform /data /power-bi
       /notifications /ask)

jar=$(mktemp)
trap 'rm -f "$jar" /tmp/pages-body.html' EXIT

curl -s -c "$jar" -o /dev/null -X POST "$WEB/api/session" \
  -H "Origin: $WEB" -H "Sec-Fetch-Site: same-origin" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "identifier=$USER_ID" --data-urlencode "password=$PASS" --max-time 30
token=$(awk '/pmo_session/{print $7}' "$jar")
if [ -z "$token" ]; then
  echo "Could not sign in as $USER_ID — is the web app running, and has the database been seeded?" >&2
  exit 1
fi

fail=0
for lang in en ar; do
  printf "%s\n" "  $lang"
  for p in "${PATHS[@]}"; do
    code=$(curl -s -o /tmp/pages-body.html -w '%{http_code}' \
      -H "Cookie: pmo_session=$token; pmo_lang=$lang" "$WEB$p" --max-time 90)
    # Next embeds this attribute only when the render actually threw.
    msg=$(perl -0777 -ne 'print $1 if /data-next-error-message="([^"]{0,140})"/' /tmp/pages-body.html)
    if [ "$code" != "200" ] || [ -n "$msg" ]; then
      printf "    \033[31m✗\033[0m %-22s http=%s %s\n" "$p" "$code" "$msg"
      fail=1
    fi
  done
done

if [ "$fail" = 0 ]; then
  printf "  \033[32m✓\033[0m %d screens render in English and Arabic\n" "${#PATHS[@]}"
fi
exit $fail
