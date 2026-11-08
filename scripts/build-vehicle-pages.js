#!/usr/bin/env node
/**
 * VehicleHUB — build static, SEO-friendly vehicle pages.
 *
 * Reads the public showroom data from the Apps Script web app (publicListings / publicPhotos /
 * publicPhoto — the same no-login API vehicles.html uses) and writes, into FrontEND/:
 *
 *   v/<vehicle_id>.html        one page per vehicle ticked "Show on website" (show_public = Yes)
 *   v/img/<vehicle_id>/*.jpg   its photos (Drive photos cannot be hot-linked, so they are copied)
 *   v/index.json               ids that have a page — vehicles.html uses it to link cards
 *   sitemap.xml, robots.txt
 *
 * No dependencies (Node 18+). Usage:
 *   node scripts/build-vehicle-pages.js [--out FrontEND] [--no-photos]
 *
 * Environment:
 *   VM_API_URL  Apps Script /exec URL   (default: read from FrontEND/config.js)
 *   SITE_URL    public site base URL    (default: https://drcjayawardena.github.io/VehicleHUB)
 *
 * Nothing is written until all data has been fetched, so a failed run leaves the output untouched.
 * Photos already downloaded (same Drive file id) are reused — keep FrontEND/v/img in a CI cache.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SITE = 'https://drcjayawardena.github.io/VehicleHUB';
const MAX_PHOTOS = 10;       // publicPhotos() returns at most 10 anyway
const CONCURRENCY = 3;       // parallel Apps Script calls (be gentle with the quota)
const BRAND = 'VehicleHub';

// ---------- arguments / config ----------
function parseArgs(argv) {
  const o = { out: 'FrontEND', photos: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') o.out = argv[++i];
    else if (argv[i] === '--no-photos') o.photos = false;
    else if (argv[i] === '-h' || argv[i] === '--help') { console.log('Usage: node scripts/build-vehicle-pages.js [--out FrontEND] [--no-photos]'); process.exit(0); }
    else throw new Error('Unknown argument: ' + argv[i]);
  }
  return o;
}

const ARGS = parseArgs(process.argv.slice(2));
const OUT = path.resolve(ROOT, ARGS.out);
const SITE = String(process.env.SITE_URL || DEFAULT_SITE).replace(/\/+$/, '');

function apiUrl() {
  if (process.env.VM_API_URL) return process.env.VM_API_URL.trim();
  const cfg = fs.readFileSync(path.join(ROOT, 'FrontEND', 'config.js'), 'utf8');
  const m = cfg.match(/VM_API_URL\s*=\s*['"]([^'"]+)['"]/);
  if (!m) throw new Error('Could not find VM_API_URL in FrontEND/config.js (or set VM_API_URL)');
  return m[1];
}

// ---------- Apps Script API ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(url, fn, args, tries = 4) {
  let lastErr;
  for (let t = 1; t <= tries; t++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ fn: fn, args: args || [] }),
        redirect: 'follow',
        signal: AbortSignal.timeout(120000)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (!j || !j.ok) throw new Error((j && j.error) || 'API error');
      return j.result;
    } catch (e) {
      lastErr = e;
      if (t < tries) await sleep(1500 * t);
    }
  }
  throw new Error(fn + ' failed: ' + (lastErr && lastErr.message));
}

async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); }
  });
  await Promise.all(workers);
}

// ---------- helpers ----------
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const has = (v) => v !== '' && v != null;
const safeId = (s) => /^[A-Za-z0-9_-]{1,40}$/.test(String(s));
const safeFileId = (s) => /^[A-Za-z0-9_-]{5,100}$/.test(String(s));
const rupees = (lakhs) => Math.round(Number(lakhs) * 100000);
const rs = (lakhs) => 'Rs. ' + rupees(lakhs).toLocaleString('en-US');
const num = (n) => Number(n).toLocaleString('en-US');
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

function vName(v) { return [v.make, v.model].filter(Boolean).join(' ') || v.type || 'Vehicle'; }
function vTitle(v) { return vName(v) + (v.year ? ' ' + v.year : ''); }

function ldType(t) {
  if (t === 'Motorcycle') return 'Motorcycle';
  if (t === 'Bus') return 'BusOrCoach';
  if (['Car', 'SUV / Jeep', 'Van', 'Cab / Pickup'].includes(t)) return 'Car';
  return 'Vehicle';
}
function ldCondition(c) {
  return /brand\s*new|^new$/i.test(String(c || '')) ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition';
}
function ldFuel(f) { return f || undefined; }

function pageTitle(v) {
  const parts = [vTitle(v)];
  if (has(v.price)) parts.push(rs(v.price));
  if (v.district) parts.push(v.district);
  return parts.join(' - ') + ' | ' + BRAND;
}

function specList(v) {
  return [
    ['Type', v.type], ['Make', v.make], ['Model', v.model], ['Year', v.year], ['Condition', v.condition],
    ['Colour', v.color], ['Mileage', has(v.mileage) ? num(v.mileage) + ' km' : ''], ['Fuel', v.fuel],
    ['Transmission', v.transmission], ['District', v.district], ['Listed', isDate(v.date) ? v.date : ''], ['Reference', v.id]
  ].filter((r) => has(r[1]));
}

function pageDescription(v) {
  const bits = [v.condition, v.fuel, v.transmission, has(v.mileage) ? num(v.mileage) + ' km' : ''].filter(Boolean).join(' · ');
  let d = vTitle(v) + ' for sale' + (v.district ? ' in ' + v.district : '') + (has(v.price) ? ' — ' + rs(v.price) : '') + '.' +
    (bits ? ' ' + bits + '.' : '') + ' Checked by a ' + BRAND + ' agent. Call or WhatsApp to enquire.';
  if (d.length > 300) d = d.slice(0, 297).replace(/\s+\S*$/, '') + '…';
  return d;
}

// ---------- page ----------
function renderPage(v, photos, contact) {
  const title = vTitle(v), pt = pageTitle(v), desc = pageDescription(v);
  const url = SITE + '/v/' + v.id + '.html';
  const imgAbs = photos.map((f) => SITE + '/v/img/' + v.id + '/' + f);
  const phone = contact && /^\+?\d{9,15}$/.test(String(contact.phone || '')) ? String(contact.phone) : '';
  const wa = phone ? '94' + phone.replace(/^\+?(94)?0?/, '') : '';
  const msg = 'Hi ' + BRAND + ', I am interested in ' + title + (has(v.price) ? ' (' + rs(v.price) + ')' : '') + ' — Ref ' + v.id + '. ' + url;
  const enquire = '../request.html?type=buyer&src=showroom&about=' + encodeURIComponent(v.id) + '&make=' + encodeURIComponent(v.make) +
    '&model=' + encodeURIComponent(v.model) + '&vtype=' + encodeURIComponent(v.type) + '&year=' + encodeURIComponent(v.year) + '&price=' + encodeURIComponent(v.price);

  const ld = { '@context': 'https://schema.org', '@type': ldType(v.type), name: title, url: url, description: desc, sku: v.id };
  if (v.make) ld.brand = { '@type': 'Brand', name: v.make };
  if (v.model) ld.model = v.model;
  if (v.year) ld.vehicleModelDate = String(v.year);
  if (v.color) ld.color = v.color;
  if (v.fuel) ld.fuelType = ldFuel(v.fuel);
  if (v.transmission) ld.vehicleTransmission = v.transmission;
  if (has(v.mileage)) ld.mileageFromOdometer = { '@type': 'QuantitativeValue', value: Number(v.mileage), unitCode: 'KMT' };
  if (v.condition) ld.itemCondition = ldCondition(v.condition);
  if (imgAbs.length) ld.image = imgAbs;
  if (has(v.price)) {
    ld.offers = {
      '@type': 'Offer', price: rupees(v.price), priceCurrency: 'LKR', availability: 'https://schema.org/InStock', url: url,
      itemCondition: ldCondition(v.condition),
      seller: { '@type': 'Organization', name: BRAND, url: SITE + '/vehicles.html' }
    };
    if (v.district) ld.offers.areaServed = { '@type': 'AdministrativeArea', name: v.district + ', Sri Lanka' };
  }
  const jsonLd = JSON.stringify(ld, null, 2).replace(/</g, '\\u003c');

  const gallery = photos.length
    ? '<div class="gal" id="gal">' + photos.map((f, i) =>
        '<img src="img/' + esc(v.id) + '/' + esc(f) + '" alt="' + esc(title + ' — photo ' + (i + 1)) + '"' +
        (i === 0 ? ' fetchpriority="high"' : ' loading="lazy"') + ' width="900" height="675">').join('') + '</div>' +
      (photos.length > 1 ? '<div class="gnav"><button type="button" id="gp" aria-label="Previous photo">‹</button><span id="gc">1 / ' + photos.length +
        '</span><button type="button" id="gn" aria-label="Next photo">›</button></div>' : '')
    : '<div class="gal nophoto">No photos yet — contact us for pictures.</div>';

  const specs = specList(v).map((r) => '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>').join('');

  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>' + esc(pt) + '</title>\n' +
    '<meta name="description" content="' + esc(desc) + '">\n' +
    '<meta name="robots" content="index,follow,max-image-preview:large">\n' +
    '<link rel="canonical" href="' + esc(url) + '">\n' +
    '<meta name="theme-color" content="#1d3f8f">\n' +
    '<link rel="icon" href="../icon-192.png">\n' +
    '<meta property="og:type" content="product">\n' +
    '<meta property="og:site_name" content="' + BRAND + '">\n' +
    '<meta property="og:title" content="' + esc(pt) + '">\n' +
    '<meta property="og:description" content="' + esc(desc) + '">\n' +
    '<meta property="og:url" content="' + esc(url) + '">\n' +
    (imgAbs.length ? '<meta property="og:image" content="' + esc(imgAbs[0]) + '">\n' : '') +
    (has(v.price) ? '<meta property="product:price:amount" content="' + rupees(v.price) + '">\n<meta property="product:price:currency" content="LKR">\n' : '') +
    '<meta name="twitter:card" content="' + (imgAbs.length ? 'summary_large_image' : 'summary') + '">\n' +
    '<meta name="twitter:title" content="' + esc(pt) + '">\n' +
    '<meta name="twitter:description" content="' + esc(desc) + '">\n' +
    (imgAbs.length ? '<meta name="twitter:image" content="' + esc(imgAbs[0]) + '">\n' : '') +
    '<script type="application/ld+json">\n' + jsonLd + '\n</script>\n' +
    '<style>\n' + CSS + '</style>\n</head>\n<body>\n' +
    '<header class="top"><div class="wrap"><a class="brand" href="../vehicles.html"><img src="../icon-192.png" alt="" width="36" height="36"> ' + BRAND + '</a>' +
    '<a class="btn or" href="../request.html?type=seller&amp;src=showroom">Sell your vehicle</a></div></header>\n' +
    '<main class="wrap">\n' +
    '<nav class="crumb" aria-label="Breadcrumb"><a href="../vehicles.html">Vehicles for sale</a> › ' + esc(vName(v)) + '</nav>\n' +
    '<div class="dlg">\n<section>' + gallery + '</section>\n<section class="info">\n' +
    '<h1>' + esc(title) + '</h1>\n' +
    '<div class="pr">' + (has(v.price) ? esc(rs(v.price)) + ' <small>(' + esc(num(v.price)) + ' Lakhs)</small>' : 'Price on request') + '</div>\n' +
    (v.district ? '<div class="loc">📍 ' + esc(v.district) + '</div>\n' : '') +
    '<table class="specs">' + specs + '</table>\n<div class="acts">\n' +
    '<a class="btn pri" href="' + esc(enquire) + '">Enquire now</a>\n' +
    (wa ? '<a class="btn wa" rel="noopener" href="https://wa.me/' + esc(wa) + '?text=' + encodeURIComponent(msg) + '">WhatsApp ' + BRAND + '</a>\n' : '') +
    (phone ? '<a class="btn ghost" href="tel:' + esc(phone) + '">Call ' + esc(phone) + '</a>\n' : '') +
    '<a class="btn ghost" href="../vehicles.html">← More vehicles</a>\n</div>\n' +
    '<p class="note">You deal through a ' + BRAND + ' agent. Number plates are hidden in photos for the owner\'s privacy. ' +
    'Availability can change — contact us to confirm.</p>\n</section>\n</div>\n</main>\n' +
    '<footer><div class="wrap">© ' + BRAND + ' · Buy · Sell · Lease</div></footer>\n' +
    (photos.length > 1 ? '<script>(function(){var g=document.getElementById("gal"),c=document.getElementById("gc"),n=' + photos.length + ';' +
      'function idx(){return Math.round(g.scrollLeft/g.clientWidth)}' +
      'function go(d){var i=(idx()+d+n)%n;g.scrollTo({left:i*g.clientWidth,behavior:"smooth"})}' +
      'document.getElementById("gp").onclick=function(){go(-1)};document.getElementById("gn").onclick=function(){go(1)};' +
      'g.addEventListener("scroll",function(){c.textContent=(idx()+1)+" / "+n})})();</script>\n' : '') +
    '</body>\n</html>\n';
}

const CSS = [
  ':root{--p:#1d3f8f;--p2:#2d5bd0;--ink:#172033;--mut:#5f6b7d;--bg:#f3f5f9;--line:#dde3ee;--soft:#eef3ff}',
  '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}',
  'a{color:var(--p2)}.wrap{max-width:1000px;margin:0 auto;padding:0 16px}',
  '.top{background:#fff;border-bottom:1px solid var(--line)}.top .wrap{display:flex;align-items:center;justify-content:space-between;min-height:60px;gap:12px}',
  '.brand{display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:18px;color:var(--p);text-decoration:none}',
  '.btn{display:inline-flex;align-items:center;justify-content:center;border-radius:10px;padding:10px 16px;font-weight:700;text-decoration:none;background:#e8edf6;color:var(--ink);border:0}',
  '.btn.pri{background:var(--p);color:#fff}.btn.or{background:#f59e0b;color:#1f1300}.btn.wa{background:#1faa53;color:#fff}.btn.ghost{background:#fff;border:1px solid var(--line)}',
  '.crumb{margin:14px 0 10px;color:var(--mut);font-size:13px}.crumb a{text-decoration:none}',
  '.dlg{display:grid;grid-template-columns:1.3fr 1fr;gap:18px;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;margin-bottom:24px}',
  '.gal{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;background:#0f172a;aspect-ratio:4/3;scrollbar-width:none}.gal::-webkit-scrollbar{display:none}',
  '.gal img{flex:0 0 100%;width:100%;height:100%;object-fit:contain;scroll-snap-align:center}',
  '.gal.nophoto{display:flex;align-items:center;justify-content:center;color:#8a97ad;text-align:center;padding:16px}',
  '.gnav{display:flex;align-items:center;justify-content:center;gap:14px;padding:8px;background:#0f172a;color:#fff;font-size:13px}',
  '.gnav button{width:34px;height:34px;border-radius:50%;border:0;background:rgba(255,255,255,.9);font-size:20px;line-height:1;cursor:pointer}',
  '.info{padding:18px;display:flex;flex-direction:column;gap:10px}.info h1{margin:0;font-size:24px;line-height:1.25}',
  '.pr{color:var(--p);font-size:26px;font-weight:800}.pr small{color:var(--mut);font-size:14px;font-weight:500}.loc{color:var(--mut)}',
  '.specs{width:100%;border-collapse:collapse;font-size:14px}.specs td{padding:7px 0;border-bottom:1px solid #eef1f6}.specs td:first-child{color:var(--mut);width:42%}',
  '.acts{display:grid;gap:8px;margin-top:4px}.note{font-size:12px;color:var(--mut);margin:4px 0 0}',
  'footer{border-top:1px solid var(--line);background:#fff;color:var(--mut);font-size:13px}footer .wrap{padding:16px}',
  '@media(max-width:760px){.dlg{grid-template-columns:1fr;gap:0}.info h1{font-size:21px}}',
  ''
].join('\n');

// ---------- files ----------
function sitemap(vehicles) {
  const url = (loc, lastmod) => '  <url><loc>' + esc(loc) + '</loc>' + (isDate(lastmod) ? '<lastmod>' + lastmod + '</lastmod>' : '') + '</url>';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    [url(SITE + '/vehicles.html'), url(SITE + '/request.html')]
      .concat(vehicles.map((v) => url(SITE + '/v/' + v.id + '.html', v.date))).join('\n') + '\n</urlset>\n';
}

function robots() { return 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + '/sitemap.xml\n'; }

function listDir(dir) { try { return fs.readdirSync(dir); } catch (e) { return []; } }

// ---------- main ----------
async function main() {
  const t0 = Date.now();
  const url = apiUrl();
  console.log('Site: ' + SITE + '\nOutput: ' + OUT);

  const data = await call(url, 'publicListings', []);
  if (!data || !Array.isArray(data.vehicles)) throw new Error('publicListings returned an unexpected result');
  const seen = new Set();
  const vehicles = data.vehicles.filter((v) => {
    const id = String(v && v.id);
    if (!safeId(id)) { console.warn('! skipped vehicle with unsafe id: ' + JSON.stringify(id)); return false; }
    if (seen.has(id)) return false;
    seen.add(id); v.id = id; return true;
  });
  console.log(vehicles.length + ' public vehicle(s)');

  const imgRoot = path.join(OUT, 'v', 'img');
  const photoMap = {};     // vehicle id -> [file names] in display order
  let downloaded = 0, reused = 0, failed = 0;

  // 1) which photos does each vehicle have (publicPhotos) — then download the missing ones (publicPhoto)
  const todo = [];
  if (ARGS.photos) {
    await pool(vehicles.filter((v) => v.photos > 0), CONCURRENCY, async (v) => {
      const dir = path.join(imgRoot, v.id);
      const have = listDir(dir);
      let ids;
      try { ids = (await call(url, 'publicPhotos', [v.id])).filter(safeFileId).slice(0, MAX_PHOTOS); }
      catch (e) {
        console.warn('! ' + v.id + ': photo list failed (' + e.message + ') — using cached photos if any');
        photoMap[v.id] = have.filter((f) => /\.(jpg|png|webp|gif)$/.test(f)).sort();
        return;
      }
      photoMap[v.id] = [];
      ids.forEach((fid) => {
        const cached = have.find((f) => f.replace(/\.[^.]+$/, '') === fid);
        if (cached) { photoMap[v.id].push(cached); reused++; } else todo.push({ v: v, fid: fid, slot: photoMap[v.id].push(null) - 1 });
      });
    });

    await pool(todo, CONCURRENCY, async (t) => {
      try {
        const uri = await call(url, 'publicPhoto', [t.v.id, t.fid]);
        const m = /^data:([\w/+.-]+);base64,([\s\S]+)$/.exec(String(uri));
        const ext = m && EXT[m[1].toLowerCase()];
        if (!ext) throw new Error('unsupported photo format');
        const dir = path.join(imgRoot, t.v.id);
        fs.mkdirSync(dir, { recursive: true });
        const name = t.fid + '.' + ext;
        fs.writeFileSync(path.join(dir, name), Buffer.from(m[2], 'base64'));
        photoMap[t.v.id][t.slot] = name; downloaded++;
      } catch (e) {
        failed++; console.warn('! ' + t.v.id + ': photo ' + t.fid + ' failed (' + e.message + ')');
      }
    });
  }
  Object.keys(photoMap).forEach((id) => { photoMap[id] = photoMap[id].filter(Boolean); });

  // 2) write pages (all data is in hand now)
  const vdir = path.join(OUT, 'v');
  fs.mkdirSync(vdir, { recursive: true });
  vehicles.forEach((v) => fs.writeFileSync(path.join(vdir, v.id + '.html'), renderPage(v, photoMap[v.id] || [], data.contact)));

  // 3) remove pages / photos of vehicles that are no longer public
  const ids = new Set(vehicles.map((v) => v.id));
  listDir(vdir).forEach((f) => { if (/\.html$/.test(f) && !ids.has(f.replace(/\.html$/, ''))) fs.rmSync(path.join(vdir, f)); });
  listDir(imgRoot).forEach((d) => { if (!ids.has(d)) fs.rmSync(path.join(imgRoot, d), { recursive: true, force: true }); });
  vehicles.forEach((v) => {
    const keep = new Set(photoMap[v.id] || []);
    if (ARGS.photos && v.photos > 0 && keep.size) listDir(path.join(imgRoot, v.id)).forEach((f) => { if (!keep.has(f)) fs.rmSync(path.join(imgRoot, v.id, f)); });
  });

  // 4) index + sitemap + robots (written last)
  fs.writeFileSync(path.join(vdir, 'index.json'), JSON.stringify({ generated: new Date().toISOString(), ids: vehicles.map((v) => v.id) }));
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sitemap(vehicles));
  fs.writeFileSync(path.join(OUT, 'robots.txt'), robots());

  console.log('Pages: ' + vehicles.length + ' · photos downloaded ' + downloaded + ', reused ' + reused + (failed ? ', FAILED ' + failed : '') +
    ' · ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
}

main().catch((e) => { console.error('Build failed: ' + (e && e.message || e)); process.exit(1); });
