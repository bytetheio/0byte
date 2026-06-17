# Hash Heist — live leaderboard Worker

A Cloudflare Worker port of `ctf/server.py` (from the main repo). It serves the same
player/projector/admin pages and the same `/api/*` endpoints, but keeps the shared score
state in a **KV namespace** instead of `scores.json` — so it works as real internet hosting,
not just on a LAN laptop.

## Routes
| Route | Method | What |
|-------|--------|------|
| `/` | GET | player page — submit a flag, watch the board |
| `/projector` | GET | big-screen auto-refreshing board |
| `/admin` | GET | reset form (needs the `ADMIN_TOKEN` secret) |
| `/api/board` | GET | JSON leaderboard |
| `/api/submit` | POST | `{ name, flag }` → validates + scores |
| `/api/reset` | POST | `{ token }` → wipes the board |

## Bindings (see `wrangler.toml`)
- **KV `SCORES`** — the whole board under one key (`state`). Create with
  `wrangler kv namespace create SCORES`, paste the id into `wrangler.toml`.
- **secret `ADMIN_TOKEN`** — reset token. Set with `wrangler secret put ADMIN_TOKEN`
  (never commit it).

## Flags
Flags are validated server-side: only `sha256(flag)` digests live in the code (copied verbatim
from `server.py`), so players can't read answers from the page source. Challenge set and points
match `scoreboard.html` and the cookie-shop flag exactly (C1–C9, C1B, C2B).

## Deploy / test
```bash
npm install
npx wrangler dev        # local at http://localhost:8787
npx wrangler deploy     # -> board.0byte.sh
```
See `../../DEPLOY.md` for the full runbook.
