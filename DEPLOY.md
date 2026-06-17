# Deploy runbook — 0byte.sh

Three things to stand up. Do them in any order; ~20 minutes total. You'll need:
- the `0byte.sh` zone on your **Cloudflare** account (you have this),
- **Node 18+** and **Wrangler** for the Workers: `npm install -g wrangler` then `wrangler login`,
- push access to **github.com/bytetheio/0byte** (this repo).

---

## 1. GitHub Pages — the class site at `https://0byte.sh`

The site is in `docs/` and already includes a `CNAME` file (`0byte.sh`).

1. Push this repo to `main` (see "Pushing" at the bottom).
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   pick **`main`** and folder **`/docs`**. Save.
3. **DNS (Cloudflare dashboard → DNS → Records):** point the apex at GitHub Pages.
   Add these **A** records for `0byte.sh` (name `@`), proxied (orange cloud) is fine:
   ```
   185.199.108.153
   185.199.109.153
   185.199.110.153
   185.199.111.153
   ```
   (GitHub also accepts a single `AAAA`/`ALIAS`; the four A records are the documented set.)
4. Back on **Settings → Pages**, set **Custom domain = `0byte.sh`** and tick **Enforce HTTPS**
   once the cert issues (a few minutes).

Verify: <https://0byte.sh> shows the landing page; `/scoreboard.html` and `/challenges.html` load.

> Heads-up: `0byte.sh` apex is GitHub Pages; `board.` and `cookies.` are Cloudflare Workers
> (next steps). They're independent hostnames, so they don't collide.

---

## 2. Live leaderboard — `https://board.0byte.sh` (Worker + KV)

```bash
cd cloudflare/board
npm install                       # pulls wrangler locally (or use your global one)

# a) create the KV namespace, then paste the printed id into wrangler.toml (kv_namespaces.id)
npx wrangler kv namespace create SCORES

# b) set the admin reset token (used by /admin) — pick a strong value
npx wrangler secret put ADMIN_TOKEN

# c) deploy (creates the board.0byte.sh custom domain + DNS automatically)
npx wrangler deploy
```

Verify:
- <https://board.0byte.sh/> — player page (submit a flag, see the board)
- <https://board.0byte.sh/projector> — big-screen view for the room
- <https://board.0byte.sh/admin> — paste your `ADMIN_TOKEN` to reset between sessions

The board already knows all 11 challenges (C1–C9, C1B, C2B) and validates flags server-side
(only SHA-256 digests are in the code — answers aren't in the page source). State lives in the
`SCORES` KV namespace, so restarts/redeploys keep the board.

---

## 3. Dillon's Cookie Shop (C9) — `https://cookies.0byte.sh` (Worker)

```bash
cd cloudflare/cookies
npm install
# The C9 password + flag are Worker secrets (kept out of this public repo).
# Set them from the instructor answer key (ctf/ANSWER-KEY.md):
npx wrangler secret put PASSWORD   # the cookie-themed password (also in cookie-wordlist.txt)
npx wrangler secret put FLAG       # DC256{...}
npx wrangler deploy                # creates the cookies.0byte.sh custom domain + DNS
```

Verify: <https://cookies.0byte.sh/> shows the bakery; a wrong staff login returns
"Invalid credentials"; logging in as `dillon` + the correct password reveals the recipe + flag.

### ⚠️ Required Cloudflare setting (or Hydra breaks)

The cookie shop is *meant* to be brute-forced. Cloudflare's bot/rate-limit protections will
otherwise challenge Hydra's rapid POSTs and corrupt the failure-marker detection. On the
`0byte.sh` zone:

1. **Security → Bots → Bot Fight Mode → OFF** (at least while running the class), and
2. add a **WAF custom rule** that **Skips** remaining security for the shop, e.g.
   - **If** `Hostname equals cookies.0byte.sh`
   - **Then** *Skip* → Bot Fight Mode, Rate Limiting, Managed Rules.

(Optional: also disable "Browser Integrity Check" for that hostname.) Turn protections back
on after the event if you like — the shop is harmless either way (synthetic, single fake user).

Then the live attack from the lab is:
```bash
docker compose run --rm crackstation          # in the crackstation repo
hydra -l dillon -P /lab/wordlists/cookie-wordlist.txt cookies.0byte.sh -s 443 \
  https-post-form "/login:username=^USER^&password=^PASS^:F=Invalid credentials"
```

---

## Local testing without deploying

```bash
# Run either Worker locally (http://localhost:8787):
cd cloudflare/board   && npx wrangler dev     # board (KV is mocked locally by wrangler)
cd cloudflare/cookies && npx wrangler dev     # cookie shop

# Verify the ported logic matches the Python originals (Node 18+):
cd cloudflare && node _test.mjs               # 28 checks: scoring, flags, failure marker, image
```

---

## Pushing this repo

```bash
cd /path/to/0byte
git add -A
git commit -m "Add 0byte.sh hosting: Pages site + board & cookies Workers"
git push origin main
```

(If `git push` asks for credentials, use a GitHub Personal Access Token, or `gh auth login`
if you have the GitHub CLI.)

---

## What changed in the lab repo (bytetheio/crackstation)

So the lab can reach the internet-hosted shop (C9), the `crackstation` service runs on a normal
(non-`internal`) bridge network with internet egress, and still reaches `vuln-login` for C6.
`wordlists/cookie-wordlist.txt` was added for the C9 Hydra attack. Everything the challenges use
is local synthetic data. The GitHub Action rebuilds/publishes the image on push to `main`.
