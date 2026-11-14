/**
 * ============================================================
 *  VEHICLE MATCH — Matching.gs  (Matching engine)
 * ============================================================
 *  Auto-matches as soon as a buyer or vehicle is saved.
 *  Re-match everything: refreshAllMatches()
 *  Hourly auto re-match: run installHourlyTrigger() once.
 * ============================================================
 */

const MATCH_CONFIG = {
  VERSION: '3.6',        // must match APP.VERSION in Code.gs
  MIN_SCORE: 80,           // A match is saved and shown only when it is at least this % (80 = "at least 80% matching")
  BUDGET_TOLERANCE: 0.10,  // Allow prices up to 10% over budget (room to negotiate)
  YEAR_TOLERANCE: 1,       // Half points if within 1 year outside the range
  WEIGHTS: {               // Total 100
    MAKE_MODEL: 30,
    YEAR: 20,
    PRICE: 20,
    FUEL: 10,
    TRANSMISSION: 10,
    DISTRICT: 10
  },
  // Must match the names in DROPDOWN_LISTS → MATCH_STATUS
  STATUS: { NEW: 'New', DEAL: 'Deal ✅', REJECTED: 'Rejected ❌' },
  BUYER_ACTIVE: 'Active', BUYER_DONE: 'Bought',
  VEHICLE_ACTIVE: 'Available', VEHICLE_DONE: 'Sold'
};

// ============================================================
//  SCORING
// ============================================================
/**
 * Score between Buyer (b) and Vehicle (v), 0–100.
 * 0 = excluded by a hard filter.
 * An empty buyer field means "any is fine".
 */
function scoreMatch_(b, v) {
  const W = MATCH_CONFIG.WEIGHTS;
  const reasons = [];

  // ---- Hard filters ----
  if (b.vehicle_type && v.vehicle_type && n_(b.vehicle_type) !== n_(v.vehicle_type)) {
    return { score: 0, reasons: ['Different type'] };
  }
  if (b.make && v.make && n_(b.make) !== n_(v.make)) {
    return { score: 0, reasons: ['Different make'] };
  }
  const maxBudget = num_(b.max_budget);
  const price = num_(v.price);
  if (maxBudget && price && price > maxBudget * (1 + MATCH_CONFIG.BUDGET_TOLERANCE)) {
    return { score: 0, reasons: ['Far over budget'] };
  }

  let s = 0;

  // ---- Make + Model ----
  if (!b.model || n_(b.model) === n_(v.model)) {
    s += W.MAKE_MODEL;
    if (b.model) reasons.push('Model ✓');
  } else {
    s += W.MAKE_MODEL * 0.3;
    reasons.push('Different model');
  }

  // ---- Year ----
  const y = num_(v.year), yf = num_(b.year_from), yt = num_(b.year_to);
  if (!yf && !yt) {
    s += W.YEAR;
  } else if (y) {
    const lo = yf || 0, hi = yt || 9999;
    if (y >= lo && y <= hi) { s += W.YEAR; reasons.push('Year ✓'); }
    else if (y >= lo - MATCH_CONFIG.YEAR_TOLERANCE && y <= hi + MATCH_CONFIG.YEAR_TOLERANCE) {
      s += W.YEAR * 0.5; reasons.push('Year close');
    }
  }

  // ---- Price ----
  if (!maxBudget || !price) {
    s += W.PRICE * 0.5;
  } else if (price <= maxBudget) {
    s += W.PRICE; reasons.push('Budget ✓');
  } else {
    s += W.PRICE * 0.4; reasons.push('Slightly over budget');
  }

  // ---- Fuel / Transmission / District ----
  if (!b.fuel || n_(b.fuel) === n_(v.fuel)) { s += W.FUEL; if (b.fuel) reasons.push('Fuel ✓'); }
  if (!b.transmission || n_(b.transmission) === n_(v.transmission)) { s += W.TRANSMISSION; if (b.transmission) reasons.push('Gear ✓'); }
  if (!b.district || n_(b.district) === n_(v.district)) { s += W.DISTRICT; if (b.district) reasons.push('District ✓'); }

  return { score: Math.round(s), reasons: reasons };
}

// ============================================================
//  RUNNERS
// ============================================================
/** Re-match all active buyers × available vehicles. */
function refreshAllMatches() {
  return upsertMatches_(
    readAll_('BUYERS').filter(isBuyerActive_),
    readAll_('VEHICLES').filter(isVehicleAvailable_)
  );
}

function matchForBuyer_(buyerId) {
  const b = findById_('BUYERS', 'buyer_id', buyerId);
  if (!b || !isBuyerActive_(b)) return { added: 0, updated: 0 };
  return upsertMatches_([b], readAll_('VEHICLES').filter(isVehicleAvailable_));
}

function matchForVehicle_(vehicleId) {
  const v = findById_('VEHICLES', 'vehicle_id', vehicleId);
  if (!v || !isVehicleAvailable_(v)) return { added: 0, updated: 0 };
  return upsertMatches_(readAll_('BUYERS').filter(isBuyerActive_), [v]);
}

/** Adds new matches; for existing ones only the score is updated (status/notes are kept). */
function upsertMatches_(buyers, vehicles) {
  const res = upsertMatchRows_(buyers, vehicles);
  // Email both officers about the new matches (outside the lock; never breaks saving)
  if (res.newRows.length && typeof notifyNewMatches_ === 'function') {
    notifyNewMatches_(res.newRows, mapBy_(buyers, 'buyer_id'), mapBy_(vehicles, 'vehicle_id'));
  }
  return { added: res.added, updated: res.updated };
}

function upsertMatchRows_(buyers, vehicles) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = sheet_('MATCHES');
    const cols = SCHEMA.MATCHES;
    const iB = cols.indexOf('buyer_id'), iV = cols.indexOf('vehicle_id');
    const iS = cols.indexOf('score'), iU = cols.indexOf('updated_at');
    const last = sh.getLastRow();
    const data = last > 1 ? sh.getRange(2, 1, last - 1, cols.length).getValues() : [];

    const existing = {};
    data.forEach(function (r, i) { existing[r[iB] + '|' + r[iV]] = i; });

    const now = new Date();
    const newRows = [];
    let updated = 0;

    buyers.forEach(function (b) {
      vehicles.forEach(function (v) {
        const score = scoreMatch_(b, v).score;
        const key = b.buyer_id + '|' + v.vehicle_id;
        if (existing[key] !== undefined) {
          const r = data[existing[key]];
          if (Number(r[iS]) !== score) { r[iS] = score; r[iU] = now; updated++; }
        } else if (score >= MATCH_CONFIG.MIN_SCORE) {
          newRows.push({
            match_id: 'M' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase(),
            buyer_id: b.buyer_id, vehicle_id: v.vehicle_id, score: score,
            status: MATCH_CONFIG.STATUS.NEW, notes: '', follow_up: '',
            created_at: now, updated_at: now, updated_by: 'system'
          });
        }
      });
    });

    if (updated) sh.getRange(2, 1, data.length, cols.length).setValues(data);
    appendRows_('MATCHES', newRows);
    SpreadsheetApp.flush();
    return { added: newRows.length, updated: updated, newRows: newRows };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
//  READ / UPDATE (API handlers)
// ============================================================
/**
 * p: { buyerId, vehicleId, minScore, includeClosed }
 * By default, hides Rejected matches and matches for Sold/Bought records (except Deals).
 */
function getMatches_(p, user) {
  p = p || {};
  const bMap = mapBy_(readAll_('BUYERS'), 'buyer_id');
  const vMap = mapBy_(readAll_('VEHICLES'), 'vehicle_id');
  const officers = officersMap_();
  /* MIN_SCORE is a floor the caller cannot lower (the page asks for minScore 0 and filters itself). */
  const minScore = Math.max(MATCH_CONFIG.MIN_SCORE, (p.minScore === undefined || p.minScore === '') ? 0 : Number(p.minScore));
  const S = MATCH_CONFIG.STATUS;

  const out = readAll_('MATCHES').filter(function (m) {
    if (!canSeeMatch_(m, bMap, vMap, user)) return false;
    if (p.buyerId && String(m.buyer_id) !== String(p.buyerId)) return false;
    if (p.vehicleId && String(m.vehicle_id) !== String(p.vehicleId)) return false;
    if (Number(m.score) < minScore && !isDeal_(m.status)) return false;   /* a closed deal stays visible whatever its score was */
    if (!p.includeClosed) {
      // Closed deals live on the Deals page; rejected ones are hidden too.
      if (isRejectedMatch_(m.status) || isDeal_(m.status)) return false;
      const b = bMap[String(m.buyer_id)], v = vMap[String(m.vehicle_id)];
      if (!b || !v || !isBuyerActive_(b) || !isVehicleAvailable_(v)) return false;
    }
    return true;
  }).map(function (m) { return enrichMatch_(m, bMap, vMap, user, officers); })
    .sort(function (a, b) { return b.score - a.score; });

  return { matches: out };
}

function updateMatch_(p, user) {
  const lists = getLists_();
  if ((lists.MATCH_STATUS || []).indexOf(p.status) === -1) throw new Error('Invalid status: ' + p.status);

  // Same lock as the matching engine, so a re-match running at the same time cannot
  // overwrite this status change, and row numbers cannot shift under a delete.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const m = readAll_('MATCHES').find(function (x) { return String(x.match_id) === String(p.matchId); });
    if (!m) throw new Error('Match not found');
    if (!canSeeMatch_(m, mapBy_(readAll_('BUYERS'), 'buyer_id'), mapBy_(readAll_('VEHICLES'), 'vehicle_id'), user)) {
      throw new Error('This match does not involve your customers');
    }

    m.status = p.status;
    m.notes = str_(p.notes);
    m.updated_at = new Date();
    m.updated_by = user.username;
    writeRow_(sheet_('MATCHES'), 'MATCHES', m._row, m);

    // On a Deal: buyer = Bought, vehicle = Sold
    let closed = false;
    if (isDeal_(p.status)) {
      const b = findById_('BUYERS', 'buyer_id', m.buyer_id);
      const v = findById_('VEHICLES', 'vehicle_id', m.vehicle_id);
      if (b) { b.status = MATCH_CONFIG.BUYER_DONE; b.updated_at = new Date(); writeRow_(sheet_('BUYERS'), 'BUYERS', b._row, b); }
      if (v) { v.status = MATCH_CONFIG.VEHICLE_DONE; v.updated_at = new Date(); writeRow_(sheet_('VEHICLES'), 'VEHICLES', v._row, v); }
      closed = true;
    }
    SpreadsheetApp.flush();
    return { ok: true, closed: closed };
  } finally {
    lock.releaseLock();
  }
}

function enrichMatch_(m, bMap, vMap, user, officers) {
  const b = bMap[String(m.buyer_id)] || { buyer_id: m.buyer_id };
  const v = vMap[String(m.vehicle_id)] || { vehicle_id: m.vehicle_id };
  return {
    matchId: String(m.match_id),
    score: Number(m.score),
    status: String(m.status || ''),
    notes: String(m.notes || ''),
    updatedAt: m.updated_at instanceof Date ? Utilities.formatDate(m.updated_at, APP.TZ, 'yyyy-MM-dd HH:mm') : '',
    reasons: (b.name !== undefined && v.make !== undefined) ? scoreMatch_(b, v).reasons : [],
    buyer: viewRecord_(b, 'B', user, officers, true),
    vehicle: viewRecord_(v, 'V', user, officers, true)
  };
}

// ============================================================
//  HELPERS
// ============================================================
/**
 * Status checks that ignore symbols/emoji and letter case, so "Deal ✅", "Deal", "deal ✔️"
 * all count as a deal (the sheet may contain slightly different versions of the same word).
 */
function statusKey_(s) { return String(s == null ? '' : s).replace(/[^A-Za-z0-9]/g, '').toLowerCase(); }
function isDeal_(s) { return statusKey_(s) === statusKey_(MATCH_CONFIG.STATUS.DEAL); }
function isRejectedMatch_(s) { return statusKey_(s) === statusKey_(MATCH_CONFIG.STATUS.REJECTED); }
function isNewMatch_(s) { return !s || statusKey_(s) === statusKey_(MATCH_CONFIG.STATUS.NEW); }

function isBuyerActive_(b) {
  return !b.status || n_(b.status) === n_(MATCH_CONFIG.BUYER_ACTIVE);
}
function isVehicleAvailable_(v) {
  return !v.status || n_(v.status) === n_(MATCH_CONFIG.VEHICLE_ACTIVE);
}
function n_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[\s_\-\/]+/g, '');
}
function num_(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return isNaN(n) || n === 0 ? null : n;
}

/** Runs refreshAllMatches every hour (run this once). */
function installHourlyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'refreshAllMatches'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('refreshAllMatches').timeBased().everyHours(1).create();
  return '✅ Hourly trigger installed';
}

// ============================================================
//  MARKET TAB — ads from other sites (e.g. ikman.lk), pasted in by an Officer
//  No scraping: the officer pastes the ad link + text; we read the details and match them with active buyers.
//  The MARKET sheet is created automatically the first time the tab is used.
// ============================================================
const MARKET_STATUS = { ACTIVE: 'Active', CONTACTED: 'Contacted', GONE: 'Gone' };

function marketEnsure_() { ensureSheet_(ss_(), 'MARKET'); }

/** Reads make / model / year / price (Lakhs) / fuel / gear / district / mileage / phone from pasted ad text. */
function marketParse_(p) {
  const text = String(p.text || '').slice(0, 6000);
  const low = ' ' + text.toLowerCase().replace(/[^a-z0-9඀-෿.,/ -]+/g, ' ') + ' ';
  const out = { title: '', vehicle_type: '', make: '', model: '', year: '', price: '', mileage: '', fuel: '', transmission: '', district: '', phone: '' };
  out.title = text.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean)[0] || '';
  if (out.title.length > 120) out.title = out.title.slice(0, 120);

  // make / model (longest model name wins)
  let best = null;
  readAll_('VEHICLE_MASTER').forEach(function (m) {
    const mk = String(m.make || '').toLowerCase(), md = String(m.model || '').toLowerCase();
    if (!mk) return;
    const hasMk = low.indexOf(' ' + mk + ' ') >= 0 || low.indexOf(' ' + mk + ',') >= 0;
    const hasMd = md && (low.indexOf(' ' + md + ' ') >= 0 || low.indexOf(' ' + md + ',') >= 0 || low.indexOf(' ' + md + '.') >= 0);
    const score = (hasMd ? 100 + md.length : 0) + (hasMk ? 10 : 0);
    if (score > 0 && (!best || score > best.score)) best = { score: score, m: m, hasMd: !!hasMd };
  });
  if (best) {
    out.vehicle_type = String(best.m.vehicle_type || ''); out.make = String(best.m.make || '');
    out.model = best.hasMd ? String(best.m.model || '') : '';
  }
  // year (first plausible 4-digit year)
  const thisYear = new Date().getFullYear();
  const ys = (text.match(/\b(19[7-9]\d|20[0-4]\d)\b/g) || []).map(Number).filter(function (y) { return y <= thisYear + 1; });
  if (ys.length) out.year = ys[0];
  // price in Lakhs
  let m;
  if ((m = text.match(/(?:ලක්ෂ|lakhs?|lacs?)\s*\.?\s*([\d]+(?:\.\d+)?)/i)) || (m = text.match(/([\d]+(?:\.\d+)?)\s*(?:lakhs?|lacs?|ලක්ෂ)/i))) {
    out.price = Math.round(parseFloat(m[1]) * 100) / 100;
  } else if ((m = text.match(/([\d]+(?:\.\d+)?)\s*(?:mn|million)\b/i))) {
    out.price = Math.round(parseFloat(m[1]) * 10 * 100) / 100;
  } else {
    const rs = text.match(/(?:rs\.?|lkr)\s*([\d,]{6,})/i) || text.match(/\b(\d{1,3}(?:,\d{3}){2,})\b/);
    if (rs) { const v = parseInt(rs[1].replace(/,/g, ''), 10); if (v >= 100000) out.price = Math.round(v / 1000) / 100; }
  }
  // mileage
  if ((m = text.match(/([\d,]{3,7})\s*km\b/i))) out.mileage = parseInt(m[1].replace(/,/g, ''), 10);
  // fuel / transmission
  if (/hybrid/i.test(text)) out.fuel = 'Hybrid'; else if (/electric|\bev\b/i.test(text)) out.fuel = 'Electric';
  else if (/diesel/i.test(text)) out.fuel = 'Diesel'; else if (/petrol/i.test(text)) out.fuel = 'Petrol';
  if (/tiptronic/i.test(text)) out.transmission = 'Tiptronic'; else if (/\bauto(matic)?\b/i.test(text)) out.transmission = 'Auto';
  else if (/manual/i.test(text)) out.transmission = 'Manual';
  // district
  DEFAULT_LISTS.DISTRICT.some(function (d) { if (low.indexOf(' ' + d.toLowerCase() + ' ') >= 0 || low.indexOf(' ' + d.toLowerCase() + ',') >= 0) { out.district = d; return true; } return false; });
  // phone (optional)
  if ((m = text.match(/(?:\+?94|0)\s?7\d[\s-]?\d{3}[\s-]?\d{4}/))) out.phone = m[0].replace(/[\s-]/g, '').replace(/^\+?94/, '0');
  return out;
}

function marketNum_(v) { const n = Number(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? '' : n; }

function marketSave_(p, user) {
  marketEnsure_();
  const url = str_(p.url);
  if (url && !/^https?:\/\//i.test(url)) throw new Error('Link must start with http:// or https://');
  const make = str_(p.make), price = marketNum_(p.price);
  if (!make) throw new Error('Make is required');
  if (price === '' || price <= 0) throw new Error('Price (Lakhs) is required');
  if (url) {
    const dup = readAll_('MARKET').filter(function (r) { return String(r.url) === url && r.status !== MARKET_STATUS.GONE; })[0];
    if (dup) throw new Error('This link is already saved (' + dup.market_id + ')');
  }
  const now = new Date();
  const rec = {
    market_id: nextId_('MARKET', 'market_id', 'M'), source: url ? (url.match(/^https?:\/\/(?:www\.)?([^\/]+)/i) || [])[1] || 'link' : 'manual',
    url: url, title: str_(p.title), vehicle_type: str_(p.vehicle_type), make: make, model: str_(p.model),
    year: marketNum_(p.year), price: price, mileage: marketNum_(p.mileage), fuel: str_(p.fuel), transmission: str_(p.transmission),
    district: str_(p.district), phone: str_(p.phone), notes: str_(p.notes), status: MARKET_STATUS.ACTIVE,
    created_at: now, updated_at: now, created_by: user.username
  };
  appendObj_('MARKET', rec);
  return { id: rec.market_id };
}

function marketUpdate_(p, user) {
  marketEnsure_();
  const r = findById_('MARKET', 'market_id', p.id);
  if (!r) throw new Error('Ad not found');
  if (!isAdmin_(user) && String(r.created_by).toLowerCase() !== String(user.username).toLowerCase()) throw new Error('Only the officer who added this ad (or an admin) can change it');
  if (p.remove) {
    sheet_('MARKET').deleteRow(r._row);
    return { removed: true };
  }
  const st = str_(p.status);
  if (st && [MARKET_STATUS.ACTIVE, MARKET_STATUS.CONTACTED, MARKET_STATUS.GONE].indexOf(st) < 0) throw new Error('Bad status');
  updateById_('MARKET', 'market_id', r.market_id, function (row) {
    if (st) row.status = st;
    if (p.notes !== undefined) row.notes = str_(p.notes);
    row.updated_at = new Date();
    return row;
  });
  return { ok: true };
}

/** Saved ads with the active buyers that match each one (score >= MATCH_CONFIG.MIN_SCORE). */
function marketList_(p, user) {
  marketEnsure_();
  const st = str_(p.status) || 'open';
  const officers = officersMap_();
  const buyers = readAll_('BUYERS').filter(isBuyerActive_);
  const ads = readAll_('MARKET').filter(function (a) {
    if (st === 'open') return a.status !== MARKET_STATUS.GONE;
    return st === 'all' || a.status === st;
  }).sort(function (a, b) { return String(b.market_id).localeCompare(String(a.market_id)); }).slice(0, 150);
  return {
    ads: ads.map(function (a) {
      const matches = a.status === MARKET_STATUS.GONE ? [] : buyers.map(function (b) {
        const r = scoreMatch_(b, a);
        return { score: r.score, reasons: r.reasons, b: b };
      }).filter(function (x) { return x.score >= MATCH_CONFIG.MIN_SCORE; })
        .sort(function (x, y) { return y.score - x.score; }).slice(0, 8)
        .map(function (x) { return { score: x.score, reasons: x.reasons, buyer: viewRecord_(x.b, 'B', user, officers, true) }; });
      const o = {};
      SCHEMA.MARKET.forEach(function (c) { o[c] = a[c] instanceof Date ? Utilities.formatDate(a[c], APP.TZ, 'yyyy-MM-dd HH:mm') : a[c]; });
      o.canEdit = isAdmin_(user) || String(a.created_by).toLowerCase() === String(user.username).toLowerCase();
      o.matches = matches;
      return o;
    })
  };
}
