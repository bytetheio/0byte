# 0byte.sh — Hash Heist hosting

Public hosting for the **"Cracking the Code" / Hash Heist** CTF (DC256 × NAC-ISSA),
on the `0byte.sh` domain.

| Piece | Where | Tech | What it is |
|-------|-------|------|------------|
| **Class site + practice board** | `0byte.sh` | GitHub Pages (`docs/`) | Landing page, challenge ladder, solo-practice scoreboard |
| **Live leaderboard** | `board.0byte.sh` | Cloudflare Worker + KV (`cloudflare/board/`) | The shared, real-time board the whole room submits to |
| **Dillon's Cookie Shop (C9)** | `cookies.0byte.sh` | Cloudflare Worker (`cloudflare/cookies/`) | The Hydra HTTP-POST brute-force target |

The lab itself (the `crackstation` Docker toolbox) lives in a separate repo:
<https://github.com/bytetheio/crackstation>.

## Layout

```
docs/                     GitHub Pages site (Settings → Pages → branch main, /docs)
  index.html              landing page
  challenges.html         public challenge ladder (no answers)
  scoreboard.html         solo-practice board (localStorage; links to the live board)
  assets/                 brand images
  CNAME                   -> 0byte.sh
cloudflare/
  board/                  Worker: live leaderboard (port of ctf/server.py) + KV
  cookies/                Worker: Dillon's Cookie Shop (port of dilloncookieshop/app.py)
  _test.mjs               Node harness that verifies both Workers' logic
DEPLOY.md                 step-by-step deploy runbook (read this)
```

## Deploy

See **[`DEPLOY.md`](DEPLOY.md)** — it covers GitHub Pages + the apex domain, both
Cloudflare Workers (KV namespace, admin secret, custom domains), the DNS records, and
the one Cloudflare setting you must change so Hydra can hit the cookie shop.

> ⚖️ Lab only. Everything serves synthetic data. The cookie shop is an authorized,
> intentionally-weak class target. Keep it in the lab.
