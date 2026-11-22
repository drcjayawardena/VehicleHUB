/******************************************************
 * VehicleHub — Facebook.gs
 *
 * Post a vehicle ad straight to the VehicleHub Facebook Page from the app
 * (officer app → Vehicles → Create Ad → "Post to Facebook Page"). Admins only.
 * The browser sends the finished ad image (number plates already blurred in the
 * preview) and the caption; the server uploads them to the Page with the Graph API
 * and logs the post in the FB_LOG sheet.
 *
 * Settings (Project Settings → Script properties):
 *   FB_TOKEN    System User access token with pages_manage_posts, pages_read_engagement
 *               and pages_show_list, from the business that owns the Page (required, never share).
 *               A Page access token works too.
 *   FB_PAGE_ID  the Page's id (optional — default: the id in APP.FACEBOOK_URL)
 *
 * The token never reaches the browser: the app only learns whether posting is set up (fbReady).
 ******************************************************/

const FB = {
  API: 'https://graph.facebook.com/v21.0/',
  LOG_SHEET: 'FB_LOG',
  LOG_COLS: ['posted_at', 'vehicle_id', 'post_id', 'url', 'posted_by', 'status', 'detail']
};

function fbPageId_() {
  const p = PropertiesService.getScriptProperties().getProperty('FB_PAGE_ID');
  if (p) return String(p).trim();
  const m = String(APP.FACEBOOK_URL || '').match(/[?&]id=(\d+)/);
  return m ? m[1] : '';
}

/** True when posting is set up (used by the app to show the button). */
function fbReady_() {
  return !!(PropertiesService.getScriptProperties().getProperty('FB_TOKEN') && fbPageId_());
}

function fbLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(FB.LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(FB.LOG_SHEET);
    sh.getRange(1, 1, 1, FB.LOG_COLS.length).setValues([FB.LOG_COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function fbLog_(row) {
  try { fbLogSheet_().appendRow(FB.LOG_COLS.map(function (c) { return row[c] == null ? '' : row[c]; })); }
  catch (e) { Logger.log('fbLog_: ' + e.message); }
}

/** Graph API call; returns the parsed JSON or throws a readable error (never the token). */
function fbCall_(method, path, params) {
  const opt = { method: method, muteHttpExceptions: true };
  if (method === 'get') path += (path.indexOf('?') > -1 ? '&' : '?') + Object.keys(params).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  else opt.payload = params;                  // a Blob in params → multipart upload
  const res = UrlFetchApp.fetch(FB.API + path, opt);
  let j = {};
  try { j = JSON.parse(res.getContentText()); } catch (e) {}
  if (res.getResponseCode() >= 300 || j.error) {
    const err = j.error || {};
    throw new Error('Facebook: ' + (err.message || ('HTTP ' + res.getResponseCode())) + (err.code ? ' (code ' + err.code + ')' : ''));
  }
  return j;
}

/**
 * Page access token. FB_TOKEN may be a System User token (we ask the Page for its own token,
 * cached for an hour) or already a Page token (used as it is when the lookup is not possible).
 */
function fbPageToken_() {
  const pageId = fbPageId_();
  const token = PropertiesService.getScriptProperties().getProperty('FB_TOKEN');
  if (!token || !pageId) throw new Error('Facebook posting is not set up yet (Script properties FB_TOKEN / FB_PAGE_ID).');
  const cache = CacheService.getScriptCache(), key = 'FB_PAGE_TOKEN_' + pageId;
  const hit = cache.get(key);
  if (hit) return hit;
  let pageToken = token;
  try {
    const j = fbCall_('get', pageId, { fields: 'access_token', access_token: token });
    if (j.access_token) pageToken = j.access_token;
  } catch (e) { /* FB_TOKEN is probably a Page token already */ }
  cache.put(key, pageToken, 3600);
  return pageToken;
}

/**
 * Admin: publish one photo post on the Page.
 * p = { vehicleId, image: 'data:image/jpeg;base64,…', caption }
 */
function postToFacebook_(p, user) {
  if (!isAdmin_(user)) throw new Error('Only an admin can post to the Facebook Page');
  const v = findById_('VEHICLES', 'vehicle_id', str_(p.vehicleId));
  if (!v) throw new Error('Vehicle not found');
  const caption = String(p.caption || '').trim().slice(0, 5000);
  if (!caption) throw new Error('The caption is empty');
  const m = String(p.image || '').match(/^data:(image\/(?:jpeg|png));base64,(.+)$/);
  if (!m) throw new Error('The ad image is missing — wait for the preview, then try again');
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 8 * 1024 * 1024) throw new Error('The ad image is too large');
  const blob = Utilities.newBlob(bytes, m[1], v.vehicle_id + '-ad.' + (m[1] === 'image/png' ? 'png' : 'jpg'));

  const pageId = fbPageId_();
  try {
    const r = fbCall_('post', pageId + '/photos', { source: blob, message: caption, published: 'true', access_token: fbPageToken_() });
    const postId = r.post_id || r.id || '';
    let url = '';
    try { url = fbCall_('get', postId, { fields: 'permalink_url', access_token: fbPageToken_() }).permalink_url || ''; } catch (e) {}
    if (!url && postId) url = 'https://www.facebook.com/' + postId;
    fbLog_({ posted_at: new Date(), vehicle_id: v.vehicle_id, post_id: postId, url: url, posted_by: user.username, status: 'posted' });
    return { ok: true, postId: postId, url: url };
  } catch (e) {
    CacheService.getScriptCache().remove('FB_PAGE_TOKEN_' + pageId);   // a stale token is fetched again next time
    fbLog_({ posted_at: new Date(), vehicle_id: v.vehicle_id, posted_by: user.username, status: 'failed', detail: String(e.message).slice(0, 300) });
    throw e;
  }
}

/** Admin: check the setup without posting anything (Settings → Facebook Page → Test). */
function fbCheck_(p, user) {
  if (!isAdmin_(user)) throw new Error('Only an admin can check the Facebook setup');
  const j = fbCall_('get', fbPageId_(), { fields: 'name,link', access_token: fbPageToken_() });
  return { ok: true, name: j.name || '', link: j.link || '' };
}
