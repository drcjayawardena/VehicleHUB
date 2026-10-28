/******************************************************
 * VehicleHub — McLogin.gs
 *
 * One login for MasterCAL and VehicleHub: officers log in with their
 * MasterCAL WhatsApp number + password. The page sends the MasterCAL
 * session token; mcLogin() asks MasterCAL who it belongs to (action "whoami")
 * and opens a normal VehicleHub session for the VehicleHub user with the same
 * mobile number — exactly what login() does after a correct password.
 *
 * Any approved MasterCAL user gets Officer access in VehicleHub through the
 * same MasterCAL login. No second VehicleHub approval or password is needed.
 *
 * Needs: in Code.gs doPost(), "mcLogin: mcLogin" in the allowed list.
 ******************************************************/

const MC_API_URL = 'https://script.google.com/macros/s/AKfycbx8m_v6iMUy8tTSGzxSfxi79ZyTfJgpy89WjVkqRMO3dvnm734znkdTvjpW92DhO-xN/exec';

/** Public: MasterCAL session token -> { token, user } (a VehicleHub session). */
function mcLogin(mcToken) {
  mcToken = String(mcToken || '');
  if (!mcToken || mcToken.length > 400) throw new Error('Please log in again.');

  const res = UrlFetchApp.fetch(MC_API_URL, {
    method: 'post', contentType: 'text/plain;charset=utf-8',
    payload: JSON.stringify({ action: 'whoami', args: [mcToken] }),
    followRedirects: true, muteHttpExceptions: true
  });
  let j = null;
  try { j = JSON.parse(res.getContentText() || '{}'); } catch (e) {}
  if (!j || !j.ok || !j.data) throw new Error('MasterCAL login is not valid. Please log in again.');

  /* The MasterCAL admin chooses, when approving, whether a user gets the VehicleHUB part.
     "=== false" so an older MasterCAL backend (no such field) keeps working. */
  if (j.data.vehiclehub === false) throw new Error('VehicleHUB access is not enabled for your account. Please contact the admin.');

  const phone = normPhone_(j.data.phone);   // "+94771234567" -> "0771234567"
  if (phone.length !== 10) throw new Error('Your MasterCAL account has no valid mobile number.');

  let u = readAll_('USERS').find(function (x) { return normPhone_(x.phone) === phone; });
  if (!u) {
    mcCreateUser_(j.data, phone);
    u = readAll_('USERS').find(function (x) { return normPhone_(x.phone) === phone; });
    if (!u) throw new Error('Could not create your VehicleHub account. Please try again.');
  }
  if (!isTrue_(u.active)) {
    // A pending legacy SSO account is activated by its valid MasterCAL session.
    // An account explicitly deactivated by a VehicleHub admin remains blocked.
    if (u.approved_at) throw new Error('This account has been deactivated. Please contact the admin.');
    u.active = true;
    u.approved_at = new Date();
    writeRow_(sheet_('USERS'), 'USERS', u._row, u);
  }
  const token = Utilities.getUuid() + Utilities.getUuid();
  const sess = { username: String(u.username), full_name: String(u.full_name || u.username),
                 role: String(u.role || 'staff'), user_type: 'Officer' };
  CacheService.getScriptCache().put('S_' + token, JSON.stringify(sess), APP.SESSION_SECONDS);
  return { token: token, user: sess };
}

/** New VehicleHub Officer for a MasterCAL user (active; they authenticate through MasterCAL). */
function mcCreateUser_(mc, phone) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const users = readAll_('USERS');
    if (users.some(function (x) { return normPhone_(x.phone) === phone; })) return;
    const taken = function (n) { return users.some(function (x) { return String(x.username).toLowerCase() === n; }); };
    const base = phone;
    let username = base, i = 2;
    while (taken(username)) username = base + (i++);
    const now = new Date();
    appendObj_('USERS', {
      username: username,
      password_hash: hash_(username, Utilities.getUuid()),
      full_name: str_(mc.name) || username,
      role: 'staff',
      user_type: 'Officer',
      active: true,
      created_at: now,
      phone: phone,
      approved_at: now,
      email: cleanEmail_(mc.email)
    });
  } finally {
    lock.releaseLock();
  }
}
