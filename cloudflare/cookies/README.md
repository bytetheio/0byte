# Dillon's Cookie Shop (C9) — Worker

A Cloudflare Worker port of `dilloncookieshop/app.py`. It behaves identically to the Python
app so the Hydra challenge works unchanged when hosted on the public internet:

- the login form **POSTs to `/login`** with fields `username` / `password`,
- a **wrong** login returns `200` + the exact failure marker **`Invalid credentials`**,
- a **right** login (username `dillon` + the secret password) returns `200` + the recipe + the
  flag, **without** that marker.

Those three facts are Hydra's contract — don't change them. `dillon.jpg` is embedded
(base64, in `src/dillon.js`) so the Worker is self-contained and serves `/dillon.jpg`.

The **password and flag are Worker secrets** (`env.PASSWORD` / `env.FLAG`), not hardcoded here, so
the C9 answer isn't sitting in this public repo. The username is `dillon` (given to students); the
password is whatever you set as the `PASSWORD` secret (and is also in the public `cookie-wordlist.txt`
so students can brute-force it). The plaintext values live only in the **instructor answer key**
(`ctf/ANSWER-KEY.md`, not in this repo). Set them with:

```
wrangler secret put PASSWORD     # the cookie-themed password (also in cookie-wordlist.txt)
wrangler secret put FLAG         # DC256{...}
```

## ⚠️ Cloudflare protections
Brute-forcing trips Bot Fight Mode / rate limiting. Before the class, on the `0byte.sh` zone:
turn **Bot Fight Mode OFF** and add a **WAF Skip** rule for `Hostname equals cookies.0byte.sh`
(skip Bot Fight Mode, Rate Limiting, Managed Rules). Otherwise Hydra's requests get challenged
and the failure-marker detection breaks. Details in `../../DEPLOY.md`.

## Deploy / test
```bash
npm install
npx wrangler dev        # local at http://localhost:8787
npx wrangler deploy     # -> cookies.0byte.sh
```

Attack it from the lab (the internet-enabled toolbox):
```bash
docker compose run --rm crackstation-web
hydra -l dillon -P /lab/wordlists/cookie-wordlist.txt cookies.0byte.sh -s 443 \
  https-post-form "/login:username=^USER^&password=^PASS^:F=Invalid credentials"
```
