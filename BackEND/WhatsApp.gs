/******************************************************
 * VehicleHub — WhatsApp.gs
 *
 * WhatsApp alerts for new matches and new customer requests (WhatsApp Business Cloud API, paid).
 * When a new match is found, the buyer's officer and the vehicle's officer
 * each get a WhatsApp message from the VehicleHub number, using the
 * approved template "vehicle_match":
 *   VehicleHUB: New match found. Vehicle: {{1}}. Buyer: {{2}}.
 *   Contact officer: {{3}}. Please follow up.
 *
 * New customer request (LEADS, from the public request page / MasterCAL quotation
 * links): the officer it is assigned to gets template "new_lead":
 *   VehicleHUB: New customer request {{1}}. Customer: {{2}}, {{3}}.
 *   Request: {{4}}. Please call the customer soon.
 *
 * Works beside the live Code.gs / Matching.gs without changing them:
 * a timer (every 10 minutes) looks for MATCHES rows not yet sent and
 * records every send in the WA_LOG sheet, so nothing is sent twice.
 *
 * Settings (Project Settings → Script properties):
 *   WA_TOKEN      permanent System User access token   (required, never share)
 *   WA_PHONE_ID   1316273428243645                      (required)
 *   WA_TEMPLATE   vehicle_match                         (optional)
 *   WA_LEAD_TEMPLATE new_lead                           (optional)
 *   WA_LANG       en                                    (optional, template language code)
 *   WA_DAILY_CAP  50                                    (optional, max messages per day)
 *   WA_ENABLED    true                                  (set false to stop all messages)
 *
 * First time: select setupWhatsApp in the editor and click ▶ Run.
 * Test:       put your number in testWhatsApp() and run it.
 ******************************************************/

const WA = {
  API: 'https://graph.facebook.com/v21.0/',
  LOG_SHEET: 'WA_LOG',
  LOG_COLS: ['sent_at', 'match_id', 'officer', 'phone', 'status', 'detail'],
  MIN_SCORE: 80,          // same as EMAIL_MIN_SCORE and MATCH_CONFIG.MIN_SCORE: only matches of at least 80% are sent
  TRIGGER_FN: 'waCheckNewMatches'
};

function waProp_(k, def) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  return v === null || v === '' ? def : v;
}

function waLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(WA.LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(WA.LOG_SHEET);
    sh.getRange(1, 1, 1, WA.LOG_COLS.length).setValues([WA.LOG_COLS]).setFontWeight('bold');
    sh.getRange('D:D').setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** One-time setup: log sheet, mark existing matches as old (no flood), install the timer. */
function setupWhatsApp() {
  const sh = waLogSheet_();
  const done = waDoneIds_(sh);
  const now = new Date();
  const old = readAll_('MATCHES')
    .filter(function (m) { return !done[String(m.match_id)]; })
    .map(function (m) { return [now, String(m.match_id), '', '', 'old', 'existed before WhatsApp alerts']; });
  if (old.length) sh.getRange(sh.getLastRow() + 1, 1, old.length, WA.LOG_COLS.length).setValues(old);

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === WA.TRIGGER_FN) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(WA.TRIGGER_FN).timeBased().everyMinutes(10).create();
  Logger.log('WhatsApp alerts ready. Old matches skipped: ' + old.length);
}

function waDoneIds_(sh) {
  const done = {};
  const last = sh.getLastRow();
  if (last < 2) return done;
  sh.getRange(2, 2, last - 1, 1).getValues().forEach(function (r) { if (r[0] !== '') done[String(r[0])] = true; });
  return done;
}

function waSentToday_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const today = Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd');
  return sh.getRange(2, 1, last - 1, 5).getValues().filter(function (r) {
    return r[4] === 'sent' && r[0] instanceof Date && Utilities.formatDate(r[0], APP.TZ, 'yyyy-MM-dd') === today;
  }).length;
}

/** Timer: send WhatsApp alerts for matches that have not been handled yet. */
function waCheckNewMatches() {
  if (String(waProp_('WA_ENABLED', 'true')).toLowerCase() === 'false') return;
  if (!waProp_('WA_TOKEN', '') || !waProp_('WA_PHONE_ID', '')) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const sh = waLogSheet_();
    const done = waDoneIds_(sh);
    try { waCheckNewLeads_(sh, done); } catch (e) { Logger.log('waCheckNewLeads_ ' + e.message); }
    const fresh = readAll_('MATCHES').filter(function (m) { return !done[String(m.match_id)]; });
    if (!fresh.length) return;

    const bMap = {}, vMap = {};
    readAll_('BUYERS').forEach(function (b) { bMap[String(b.buyer_id)] = b; });
    readAll_('VEHICLES').forEach(function (v) { vMap[String(v.vehicle_id)] = v; });
    const officers = officersMap_();
    const cap = Number(waProp_('WA_DAILY_CAP', 50)) || 50;
    let sentToday = waSentToday_(sh);
    const log = [];
    const add = function (m, o, phone, status, detail) {
      log.push([new Date(), String(m.match_id), o ? o.username : '', phone || '', status, detail || '']);
    };

    fresh.forEach(function (m) {
      const b = bMap[String(m.buyer_id)], v = vMap[String(m.vehicle_id)];
      if (Number(m.score) < WA.MIN_SCORE || !b || !v) { add(m, null, '', 'skipped', 'score ' + m.score); return; }
      waAlertsFor_(m, b, v, officers).forEach(function (a) {
        if (!a.officer.active || !a.officer.phone) { add(m, a.officer, a.officer.phone, 'skipped', 'no phone / inactive'); return; }
        if (sentToday >= cap) { add(m, a.officer, a.officer.phone, 'capped', 'daily cap ' + cap); return; }
        const r = waSendTemplate_(a.officer.phone, a.params);
        if (r.ok) sentToday++;
        add(m, a.officer, a.officer.phone, r.ok ? 'sent' : 'failed', r.detail);
      });
    });
    if (log.length) sh.getRange(sh.getLastRow() + 1, 1, log.length, WA.LOG_COLS.length).setValues(log);
  } finally {
    lock.releaseLock();
  }
}

/**
 * The messages for one match: one per officer (buyer side, vehicle side).
 * Privacy as in the app: an officer sees only their own customer's name.
 */
function waAlertsFor_(m, b, v, officers) {
  const bOff = officerOf_(b, officers), vOff = officerOf_(v, officers);
  const car = carText_(v, 'year') + ' - ' + lakhs_(v.price);
  const same = bOff.username.toLowerCase() === vOff.username.toLowerCase();
  const offText = function (o) { return (o.name || o.username) + ' ' + (o.phone || ''); };
  if (same) {
    return [{ officer: bOff, params: [car, String(b.name || '-'), 'Seller ' + (v.owner_name || '') + ' ' + (v.owner_phone || '')] }];
  }
  return [
    { officer: bOff, params: [car, String(b.name || '-'), offText(vOff)] },
    { officer: vOff, params: [car, 'Customer of ' + (bOff.name || bOff.username), offText(bOff)] }
  ];
}

/**
 * New customer requests → WhatsApp to the officer they are assigned to.
 * Log rows use "lead:<lead_id>" in the match_id column. The first time this runs,
 * the requests already there are marked old, so nobody gets a flood of messages.
 */
function waCheckNewLeads_(sh, done) {
  const leads = readAll_('LEADS');
  const log = [], now = new Date();
  const add = function (l, o, phone, status, detail) {
    log.push([now, 'lead:' + l.lead_id, o ? o.username : '', phone || '', status, detail || '']);
  };
  if (!done['leads:start']) {
    log.push([now, 'leads:start', '', '', 'old', 'WhatsApp lead alerts started']);
    leads.forEach(function (l) { if (l.lead_id && !done['lead:' + l.lead_id]) add(l, null, '', 'old', 'existed before WhatsApp lead alerts'); });
  } else {
    const officers = officersMap_();
    const cap = Number(waProp_('WA_DAILY_CAP', 50)) || 50;
    let sentToday = waSentToday_(sh);
    leads.forEach(function (l) {
      if (!l.lead_id || done['lead:' + l.lead_id]) return;
      if (l.status && String(l.status) !== 'New') { add(l, null, '', 'skipped', 'status ' + l.status); return; }
      const who = String(l.assigned_to || l.ref || '').toLowerCase();
      const o = officers[who];
      if (!o) { add(l, null, '', 'skipped', 'no officer ' + who); return; }
      if (!o.active || !o.phone) { add(l, o, o.phone, 'skipped', 'no phone / inactive'); return; }
      if (sentToday >= cap) { add(l, o, o.phone, 'capped', 'daily cap ' + cap); return; }
      const r = waSendTemplate_(o.phone, waLeadParams_(l), waProp_('WA_LEAD_TEMPLATE', 'new_lead'));
      if (r.ok) sentToday++;
      add(l, o, o.phone, r.ok ? 'sent' : 'failed', r.detail);
    });
  }
  if (log.length) sh.getRange(sh.getLastRow() + 1, 1, log.length, WA.LOG_COLS.length).setValues(log);
  log.forEach(function (r) { done[r[1]] = true; });
}

function waLeadParams_(l) {
  const buyer = String(l.type) === 'buyer';
  const car = [l.vehicle_type, l.make, l.model].filter(function (x) { return String(x || '').trim(); }).join(' ') || 'any vehicle';
  const want = buyer
    ? 'Wants to buy ' + car + (l.year_from ? ' from ' + l.year_from : '') + ', budget up to ' + lakhs_(l.max_budget) + (isTrue_(l.leasing) ? ', needs leasing' : '')
    : 'Wants to sell ' + car + (l.year ? ' ' + l.year : '') + ', price ' + lakhs_(l.price);
  return [String(l.lead_id), String(l.name || '-'), String(l.phone || '-'), want];
}

/** 0771234567 → 94771234567 */
function waNumber_(phone) {
  const p = normPhone_(phone);
  return p.length === 10 && p.charAt(0) === '0' ? '94' + p.slice(1) : p;
}

function waSendTemplate_(phone, params, template) {
  const clean = function (s) { return String(s == null ? '' : s).replace(/[\n\t]+/g, ' ').replace(/ {4,}/g, ' ').trim() || '-'; };
  const body = {
    messaging_product: 'whatsapp',
    to: waNumber_(phone),
    type: 'template',
    template: {
      name: template || waProp_('WA_TEMPLATE', 'vehicle_match'),
      language: { code: waProp_('WA_LANG', 'en') },
      components: [{ type: 'body', parameters: params.map(function (p) { return { type: 'text', text: clean(p) }; }) }]
    }
  };
  try {
    const res = UrlFetchApp.fetch(WA.API + waProp_('WA_PHONE_ID', '') + '/messages', {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + waProp_('WA_TOKEN', '') },
      payload: JSON.stringify(body), muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    const text = res.getContentText().slice(0, 300);
    return { ok: code >= 200 && code < 300, detail: code + ' ' + text };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

/** Editor test for the new_lead template: put your own mobile number below and click ▶ Run. */
function testLeadWhatsApp() {
  const r = waSendTemplate_('0779100518', ['L0001', 'Kamal', '0771234567', 'Wants to buy Car Toyota Aqua, budget up to Rs. 65 Lakhs'], waProp_('WA_LEAD_TEMPLATE', 'new_lead'));
  Logger.log(JSON.stringify(r));
}

/** Editor test: put your own mobile number below and click ▶ Run. Check View → Logs. */
function testWhatsApp() {
  const r = waSendTemplate_('0771234567', ['Toyota Aqua 2015 - Rs. 65 Lakhs', 'Kamal', 'Test Officer 0771234567']);
  Logger.log(JSON.stringify(r));
}
