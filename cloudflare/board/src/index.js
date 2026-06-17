/**
 * Hash Heist — live leaderboard (Cloudflare Worker port of ctf/server.py).
 *
 * Why this exists: GitHub Pages is static-only and can't keep shared score state.
 * This Worker keeps ONE shared board for the whole internet, backed by a KV
 * namespace. Flags are validated server-side (only their SHA-256 hashes live in
 * the code), so players can't read answers from page source — same guarantee as
 * the original Python server.
 *
 * Routes (identical to server.py):
 *   GET  /            player page (submit a flag + see the board)
 *   GET  /projector   big-screen auto-refreshing board
 *   GET  /admin       reset form (needs the ADMIN_TOKEN secret)
 *   GET  /api/board   JSON leaderboard
 *   POST /api/submit  { name, flag } -> validates + scores
 *   POST /api/reset   { token }      -> wipes the board
 *
 * Bindings (see wrangler.toml):
 *   KV  SCORES        stores the whole board under the single key "state"
 *   var ADMIN_TOKEN   reset token (set as a secret: `wrangler secret put ADMIN_TOKEN`)
 */

// challenge id -> [points, display name]  (must match scoreboard.html + cookies worker)
const CHALLENGES = {
  C1:  [50,  "First Blood"],
  C1B: [25,  "Hidden in Plain Sight"],
  C2:  [50,  "Old Faithful"],
  C2B: [75,  "Cindy's Clever Trick"],
  C3:  [100, "Season's Greetings"],
  C4:  [150, "No Dictionary Here"],
  C5:  [200, "Insider Knowledge"],
  C6:  [150, "Front Door"],
  C7:  [250, "Slow Burn"],
  C8:  [250, "Windows Pivot"],
  C9:  [200, "Dillon's Cookie Shop"],
};

// sha256(flag) -> challenge id  (flags are DC256{...}; hashes only, never plaintext)
const FLAG_HASHES = {
  "b77e93d3c50db5e0328170e5490f9ca37b8f0a7bf7869060437f0c6bfd899961": "C1",
  "7ad35dabe7ed3df31345ac3a3965ec302c2f367fb00bcbf5bdd717ff439cdcc3": "C1B",
  "aeb57d3585eba135615416c73be5965eed791626e3086396e2da5748c06ab7ce": "C2",
  "e0766e69f796dada7c859547b3f6fce51e95a3a039102baadb0e7adda886f3c1": "C2B",
  "7c399edfa85293b2b3e33f6f90426873bc842f2b28fda7f5ba4cfd7caac91572": "C3",
  "bf7dc89dc342db86db91cfb902edf00970f0ce8cecf997980f3635b793333b01": "C4",
  "0227018c2a6b87d1ccb8a2a6558db980c8be226accb6a55382e8cde175c00fcb": "C5",
  "4d6f62209b91179755e5f960e1f7216bbd41620e5a386e81878842f25428feca": "C6",
  "fdfe1d8fefd0e7159bef0ee32a61160b9e8d46c01fe3fe00bea6e56742ec17fc": "C7",
  "6ab9ed15b7eb1786f15be84d27ea0fd2f522ba2ba2f8865b7396372772b77c03": "C8",
  "887f615d6e1253b8f76dd86b588191289e5ed9b17ae615a6cb97b80b10f07be8": "C9",
};

const STATE_KEY = "state";

async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function score(solved) {
  return solved.reduce((s, c) => s + (CHALLENGES[c] ? CHALLENGES[c][0] : 0), 0);
}

async function loadState(env) {
  return (await env.SCORES.get(STATE_KEY, "json")) || {};
}
async function saveState(env, d) {
  await env.SCORES.put(STATE_KEY, JSON.stringify(d));
}

async function board(env) {
  const d = await loadState(env);
  const rows = Object.entries(d).map(([name, v]) => ({
    name,
    points: score(v.solved || []),
    solved: (v.solved || []).slice().sort(),
  }));
  rows.sort((a, b) => b.points - a.points || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return rows;
}

const CSS = `
:root{--green:#5FE085;--greenbr:#7CFFA0;--teal:#31A7CC;--gold:#E0A93B;
--ink:#0B0E14;--panel:#161B26;--cloud:#F4F7FB;--danger:#E5484D;--muted:#9AA4B8;}
*{box-sizing:border-box}body{margin:0;background:var(--ink);color:var(--cloud);
font-family:Inter,Segoe UI,system-ui,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:1.2rem}
h1{margin:.2rem 0;font-size:1.5rem}.accent{color:var(--green)}
.brand{color:var(--muted);font-size:.85rem;margin-bottom:1rem}
.card{background:var(--panel);border:1px solid #232a3a;border-radius:12px;padding:1.1rem;margin-bottom:1rem}
label{display:block;font-size:.8rem;color:var(--muted);margin:.5rem 0 .25rem}
input{width:100%;padding:.7rem;border-radius:8px;border:1px solid #2c3548;background:#0d111a;color:var(--cloud);font-size:1.05rem}
button{margin-top:1rem;padding:.7rem 1.3rem;border:none;border-radius:8px;background:var(--green);color:#04210f;font-weight:700;font-size:1.05rem;cursor:pointer}
.msg{margin-top:.8rem;font-weight:600;min-height:1.3rem}.ok{color:var(--greenbr)}.err{color:var(--danger)}.info{color:var(--gold)}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.55rem .6rem;border-bottom:1px solid #232a3a}
th{color:var(--muted);font-size:.75rem;text-transform:uppercase;letter-spacing:.5px}
td.pts{font-weight:700;color:var(--green);text-align:right}.rank{color:var(--gold);font-weight:700}
.pill{display:inline-block;font-size:.7rem;padding:.05rem .45rem;border-radius:999px;border:1px solid var(--green);color:var(--green);margin-right:.2rem}
footer{color:var(--muted);font-size:.75rem;text-align:center;padding:1rem}
details{background:#0d111a;border:1px solid #232a3a;border-radius:8px;padding:.4rem .7rem;margin:.55rem 0}
summary{cursor:pointer;color:var(--teal);font-weight:700;font-size:.92rem;padding:.25rem 0}
summary:hover{color:var(--green)}
code{background:#0d111a;border:1px solid #2c3548;border-radius:5px;padding:1px 5px;font-family:Consolas,Menlo,monospace;color:var(--greenbr);font-size:.82em}
.hint{font-size:.76rem;color:var(--muted);margin:.45rem 0 .2rem}
.ref{display:block;overflow-x:auto;margin:.3rem 0}
.ref td{font-size:.8rem;padding:.35rem .55rem;border-bottom:1px solid #1c2230;white-space:nowrap}
.ref td.k{color:var(--cloud)}.ref td.t{color:var(--gold);font-weight:700}
.ref td.c{color:var(--greenbr);font-family:Consolas,monospace;font-size:.78rem}
.ref td.p{color:var(--muted);text-align:right}
`;

const PLAYER_PAGE = `<!doctype html><html><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>Hash Heist — submit a flag</title><style>${CSS}</style></head><body><div class=wrap>
<h1><span class=accent>#</span> Hash Heist</h1><div class=brand>DC256 × NAC-ISSA · live leaderboard · 0byte.sh</div>
<div class=card>
 <label>Your name / team</label><input id=player autocomplete=off placeholder="e.g. team-redstone">
 <label>Flag</label><input id=flag autocomplete=off placeholder="DC256{...}">
 <button onclick=submit()>Submit flag</button>
 <div id=msg class=msg></div>
</div>
<div class=card><h1 style="font-size:1.1rem">Reference</h1>
 <p class=hint>Enter the lab (run from the <code>crackstation</code> folder): <code>docker compose run --rm crackstation</code> &rarr; you land in <code>/work</code>. First time? <code>docker compose pull</code> first.</p>
 <details open>
  <summary>&#128203; Cheat sheet — spot the hash &rarr; tool &amp; mode</summary>
  <p class=hint>Identify first: <code>hashid &lt;file&gt;</code> &nbsp;or&nbsp; <code>nth -t "$(cat &lt;file&gt;)"</code></p>
  <table class=ref><tbody>
   <tr><td class=k>32 hex chars</td><td class=t>MD5</td><td class=c>hashcat -m 0 &middot; john --format=raw-md5</td></tr>
   <tr><td class=k>40 hex chars</td><td class=t>SHA-1</td><td class=c>hashcat -m 100 &middot; john --format=raw-sha1</td></tr>
   <tr><td class=k>64 hex chars</td><td class=t>SHA-256</td><td class=c>hashcat -m 1400 &middot; john --format=raw-sha256</td></tr>
   <tr><td class=k>32 hex (Windows)</td><td class=t>NTLM</td><td class=c>hashcat -m 1000 &middot; john --format=nt</td></tr>
   <tr><td class=k>starts $2b$</td><td class=t>bcrypt</td><td class=c>hashcat -m 3200 &middot; john --format=bcrypt</td></tr>
   <tr><td class=k>letters/digits + / ends ==</td><td class=t>Base64</td><td class=c>base64 -d&nbsp;&nbsp;(decode &mdash; not a hash!)</td></tr>
   <tr><td class=k>a live login prompt</td><td class=t>SSH / web</td><td class=c>hydra&nbsp;&nbsp;(online guessing)</td></tr>
  </tbody></table>
  <p class=hint>Modes: <code>-a 0</code> dict &middot; <code>-a 3</code> mask &middot; <code>-a 6</code> hybrid &middot; <code>-r</code> rules &middot; add <code>--show</code> to print cracked</p>
 </details>
 <details>
  <summary>&#127919; Challenge targets &amp; where files live (hashes, wordlists, $ROCKYOU)</summary>
  <p class=hint><b>Hash files:</b> <code>/lab/sample-hashes/</code> &nbsp;&middot;&nbsp; <b>Wordlists:</b> <code>$ROCKYOU</code> (= <code>/usr/share/wordlists/rockyou.txt</code>), bundled lists in <code>/lab/wordlists/</code>, SecLists in <code>/usr/share/seclists/</code></p>
  <p class=hint><b>Rules:</b> <code>/lab/rules/class.rule</code> &nbsp;&middot;&nbsp; <b>CeWL page (C5) — auto-served:</b> <code>http://127.0.0.1:8000/intranet.html</code> &nbsp;&middot;&nbsp; <b>Your cracked output:</b> <code>/work</code></p>
  <p class=hint>&#128161; <b>Shortcut:</b> <code>$ROCKYOU</code> is preset to the rockyou path — use it directly, e.g. <code>john -w $ROCKYOU &lt;hashfile&gt;</code> or <code>hashcat -m 0 -a 0 &lt;hashfile&gt; $ROCKYOU</code>.</p>
  <table class=ref><tbody>
   <tr><td class=t>C1</td><td class=c>/lab/sample-hashes/c1_md5.txt</td><td class=p>50</td></tr>
   <tr><td class=t>C1B</td><td class=c>/lab/sample-hashes/b1_base64.txt</td><td class=p>25</td></tr>
   <tr><td class=t>C2</td><td class=c>/lab/sample-hashes/c2_sha1.txt</td><td class=p>50</td></tr>
   <tr><td class=t>C2B</td><td class=c>/lab/sample-hashes/c2b_md5.txt&nbsp;&nbsp;(read c2b_README.txt!)</td><td class=p>75</td></tr>
   <tr><td class=t>C3</td><td class=c>/lab/sample-hashes/c3_md5.txt</td><td class=p>100</td></tr>
   <tr><td class=t>C4</td><td class=c>/lab/sample-hashes/c4_md5.txt</td><td class=p>150</td></tr>
   <tr><td class=t>C5</td><td class=c>/lab/sample-hashes/c5_md5.txt</td><td class=p>200</td></tr>
   <tr><td class=t>C6</td><td class=c>ssh://vuln-login&nbsp;&nbsp;(Hydra)</td><td class=p>150</td></tr>
   <tr><td class=t>C7</td><td class=c>/lab/sample-hashes/c7_bcrypt.txt</td><td class=p>250</td></tr>
   <tr><td class=t>C8</td><td class=c>/lab/sample-hashes/c8_ntlm.txt</td><td class=p>250</td></tr>
   <tr><td class=t>C9</td><td class=c>Dillon's Cookie Shop &mdash; https://cookies.0byte.sh</td><td class=p>200</td></tr>
  </tbody></table>
  <p class=hint>Paths are inside the <code>crackstation</code> container. C6 is a live SSH login; C9 is a live web login at <code>https://cookies.0byte.sh</code> (use Hydra <code>http-post-form</code>). Flags look like <code>DC256{...}</code></p>
 </details>
</div>
<div class=card><h1 style="font-size:1.1rem">Leaderboard</h1>
 <table><thead><tr><th>#</th><th>Player</th><th>Solved</th><th>Pts</th></tr></thead><tbody id=board></tbody></table>
</div>
<footer>Lab only · synthetic data. Projector view: <b>/projector</b></footer></div>
<script>
const $=s=>document.querySelector(s);
function esc(s){return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
async function submit(){
 const player=$('#player').value.trim(), flag=$('#flag').value.trim(), m=$('#msg');
 if(!player){m.className='msg err';m.textContent='Enter your name/team.';return}
 if(!flag){m.className='msg err';m.textContent='Enter a flag.';return}
 const r=await fetch('/api/submit',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({name:player,flag:flag})});
 const j=await r.json();
 m.className='msg '+(j.ok?'ok':(j.dup?'info':'err'));m.textContent=j.message;
 if(j.ok)$('#flag').value='';refresh();
}
$('#flag')&&$('#flag').addEventListener('keydown',e=>{if(e.key==='Enter')submit()});
async function refresh(){
 const rows=await (await fetch('/api/board')).json();const tb=$('#board');tb.innerHTML='';
 const med=['🥇','🥈','🥉'];
 rows.forEach((r,i)=>{const tr=document.createElement('tr');
  tr.innerHTML=\`<td class=rank>\${med[i]||(i+1)}</td><td>\${esc(r.name)}</td>
   <td>\${r.solved.map(c=>\`<span class=pill>\${c}</span>\`).join('')||'—'}</td><td class=pts>\${r.points}</td>\`;
  tb.appendChild(tr);});
 if(!rows.length)tb.innerHTML='<tr><td colspan=4 style="color:var(--muted)">No flags yet — be First Blood!</td></tr>';
}
refresh();setInterval(refresh,5000);
</script></body></html>`;

const PROJECTOR_PAGE = `<!doctype html><html><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>Hash Heist — leaderboard</title><style>${CSS}
body{font-size:1.6vw}.wrap{max-width:90vw}h1{font-size:3vw}
th{font-size:1.1vw}td{font-size:1.7vw;padding:.6vw .8vw}.rank{font-size:2vw}
.pill{font-size:1vw}</style></head><body><div class=wrap>
<h1><span class=accent>#</span> Hash Heist — Live Leaderboard</h1>
<div class=brand style="font-size:1.1vw">DC256 × NAC-ISSA · submit at <b>board.0byte.sh</b></div>
<table><thead><tr><th>#</th><th>Player / Team</th><th>Solved</th><th>Points</th></tr></thead>
<tbody id=board></tbody></table></div>
<script>
function esc(s){return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
async function refresh(){
 const rows=await (await fetch('/api/board')).json();const tb=document.getElementById('board');tb.innerHTML='';
 const med=['🥇','🥈','🥉'];
 rows.forEach((r,i)=>{const tr=document.createElement('tr');
  tr.innerHTML=\`<td class=rank>\${med[i]||(i+1)}</td><td>\${esc(r.name)}</td>
   <td>\${r.solved.map(c=>\`<span class=pill>\${c}</span>\`).join('')||'—'}</td><td class=pts>\${r.points}</td>\`;
  tb.appendChild(tr);});
 if(!rows.length)tb.innerHTML='<tr><td colspan=4 style="color:var(--muted)">Waiting for First Blood…</td></tr>';
}
refresh();setInterval(refresh,3000);
</script></body></html>`;

const ADMIN_PAGE = `<!doctype html><html><head><meta charset=utf-8><title>Hash Heist admin</title>
<style>${CSS}</style></head><body><div class=wrap><h1>Admin</h1>
<div class=card><p>Reset the entire leaderboard (cannot be undone).</p>
<label>Admin token</label><input id=tok placeholder="the ADMIN_TOKEN secret">
<button onclick=reset()>Reset board</button><div id=m class=msg></div></div></div>
<script>async function reset(){const t=document.getElementById('tok').value.trim();
const r=await fetch('/api/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t})});
const j=await r.json();const m=document.getElementById('m');m.className='msg '+(j.ok?'ok':'err');m.textContent=j.message;}
</script></body></html>`;

const html = (body, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (request.method === "GET") {
      if (p === "/") return html(PLAYER_PAGE);
      if (p === "/projector" || p === "/projector/" || p === "/board.html") return html(PROJECTOR_PAGE);
      if (p === "/admin") return html(ADMIN_PAGE);
      if (p === "/api/board") return json(await board(env));
      return html("not found", 404);
    }

    if (request.method === "POST") {
      let data = {};
      try { data = await request.json(); } catch (e) { data = {}; }

      if (p === "/api/submit") {
        const name = String(data.name || "").trim().slice(0, 40);
        const flag = String(data.flag || "").trim().replace(/\s+/g, "");
        if (!name || !flag) return json({ ok: false, message: "Name and flag required." });
        const cid = FLAG_HASHES[await sha256hex(flag)];
        if (!cid) return json({ ok: false, message: "❌ Not a valid flag. Format: DC256{...}" });
        const d = await loadState(env);
        const rec = d[name] || { solved: [] };
        d[name] = rec;
        if (rec.solved.includes(cid)) {
          const pts = score(rec.solved);
          return json({ ok: false, dup: true, message: `ℹ Already solved ${cid} (${CHALLENGES[cid][1]}). Total: ${pts} pts.` });
        }
        rec.solved.push(cid);
        await saveState(env, d);
        const pts = score(rec.solved);
        return json({ ok: true, challenge: cid, message: `✅ ${cid} — ${CHALLENGES[cid][1]}! +${CHALLENGES[cid][0]} pts. Total: ${pts}.` });
      }

      if (p === "/api/reset") {
        if (String(data.token || "") !== env.ADMIN_TOKEN) return json({ ok: false, message: "Bad token." }, 403);
        await saveState(env, {});
        return json({ ok: true, message: "Board reset." });
      }
      return html("not found", 404);
    }

    return html("method not allowed", 405);
  },
};
