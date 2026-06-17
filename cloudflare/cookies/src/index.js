/**
 * Dillon's Cookie Shop — CTF web challenge (Cloudflare Worker port of
 * dilloncookieshop/app.py).  LAB ONLY · authorized class target.
 *
 * A deliberately weak staff login that teaches HTTP POST-form brute-forcing
 * (e.g. `hydra http-post-form`). Ported 1:1 from the stdlib Python app so the
 * challenge behaves identically when hosted on the public internet:
 *
 *   - login form POSTs to /login with fields  username / password
 *   - a WRONG login returns 200 + the exact failure marker "Invalid credentials"
 *   - a RIGHT login returns 200 + the recipe + flag, WITHOUT that marker
 *
 * Those three facts are what Hydra keys on, so do not change them.
 *
 *   username : dillon   (given to students)
 *   password : set as the PASSWORD Worker secret (also lives in the public
 *              cookie-wordlist so students can brute-force it — that's the challenge)
 *   flag     : set as the FLAG Worker secret (revealed only on a correct login)
 *   -> neither the password nor the flag is hardcoded in this source.
 *
 * ⚠️ Cloudflare note: brute-forcing trips bot/rate-limit protections. For class,
 * turn OFF Bot Fight Mode and add a WAF "skip" rule for cookies.0byte.sh, or
 * Hydra's requests get challenged and the failure-marker detection breaks.
 * See cloudflare/cookies/README.md.
 */
import { DILLON_JPG_B64 } from "./dillon.js";

const USERNAME = "dillon";
// PASSWORD and FLAG come from Worker secrets (env), so the C9 answer is NOT in
// public source. Set them once:  wrangler secret put PASSWORD ; wrangler secret put FLAG

const STYLE = `
  :root{
    --cream:#fff8ef; --dough:#f3e2c7; --cocoa:#5a3a22; --milk-choc:#7b4a2b;
    --dark-choc:#3e2415; --caramel:#c98a3c; --berry:#a8324a; --leaf:#5b7a4a;
  }
  *{box-sizing:border-box}
  body{
    margin:0; font-family:'Segoe UI',Verdana,sans-serif; color:var(--dark-choc);
    background:
      radial-gradient(circle at 20% 15%, rgba(201,138,60,.18) 0 12px, transparent 13px),
      radial-gradient(circle at 70% 40%, rgba(123,74,43,.16) 0 9px, transparent 10px),
      radial-gradient(circle at 85% 80%, rgba(201,138,60,.16) 0 14px, transparent 15px),
      radial-gradient(circle at 35% 75%, rgba(123,74,43,.14) 0 8px, transparent 9px),
      var(--cream);
  }
  .wrap{max-width:880px; margin:0 auto; padding:24px 20px 60px;}
  header.shop{text-align:center; padding:18px 0 8px;}
  header.shop h1{
    font-size:2.6rem; margin:.2rem 0; color:var(--milk-choc);
    text-shadow:1px 1px 0 var(--dough);
  }
  .tagline{font-style:italic; color:var(--caramel); margin:0 0 6px; font-size:1.1rem;}
  .owner{
    display:flex; gap:18px; align-items:center; justify-content:center;
    background:var(--dough); border:3px dashed var(--caramel); border-radius:18px;
    padding:14px 18px; margin:18px auto; max-width:560px;
  }
  .owner img{
    width:120px; height:120px; border-radius:50%; object-fit:cover;
    border:4px solid var(--milk-choc); box-shadow:0 4px 10px rgba(62,36,21,.3);
  }
  .owner p{margin:.2rem 0; text-align:left;}
  .card{
    background:#fffdf9; border:2px solid var(--dough); border-radius:16px;
    padding:20px 24px; margin:18px 0; box-shadow:0 6px 18px rgba(62,36,21,.10);
  }
  h2{color:var(--milk-choc); border-bottom:2px dotted var(--caramel); padding-bottom:6px;}
  .menu{display:flex; flex-wrap:wrap; gap:12px; list-style:none; padding:0;}
  .menu li{
    background:var(--dough); border-radius:12px; padding:10px 14px; flex:1 1 150px;
    text-align:center; font-weight:600;
  }
  .menu small{display:block; font-weight:400; color:var(--milk-choc);}
  form.login{max-width:340px; margin:0 auto;}
  label{display:block; margin:10px 0 4px; font-weight:600;}
  input[type=text],input[type=password]{
    width:100%; padding:10px 12px; border:2px solid var(--caramel);
    border-radius:10px; font-size:1rem; background:var(--cream);
  }
  button{
    margin-top:16px; width:100%; padding:12px; font-size:1.05rem; font-weight:700;
    color:#fff; background:var(--milk-choc); border:none; border-radius:10px;
    cursor:pointer;
  }
  button:hover{background:var(--cocoa);}
  .error{
    background:#fde8ea; border:2px solid var(--berry); color:var(--berry);
    padding:10px 14px; border-radius:10px; margin:14px auto; max-width:340px;
    text-align:center; font-weight:600;
  }
  .flag{
    display:block; background:var(--dark-choc); color:#ffe9b0; padding:16px;
    border-radius:12px; font-family:'Consolas',monospace; font-size:1.25rem;
    text-align:center; letter-spacing:1px; margin:18px 0; word-break:break-all;
  }
  .celebrate{
    text-align:center; font-size:1.3rem; color:var(--leaf); font-weight:700; margin:8px 0;
  }
  .recipe li{margin:6px 0;}
  footer{
    margin-top:34px; text-align:center; font-size:.85rem; color:var(--milk-choc);
  }
  .lab-banner{
    background:#fff3cd; border:2px solid var(--caramel); color:var(--cocoa);
    border-radius:10px; padding:8px 12px; display:inline-block; font-weight:700;
  }
  a.back{color:var(--milk-choc); font-weight:700;}
`;

const FOOTER = `
  <footer>
    <span class="lab-banner">LAB ONLY -- authorized class target</span>
    <p>Dillon's Cookie Shop &middot; DC256 x NAC-ISSA &middot; baked fresh for learning</p>
  </footer>
`;

function page(title, body) {
  return (
    "<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width, initial-scale=1'>" +
    `<title>${title}</title><style>${STYLE}</style></head>` +
    `<body><div class='wrap'>${body}${FOOTER}</div></body></html>`
  );
}

function landingPage(error = false) {
  let errHtml = "";
  if (error) {
    // IMPORTANT: this exact string is Hydra's failure marker. Do not change.
    errHtml = "<div class='error'>Invalid credentials</div>";
  }
  const body = `
      <header class="shop">
        <h1>&#127850; Dillon's Cookie Shop &#127850;</h1>
        <p class="tagline">"Warm cookies, warmer welcomes -- baked fresh daily!"</p>
      </header>

      <div class="owner">
        <img src="/dillon.jpg" alt="Dillon, the shop owner, smiling">
        <p>
          <strong>Meet Dillon</strong>, your friendly neighborhood baker.<br>
          Twenty years of dough, sprinkles &amp; secret recipes.<br>
          <em>"Every cookie is a little hug." &mdash; Dillon</em>
        </p>
      </div>

      <div class="card">
        <h2>Today's Menu</h2>
        <ul class="menu">
          <li>Chocolate Chip<small>$2.00</small></li>
          <li>Snickerdoodle<small>$2.25</small></li>
          <li>Oatmeal Raisin<small>$2.00</small></li>
          <li>Gingerbread<small>$2.50</small></li>
          <li>Macaron<small>$3.00</small></li>
          <li>Shortbread<small>$2.00</small></li>
        </ul>
      </div>

      <div class="card">
        <h2>&#128274; Staff Login</h2>
        <p style="text-align:center;color:var(--milk-choc)">
          Bakers only! Log in to view Dillon's <strong>Secret Cookie Recipe</strong>.
        </p>
        ${errHtml}
        <form class="login" method="POST" action="/login">
          <label for="username">Username</label>
          <input type="text" id="username" name="username" autocomplete="off" autofocus>
          <label for="password">Password</label>
          <input type="password" id="password" name="password" autocomplete="off">
          <button type="submit">Sign in to the kitchen</button>
        </form>
      </div>
    `;
  return page("Dillon's Cookie Shop", body);
}

function recipePage(flag) {
  // NOTE: must NOT contain the string "Invalid credentials" anywhere.
  const body = `
      <header class="shop">
        <h1>&#127881; Welcome to the Kitchen, Baker! &#127881;</h1>
        <p class="tagline">You're in. Mind the flour.</p>
      </header>

      <div class="owner">
        <img src="/dillon.jpg" alt="Dillon, the shop owner, smiling">
        <p>
          <strong>Dillon says:</strong><br>
          "You cracked the cookie jar &mdash; nicely done!<br>
          Here's the recipe I only share with real bakers."
        </p>
      </div>

      <p class="celebrate">&#127850; You unlocked Dillon's Secret Cookie Recipe! &#127850;</p>

      <div class="card recipe">
        <h2>Dillon's Secret Cookie Recipe <small>(shhh)</small></h2>
        <ol>
          <li>2&frac14; cups all-purpose flour</li>
          <li>1 cup softened butter (real butter, Dillon insists)</li>
          <li>&frac34; cup brown sugar + &frac34; cup white sugar</li>
          <li>2 eggs &amp; 1 tsp vanilla</li>
          <li>1 tsp baking soda, a pinch of salt</li>
          <li>2 cups chocolate chips <em>(plus one handful "for the chef")</em></li>
          <li>The secret ingredient: <strong>a wink and a little extra cinnamon</strong> &#128521;</li>
          <li>Bake at 375&deg;F for 10 minutes. Eat one warm. Tell no one.</li>
        </ol>
      </div>

      <div class="card">
        <h2>&#127988; Your Flag</h2>
        <p>Submit this to the class leaderboard:</p>
        <code class="flag">${flag}</code>
      </div>

      <p style="text-align:center"><a class="back" href="/">&larr; Back to the shop</a></p>
    `;
  return page("Secret Recipe -- Dillon's Cookie Shop", body);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const htmlResp = (body, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "GET") {
      if (path === "/" || path === "/index.html") return htmlResp(landingPage());
      if (path === "/dillon.jpg") {
        return new Response(base64ToBytes(DILLON_JPG_B64), {
          status: 200,
          headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" },
        });
      }
      if (path === "/recipe") return htmlResp(recipePage(env.FLAG)); // optional convenience route
      return htmlResp(
        page("Not Found", "<h2>404 -- crumbs not found</h2><p><a class='back' href='/'>Back to the shop</a></p>"),
        404
      );
    }

    if (request.method === "POST") {
      if (path !== "/login") return htmlResp(page("Not Found", "<h2>404 -- crumbs not found</h2>"), 404);
      const form = await request.formData();
      const username = String(form.get("username") || "").trim();
      const password = String(form.get("password") || "");
      if (username === USERNAME && password === env.PASSWORD) {
        // SUCCESS: serve the recipe + flag. Status 200, no failure marker.
        return htmlResp(recipePage(env.FLAG));
      }
      // FAILURE: status 200 body MUST contain "Invalid credentials".
      return htmlResp(landingPage(true));
    }

    return htmlResp(page("Not Found", "<h2>404 -- crumbs not found</h2>"), 404);
  },
};
