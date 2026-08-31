/* ═══════════════════════════════════════════════════════════════════════
   Generates one small HTML file per fighter into app/f/<slug>.html.

   WHY THESE EXIST AT ALL
   Discord, iMessage and Twitter fetch a pasted link with a plain HTTP GET
   and read the <meta> tags. They do NOT run JavaScript. That means a page
   like fighter.html?f=killer-kam can never show the right preview on
   static hosting, no matter how good the client-side code is — the crawler
   sees one generic page for all 443 fighters.

   So each fighter gets a real file with real tags baked in. A human who
   opens one is redirected straight to the profile; a crawler stops at the
   tags and renders the card.

   Run:  node app/build-fighter-pages.mjs        (from the vga-web root)
   Re-run whenever records or champions change — the tags are a snapshot.
   ═══════════════════════════════════════════════════════════════════════ */

import { writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SB = 'https://emzlivoykbhhjcugupit.supabase.co';
const KEY = 'sb_publishable_pqhH974E1q9YsFnrVH1UJQ_X3V-rRLF';
const SITE = 'https://vgaalliance.github.io/vga-web';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'f');

const WC = {
  lightweight: 'Lightweight',
  middleweight: 'Middleweight',
  light_heavyweight: 'Light heavyweight',
  heavyweight: 'Heavyweight'
};

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

async function get(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

function describe(f, beltCount) {
  const bits = [];
  const rec = [f.headline_wins ?? 0, f.headline_losses ?? 0]
    .concat(f.headline_draws ? [f.headline_draws] : []).join('-');
  bits.push(rec);
  if (f.weight_class) bits.push(WC[f.weight_class] ?? f.weight_class);
  if (f.rank != null) bits.push(`P4P #${f.rank}`);
  if (beltCount > 1) bits.push(`${beltCount}× champion`);
  else if (f.is_champion) bits.push('Champion');
  if (f.team) bits.push(f.team);
  return bits.join(' · ');
}

function page(f, beltCount) {
  const title = f.nickname ? `${f.display_name} — "${f.nickname}"` : f.display_name;
  const desc = describe(f, beltCount);
  const img = f.profile_photo_url || `${SITE}/app/icons/icon-512.png`;
  const url = `${SITE}/app/f/${f.slug}.html`;
  const to = `../../fighter-profile-mobile.html?fighter=${encodeURIComponent(f.slug)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} · UBA Esports</title>
<meta name="description" content="${esc(desc)}">

<meta property="og:site_name" content="UBA Esports">
<meta property="og:type" content="profile">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<meta name="theme-color" content="#2A2450">

<link rel="canonical" href="${esc(url)}">
<meta http-equiv="refresh" content="0; url=${esc(to)}">
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(180deg,#3B3568,#0C0916);color:#EDEAF6;
    font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px}
  a{color:#C3A6FF}
</style>
</head>
<body>
  <div>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 8px">${esc(title)}</h1>
    <p style="margin:0 0 16px;color:#B3AAD2;font-size:15px">${esc(desc)}</p>
    <p style="font-size:14px"><a href="${esc(to)}">Opening profile…</a></p>
  </div>
  <script>location.replace(${JSON.stringify(to)});</script>
</body>
</html>
`;
}

const fighters = await get(
  'fighter_cards?select=display_name,slug,nickname,weight_class,headline_wins,' +
  'headline_losses,headline_draws,rank,is_champion,profile_photo_url,team,status' +
  '&status=eq.active&limit=1000'
);

// A double champion should read as one, so belts are counted per holder.
const titles = await get(
  'titles_public?select=holder_slug,is_interim&is_interim=eq.false&league=eq.UBA'
);
const belts = {};
for (const t of titles) if (t.holder_slug) belts[t.holder_slug] = (belts[t.holder_slug] ?? 0) + 1;

await mkdir(OUT, { recursive: true });

// Clear out fighters who are no longer active, so a retired page does not
// linger and keep unfurling a stale record.
const keep = new Set(fighters.filter(f => f.slug).map(f => `${f.slug}.html`));
for (const existing of await readdir(OUT).catch(() => [])) {
  if (existing.endsWith('.html') && !keep.has(existing)) {
    await unlink(join(OUT, existing));
    console.log('removed', existing);
  }
}

let written = 0, skipped = 0;
for (const f of fighters) {
  if (!f.slug) { skipped++; continue; }
  await writeFile(join(OUT, `${f.slug}.html`), page(f, belts[f.slug] ?? 0), 'utf8');
  written++;
}

console.log(`${written} fighter pages written to app/f/`);
if (skipped) console.log(`${skipped} skipped — no slug`);
