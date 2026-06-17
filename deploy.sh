#!/usr/bin/env bash
# One-shot deploy for the Cloudflare side of 0byte.sh (board + cookies Workers).
#
# Prereqs: Node 18+ and wrangler, and a Cloudflare login.
#   npm install -g wrangler
#   wrangler login                 # opens a browser; no token pasting needed
#
# Then from the repo root:
#   bash deploy.sh
#
# It will: create the SCORES KV namespace (if missing), wire its id into
# cloudflare/board/wrangler.toml, set a random ADMIN_TOKEN secret, and deploy
# BOTH Workers to board.0byte.sh and cookies.0byte.sh.
set -euo pipefail
cd "$(dirname "$0")"

command -v wrangler >/dev/null || { echo "wrangler not found. Run: npm install -g wrangler && wrangler login"; exit 1; }

echo "==> Creating/looking up the SCORES KV namespace…"
# Create returns the id; if it already exists, pull it from `kv namespace list`.
KV_ID=$(wrangler kv namespace create SCORES 2>/dev/null | grep -oE '[0-9a-f]{32}' | head -1 || true)
if [ -z "${KV_ID:-}" ]; then
  KV_ID=$(wrangler kv namespace list 2>/dev/null | grep -B2 -iE '"title":\s*".*SCORES"' | grep -oE '[0-9a-f]{32}' | head -1 || true)
fi
[ -n "${KV_ID:-}" ] || { echo "Could not determine KV namespace id. Create it manually: wrangler kv namespace create SCORES, then paste the id into cloudflare/board/wrangler.toml"; exit 1; }
echo "    KV id: $KV_ID"

echo "==> Wiring the KV id into cloudflare/board/wrangler.toml…"
sed -i.bak -E "s/PASTE_KV_NAMESPACE_ID_HERE|id = \"[0-9a-f]{32}\"/id = \"$KV_ID\"/" cloudflare/board/wrangler.toml
rm -f cloudflare/board/wrangler.toml.bak

echo "==> Setting a random ADMIN_TOKEN secret for the board…"
ADMIN_TOKEN=$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n')
( cd cloudflare/board && printf '%s' "$ADMIN_TOKEN" | wrangler secret put ADMIN_TOKEN )
echo "    >>> Your board /admin token is: $ADMIN_TOKEN   (save this; use it at https://board.0byte.sh/admin)"

echo "==> Deploying the leaderboard Worker -> board.0byte.sh…"
( cd cloudflare/board && wrangler deploy )

echo "==> Cookie-shop secrets (PASSWORD + FLAG) — kept out of the public repo…"
cd cloudflare/cookies
if [ -n "${COOKIE_PASSWORD:-}" ] && [ -n "${COOKIE_FLAG:-}" ]; then
  printf '%s' "$COOKIE_PASSWORD" | wrangler secret put PASSWORD
  printf '%s' "$COOKIE_FLAG"     | wrangler secret put FLAG
else
  echo "    Set COOKIE_PASSWORD and COOKIE_FLAG env vars to auto-set them, or run now:"
  echo "      wrangler secret put PASSWORD   (the cookie password; see ctf/ANSWER-KEY.md)"
  echo "      wrangler secret put FLAG       (DC256{...})"
  wrangler secret put PASSWORD
  wrangler secret put FLAG
fi
echo "==> Deploying the cookie-shop Worker -> cookies.0byte.sh…"
wrangler deploy
cd ../..

cat <<DONE

============================================================
 Done. Both Workers are live (custom domains auto-created):
   https://board.0byte.sh/         (player page)
   https://board.0byte.sh/projector
   https://board.0byte.sh/admin    (token above)
   https://cookies.0byte.sh/

 Still to do by hand (need the Cloudflare dashboard):
   1) cookies.0byte.sh: Security -> Bots -> Bot Fight Mode = OFF, and add a
      WAF custom rule: If hostname = cookies.0byte.sh -> Skip (Bot Fight Mode,
      Rate Limiting, Managed Rules). Otherwise Hydra gets challenged.
   2) Commit the real KV id: git add cloudflare/board/wrangler.toml && git commit
      -m "wire SCORES KV id" && git push
   3) Apex site (0byte.sh): enable GitHub Pages (Settings -> Pages -> main /docs)
      and add these A records in Cloudflare DNS for @ (proxied is fine):
        185.199.108.153  185.199.109.153  185.199.110.153  185.199.111.153
============================================================
DONE
