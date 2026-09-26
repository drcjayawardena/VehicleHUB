/**
 * ============================================================
 *  VEHICLE MATCH — Code.gs  (Main server file)
 * ============================================================
 *  Google Apps Script web app that matches vehicle buyers with sellers.
 *
 *  Files required in the Apps Script project:
 *    Code.gs      ← this file (setup, login, save, lists, dashboard)
 *    Matching.gs  ← matching engine
 *    Index.html   ← the complete UI
 *
 *  First time: select the `setup` function in the editor and click ▶ Run.
 *  Default login → username: admin   password: admin123  (change it right away!)
 * ============================================================
 */

const APP = {
  NAME: 'Vehicle Match',
  TZ: 'Asia/Colombo',
  SESSION_SECONDS: 6 * 60 * 60, // 6 hours (CacheService maximum)
  // Privacy: in matches, customers of OTHER officers are hidden — only the officer's
  // name, phone and the vehicle details are shown. Set true to let admins see everyone.
  ADMIN_SEES_ALL_CUSTOMERS: false
};

// Fields that other officers may see (no customer name / phone / notes)
const PUBLIC_FIELDS = {
  B: ['buyer_id', 'vehicle_type', 'make', 'model', 'year_from', 'year_to', 'min_budget',
      'max_budget', 'fuel', 'transmission', 'district', 'status'],
  V: ['vehicle_id', 'vehicle_type', 'make', 'model', 'year', 'price', 'mileage', 'fuel',
      'transmission', 'color', 'district', 'condition', 'status', 'photos_url', 'photo_count']
};

// ---------- Sheet structure ----------
const SCHEMA = {
  USERS: ['username', 'password_hash', 'full_name', 'role', 'active', 'created_at', 'phone'],
  BUYERS: ['buyer_id', 'name', 'phone', 'phone2', 'vehicle_type', 'make', 'model',
    'year_from', 'year_to', 'min_budget', 'max_budget', 'fuel', 'transmission',
    'district', 'notes', 'status', 'created_at', 'updated_at', 'created_by'],
  VEHICLES: ['vehicle_id', 'owner_name', 'owner_phone', 'phone2', 'vehicle_type', 'make',
    'model', 'year', 'price', 'mileage', 'fuel', 'transmission', 'color', 'district',
    'condition', 'notes', 'status', 'created_at', 'updated_at', 'created_by',
    'photos_url', 'photo_count'],
  VEHICLE_MASTER: ['vehicle_type', 'make', 'model'],
  DROPDOWN_LISTS: ['list_name', 'value'],
  MATCHES: ['match_id', 'buyer_id', 'vehicle_id', 'score', 'status', 'notes',
    'follow_up', 'created_at', 'updated_at', 'updated_by'] // follow_up: no longer used (kept for compatibility with existing sheets)
};

// Columns stored as plain text so leading zeros are not lost
const TEXT_COLS = {
  USERS: ['username', 'password_hash', 'phone'],
  BUYERS: ['phone', 'phone2'],
  VEHICLES: ['owner_phone', 'phone2']
};

// ---------- Default dropdown data (inserted once by setup) ----------
const DEFAULT_LISTS = {
  VEHICLE_TYPE: ['Car', 'SUV / Jeep', 'Van', 'Cab / Pickup', 'Motorcycle', 'Three Wheeler', 'Lorry', 'Bus'],
  FUEL: ['Petrol', 'Diesel', 'Hybrid', 'Electric'],
  TRANSMISSION: ['Auto', 'Manual', 'Tiptronic'],
  CONDITION: ['Brand New', 'Recondition', 'Registered (Used)'],
  DISTRICT: ['Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Matale', 'Nuwara Eliya', 'Galle',
    'Matara', 'Hambantota', 'Jaffna', 'Kilinochchi', 'Mannar', 'Vavuniya', 'Mullaitivu',
    'Batticaloa', 'Ampara', 'Trincomalee', 'Kurunegala', 'Puttalam', 'Anuradhapura',
    'Polonnaruwa', 'Badulla', 'Monaragala', 'Ratnapura', 'Kegalle'],
  BUYER_STATUS: ['Active', 'Bought', 'Cancelled'],
  VEHICLE_STATUS: ['Available', 'Sold', 'Withdrawn'],
  // Note: 'New', 'Deal ✅' and 'Rejected ❌' must match MATCH_CONFIG.STATUS in Matching.gs
  MATCH_STATUS: ['New', 'Buyer Informed', 'Seller Informed', 'Vehicle Inspected',
    'Negotiating', 'Deal ✅', 'Rejected ❌']
};

const DEFAULT_MASTER = {
  'Car': {
    'Toyota': ['Aqua', 'Axio', 'Vitz', 'Prius', 'Premio', 'Allion', 'Corolla', 'Yaris', 'Belta', 'Passo'],
    'Suzuki': ['Wagon R', 'Alto', 'Swift', 'Celerio', 'Spacia'],
    'Honda': ['Fit', 'Grace', 'Civic', 'Insight'],
    'Nissan': ['Leaf', 'March', 'Sunny', 'Dayz', 'Note'],
    'Perodua': ['Axia', 'Bezza'],
    'Mitsubishi': ['Lancer'],
    'Daihatsu': ['Mira'],
    'Hyundai': ['Grand i10'],
    'Kia': ['Picanto'],
    'Micro': ['Panda']
  },
  'SUV / Jeep': {
    'Toyota': ['CHR', 'Raize', 'Rush', 'Land Cruiser Prado', 'RAV4'],
    'Honda': ['Vezel', 'CR-V'],
    'Mitsubishi': ['Montero', 'Outlander'],
    'Nissan': ['X-Trail'],
    'Suzuki': ['Vitara', 'Hustler'],
    'Kia': ['Sportage']
  },
  'Van': {
    'Toyota': ['HiAce', 'KDH', 'Townace', 'Noah'],
    'Nissan': ['Caravan', 'NV200', 'Vanette'],
    'Suzuki': ['Every'],
    'Mazda': ['Bongo']
  },
  'Cab / Pickup': {
    'Toyota': ['Hilux'],
    'Mitsubishi': ['L200'],
    'Nissan': ['Navara'],
    'Isuzu': ['D-Max'],
    'Mahindra': ['Bolero']
  },
  'Motorcycle': {
    'Honda': ['Dio', 'Hornet', 'CB Shine'],
    'Bajaj': ['Pulsar', 'CT 100', 'Discover', 'Platina'],
    'TVS': ['Apache', 'Ntorq', 'Wego', 'Scooty'],
    'Yamaha': ['FZ', 'Ray ZR'],
    'Hero': ['Pleasure', 'Maestro']
  },
  'Three Wheeler': {
    'Bajaj': ['RE'],
    'TVS': ['King'],
    'Piaggio': ['Ape']
  },
  'Lorry': {
    'Isuzu': ['Elf'],
    'Mitsubishi': ['Canter'],
    'Toyota': ['Dyna'],
    'Tata': ['Ace']
  },
  'Bus': {
    'Toyota': ['Coaster'],
    'Ashok Leyland': ['Viking'],
    'Tata': ['LP 909']
  }
};

// ============================================================
//  SETUP  (run once from the editor)
// ============================================================
function setup() {
  const ss = ss_();
  Object.keys(SCHEMA).forEach(function (name) { ensureSheet_(ss, name); });

  // Dropdown lists
  if (sheet_('DROPDOWN_LISTS').getLastRow() < 2) {
    const rows = [];
    Object.keys(DEFAULT_LISTS).forEach(function (k) {
      DEFAULT_LISTS[k].forEach(function (v) { rows.push({ list_name: k, value: v }); });
    });
    appendRows_('DROPDOWN_LISTS', rows);
  }

  // Vehicle master
  if (sheet_('VEHICLE_MASTER').getLastRow() < 2) {
    const rows = [];
    Object.keys(DEFAULT_MASTER).forEach(function (type) {
      Object.keys(DEFAULT_MASTER[type]).forEach(function (make) {
        DEFAULT_MASTER[type][make].forEach(function (model) {
          rows.push({ vehicle_type: type, make: make, model: model });
        });
      });
    });
    appendRows_('VEHICLE_MASTER', rows);
  }

  // Default admin user
  if (sheet_('USERS').getLastRow() < 2) {
    appendObj_('USERS', {
      username: 'admin',
      password_hash: hash_('admin', 'admin123'),
      full_name: 'Administrator',
      role: 'admin',
      active: true,
      created_at: new Date()
    });
  }

  // Remove the empty default "Sheet1"
  ['Sheet1', 'Sheet 1'].forEach(function (n) {
    const s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });

  migrateStatusNames_();
  applyValidations_();
  const msg = '✅ Setup complete. Login: admin / admin123 (change the password right away)';
  Logger.log(msg);
  return msg;
}

/** Renames the old Sinhala match statuses to English (safe to run many times). */
function migrateStatusNames_() {
  const MAP = {};
  MAP['Buyer \u0da7 \u0d9a\u0dd2\u0dc0\u0dca\u0dc0\u0dcf'] = 'Buyer Informed';
  MAP['Seller \u0da7 \u0d9a\u0dd2\u0dc0\u0dca\u0dc0\u0dcf'] = 'Seller Informed';
  MAP['\u0dc0\u0dcf\u0dc4\u0db1\u0dba \u0db6\u0dbd\u0db1\u0dca\u0db1 \u0d9c\u0dd2\u0dba\u0dcf'] = 'Vehicle Inspected';
  [['DROPDOWN_LISTS', 'value'], ['MATCHES', 'status']].forEach(function (x) {
    const sh = sheet_(x[0]);
    const last = sh.getLastRow();
    if (last < 2) return;
    const col = SCHEMA[x[0]].indexOf(x[1]) + 1;
    const rng = sh.getRange(2, col, last - 1, 1);
    const vals = rng.getValues();
    let changed = false;
    vals.forEach(function (r) { if (MAP[r[0]]) { r[0] = MAP[r[0]]; changed = true; } });
    if (changed) rng.setValues(vals);
  });
}

function ensureSheet_(ss, name) {
  const headers = SCHEMA[name];
  let sh = ss.getSheetByName(name);

  if (sh && sh.getLastRow() > 0) {
    const current = sh.getRange(1, 1, 1, headers.length).getValues()[0].map(String);
    if (current.join('|') === headers.join('|')) return sh; // already correct
    // Same structure with new columns added at the end → just add the new headers
    const used = current.filter(function (h) { return h !== ''; });
    if (used.length && used.join('|') === headers.slice(0, used.length).join('|') &&
        current.slice(used.length).every(function (h) { return h === ''; })) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
      (TEXT_COLS[name] || []).forEach(function (c) {
        sh.getRange(1, headers.indexOf(c) + 1, sh.getMaxRows(), 1).setNumberFormat('@');
      });
      return sh;
    }
    // Old structure — rename it as a backup so no data is lost
    sh.setName(name + '_OLD_' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmm'));
    sh = null;
  }
  if (!sh) sh = ss.insertSheet(name);

  if (sh.getMaxColumns() < headers.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  }
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  (TEXT_COLS[name] || []).forEach(function (c) {
    sh.getRange(1, headers.indexOf(c) + 1, sh.getMaxRows(), 1).setNumberFormat('@');
  });
  return sh;
}

function applyValidations_() {
  const lists = getLists_();
  [['BUYERS', 'status', 'BUYER_STATUS'],
   ['VEHICLES', 'status', 'VEHICLE_STATUS'],
   ['MATCHES', 'status', 'MATCH_STATUS']].forEach(function (x) {
    const sh = sheet_(x[0]);
    const col = SCHEMA[x[0]].indexOf(x[1]) + 1;
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(lists[x[2]] || [], true).setAllowInvalid(true).build();
    sh.getRange(2, col, sh.getMaxRows() - 1, 1).setDataValidation(rule);
  });
}

// ============================================================
//  WEB APP ENTRY
// ============================================================
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ============================================================
//  AUTH
// ============================================================
function login(username, password) {
  username = String(username || '').trim().toLowerCase();
  const u = readAll_('USERS').find(function (x) {
    return String(x.username).trim().toLowerCase() === username;
  });
  if (!u || !isTrue_(u.active) || String(u.password_hash) !== hash_(username, String(password || ''))) {
    Utilities.sleep(800);
    throw new Error('Incorrect username or password');
  }
  const token = Utilities.getUuid() + Utilities.getUuid();
  const sess = { username: String(u.username), full_name: String(u.full_name || u.username), role: String(u.role || 'staff') };
  CacheService.getScriptCache().put('S_' + token, JSON.stringify(sess), APP.SESSION_SECONDS);
  return { token: token, user: sess };
}

function getSession_(token) {
  if (!token) return null;
  const cache = CacheService.getScriptCache();
  const raw = cache.get('S_' + token);
  if (!raw) return null;
  cache.put('S_' + token, raw, APP.SESSION_SECONDS); // sliding expiry
  return JSON.parse(raw);
}

function hash_(username, password) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(username).toLowerCase() + '|' + password + '|' + salt_(),
    Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function salt_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('PW_SALT');
  if (!s) { s = Utilities.getUuid(); props.setProperty('PW_SALT', s); }
  return s;
}

// ============================================================
//  API DISPATCHER — every request from the UI comes through here
// ============================================================
function api(token, action, payload) {
  const user = getSession_(token);
  if (!user) throw new Error('SESSION_EXPIRED');

  const handlers = {
    init: init_,
    dashboard: dashboard_,
    lookupPhone: lookupPhone_,
    listBuyers: listBuyers_,
    listVehicles: listVehicles_,
    saveBuyer: saveBuyer_,
    saveVehicle: saveVehicle_,
    getMatches: getMatches_,
    updateMatch: updateMatch_,
    refreshMatches: function () { return refreshAllMatches(); },
    changePassword: changePassword_,
    updateProfile: updateProfile_,
    addUser: addUser_,
    listUsers: listUsers_,
    updateUser: updateUser_,
    addMaster: addMaster_,
    uploadPhoto: uploadPhoto_,
    logout: function () { CacheService.getScriptCache().remove('S_' + token); return { ok: true }; }
  };
  const h = handlers[action];
  if (!h) throw new Error('Unknown action: ' + action);
  // JSON roundtrip so Dates etc. can be sent to the browser
  return JSON.parse(JSON.stringify(h(payload || {}, user)));
}

// ============================================================
//  HANDLERS
// ============================================================
function init_(p, user) {
  const me = officersMap_()[user.username.toLowerCase()] || {};
  return {
    user: Object.assign({}, user, { full_name: me.name || user.full_name, phone: me.phone || '' }),
    lists: getLists_(),
    master: readAll_('VEHICLE_MASTER').map(function (m) {
      return { vehicle_type: String(m.vehicle_type), make: String(m.make), model: String(m.model) };
    })
  };
}

function dashboard_(p, user) {
  const allB = readAll_('BUYERS'), allV = readAll_('VEHICLES');
  const bMap = mapBy_(allB, 'buyer_id');
  const vMap = mapBy_(allV, 'vehicle_id');
  const officers = officersMap_();
  // Officers see their own numbers; admins see everything
  const buyers = isAdmin_(user) ? allB : allB.filter(function (b) { return isMine_(b, user); });
  const vehicles = isAdmin_(user) ? allV : allV.filter(function (v) { return isMine_(v, user); });
  const matches = readAll_('MATCHES').filter(function (m) { return canSeeMatch_(m, bMap, vMap, user); });
  const month = fmtDay_(new Date()).slice(0, 7);
  const S = MATCH_CONFIG.STATUS;

  const live = matches.filter(function (m) {
    const b = bMap[String(m.buyer_id)], v = vMap[String(m.vehicle_id)];
    return b && v && isBuyerActive_(b) && isVehicleAvailable_(v);
  });

  const newOnes = live.filter(function (m) {
    return m.status === S.NEW && Number(m.score) >= MATCH_CONFIG.MIN_SCORE;
  });

  return {
    stats: {
      activeBuyers: buyers.filter(isBuyerActive_).length,
      availableVehicles: vehicles.filter(isVehicleAvailable_).length,
      newMatches: newOnes.length,
      inProgress: live.filter(function (m) {
        return [S.NEW, S.DEAL, S.REJECTED].indexOf(m.status) === -1;
      }).length,
      dealsThisMonth: matches.filter(function (m) {
        return m.status === S.DEAL && fmtDay_(m.updated_at).slice(0, 7) === month;
      }).length
    },
    topNew: newOnes.map(function (m) { return enrichMatch_(m, bMap, vMap, user, officers); })
      .sort(function (a, b) { return b.score - a.score; }).slice(0, 6)
  };
}

function lookupPhone_(p, user) {
  const phone = normPhone_(p.phone);
  if (phone.length < 9) throw new Error('Please enter a valid phone number');
  const officers = officersMap_();
  return {
    phone: phone,
    buyers: readAll_('BUYERS').filter(function (b) {
      return normPhone_(b.phone) === phone || normPhone_(b.phone2) === phone;
    }).map(function (b) { return viewRecord_(b, 'B', user, officers, false); }),
    vehicles: readAll_('VEHICLES').filter(function (v) {
      return normPhone_(v.owner_phone) === phone || normPhone_(v.phone2) === phone;
    }).map(function (v) { return viewRecord_(v, 'V', user, officers, false); })
  };
}

/** Officers see only their own customers; admins see all. */
function listBuyers_(p, user) {
  const counts = matchCounts_('buyer_id');
  const officers = officersMap_();
  return {
    buyers: readAll_('BUYERS')
      .filter(function (b) { return isAdmin_(user) || isMine_(b, user); })
      .map(function (b) {
        const o = viewRecord_(b, 'B', user, officers, false);
        o.matchCount = counts[String(b.buyer_id)] || 0;
        return o;
      }).reverse()
  };
}

function listVehicles_(p, user) {
  const counts = matchCounts_('vehicle_id');
  const officers = officersMap_();
  return {
    vehicles: readAll_('VEHICLES')
      .filter(function (v) { return isAdmin_(user) || isMine_(v, user); })
      .map(function (v) {
        const o = viewRecord_(v, 'V', user, officers, false);
        o.matchCount = counts[String(v.vehicle_id)] || 0;
        return o;
      }).reverse()
  };
}

function matchCounts_(key) {
  const c = {};
  readAll_('MATCHES').forEach(function (m) {
    if (Number(m.score) >= MATCH_CONFIG.MIN_SCORE && m.status !== MATCH_CONFIG.STATUS.REJECTED) {
      const k = String(m[key]);
      c[k] = (c[k] || 0) + 1;
    }
  });
  return c;
}

// ---------- Save buyer ----------
function saveBuyer_(p, user) {
  const d = {
    buyer_id: str_(p.buyer_id),
    name: str_(p.name),
    phone: normPhone_(p.phone),
    phone2: normPhone_(p.phone2),
    vehicle_type: str_(p.vehicle_type),
    make: str_(p.make),
    model: str_(p.model),
    year_from: numOrBlank_(p.year_from),
    year_to: numOrBlank_(p.year_to),
    min_budget: numOrBlank_(p.min_budget),
    max_budget: numOrBlank_(p.max_budget),
    fuel: str_(p.fuel),
    transmission: str_(p.transmission),
    district: str_(p.district),
    notes: str_(p.notes),
    status: str_(p.status) || 'Active'
  };
  if (!d.name) throw new Error('Please enter the name');
  if (d.phone.length < 9) throw new Error('Please enter a valid phone number');
  if (d.max_budget === '') throw new Error('Please enter the maximum budget (Lakhs)');
  swapIfReversed_(d, 'year_from', 'year_to');
  swapIfReversed_(d, 'min_budget', 'max_budget');
  const master = d.make ? ensureMaster_(d.vehicle_type, d, 'make', 'model') : null;

  const id = saveRecord_('BUYERS', 'buyer_id', 'B', d, user);
  matchForBuyer_(id);
  return {
    id: id,
    master: master,
    buyer: viewRecord_(findById_('BUYERS', 'buyer_id', id), 'B', user, officersMap_(), false),
    matches: getMatches_({ buyerId: id }, user).matches
  };
}

// ---------- Save vehicle ----------
function saveVehicle_(p, user) {
  const d = {
    vehicle_id: str_(p.vehicle_id),
    owner_name: str_(p.owner_name),
    owner_phone: normPhone_(p.owner_phone),
    phone2: normPhone_(p.phone2),
    vehicle_type: str_(p.vehicle_type),
    make: str_(p.make),
    model: str_(p.model),
    year: numOrBlank_(p.year),
    price: numOrBlank_(p.price),
    mileage: numOrBlank_(p.mileage),
    fuel: str_(p.fuel),
    transmission: str_(p.transmission),
    color: str_(p.color),
    district: str_(p.district),
    condition: str_(p.condition),
    notes: str_(p.notes),
    status: str_(p.status) || 'Available'
  };
  if (!d.owner_name) throw new Error("Please enter the owner's name");
  if (d.owner_phone.length < 9) throw new Error('Please enter a valid phone number');
  if (!d.vehicle_type || !d.make || !d.model) throw new Error('Please enter Type, Make and Model');
  if (d.price === '') throw new Error('Please enter the price (Lakhs)');
  const master = ensureMaster_(d.vehicle_type, d, 'make', 'model');

  const id = saveRecord_('VEHICLES', 'vehicle_id', 'V', d, user);
  matchForVehicle_(id);
  return {
    id: id,
    master: master,
    vehicle: viewRecord_(findById_('VEHICLES', 'vehicle_id', id), 'V', user, officersMap_(), false),
    matches: getMatches_({ vehicleId: id }, user).matches
  };
}

/** Insert (no id) or update (id given). Returns the ID. */
function saveRecord_(sheetName, idCol, prefix, d, user) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const now = new Date();
    if (d[idCol]) {
      const ex = readAll_(sheetName).find(function (r) { return String(r[idCol]) === d[idCol]; });
      if (!ex) throw new Error('Record not found: ' + d[idCol]);
      if (!isAdmin_(user) && !isMine_(ex, user)) throw new Error('You can only edit your own customers');
      const obj = Object.assign({}, ex, d, { updated_at: now });
      writeRow_(sheet_(sheetName), sheetName, ex._row, obj);
      SpreadsheetApp.flush();
      return d[idCol];
    }
    const id = nextId_(sheetName, idCol, prefix);
    d[idCol] = id;
    appendObj_(sheetName, Object.assign({}, d, { created_at: now, updated_at: now, created_by: user.username }));
    SpreadsheetApp.flush();
    return id;
  } finally {
    lock.releaseLock();
  }
}

// ---------- Users ----------
function changePassword_(p, user) {
  const newPw = String(p.newPassword || '');
  if (newPw.length < 6) throw new Error('New password must be at least 6 characters');
  const u = readAll_('USERS').find(function (x) { return String(x.username).toLowerCase() === user.username.toLowerCase(); });
  if (!u || String(u.password_hash) !== hash_(user.username, String(p.oldPassword || ''))) {
    throw new Error('Current password is incorrect');
  }
  u.password_hash = hash_(user.username, newPw);
  writeRow_(sheet_('USERS'), 'USERS', u._row, u);
  return { ok: true };
}

function addUser_(p, user) {
  if (user.role !== 'admin') throw new Error('Only admins can add users');
  const username = str_(p.username).toLowerCase();
  if (!/^[a-z0-9._-]{3,}$/.test(username)) throw new Error('Username must be 3+ characters (a-z, 0-9 only)');
  if (String(p.password || '').length < 6) throw new Error('Password must be at least 6 characters');
  if (normPhone_(p.phone).length < 9) throw new Error('Please enter a valid mobile number for the user');
  if (readAll_('USERS').some(function (x) { return String(x.username).toLowerCase() === username; })) {
    throw new Error('That username already exists');
  }
  appendObj_('USERS', {
    username: username,
    password_hash: hash_(username, String(p.password)),
    full_name: str_(p.full_name) || username,
    role: p.role === 'admin' ? 'admin' : 'staff',
    active: true,
    created_at: new Date(),
    phone: normPhone_(p.phone)
  });
  return { ok: true };
}

/** Officer updates their own display name and contact number. */
function updateProfile_(p, user) {
  const phone = normPhone_(p.phone);
  if (phone.length < 9) throw new Error('Please enter a valid phone number');
  const u = readAll_('USERS').find(function (x) { return String(x.username).toLowerCase() === user.username.toLowerCase(); });
  if (!u) throw new Error('User not found');
  u.full_name = str_(p.full_name) || u.full_name;
  u.phone = phone;
  writeRow_(sheet_('USERS'), 'USERS', u._row, u);
  return { ok: true, full_name: String(u.full_name), phone: phone };
}

/** Admin: list all users (without password hashes). */
function listUsers_(p, user) {
  if (!isAdmin_(user)) throw new Error('Only admins can manage users');
  return {
    users: readAll_('USERS').map(function (u) {
      return { username: String(u.username), full_name: String(u.full_name || ''), phone: normPhone_(u.phone),
               role: String(u.role || 'staff'), active: isTrue_(u.active) };
    })
  };
}

/** Admin: edit a user's name, mobile, role, active flag, or reset the password. */
function updateUser_(p, user) {
  if (!isAdmin_(user)) throw new Error('Only admins can manage users');
  const u = readAll_('USERS').find(function (x) { return String(x.username).toLowerCase() === str_(p.username).toLowerCase(); });
  if (!u) throw new Error('User not found');
  const phone = normPhone_(p.phone);
  if (phone.length < 9) throw new Error('Please enter a valid mobile number');
  if (String(u.username).toLowerCase() === user.username.toLowerCase() && (!p.active || p.role !== 'admin')) {
    throw new Error('You cannot deactivate yourself or remove your own admin role');
  }
  u.full_name = str_(p.full_name) || u.full_name;
  u.phone = phone;
  u.role = p.role === 'admin' ? 'admin' : 'staff';
  u.active = !!p.active;
  if (p.newPassword) {
    if (String(p.newPassword).length < 6) throw new Error('Password must be at least 6 characters');
    u.password_hash = hash_(u.username, String(p.newPassword));
  }
  writeRow_(sheet_('USERS'), 'USERS', u._row, u);
  return { ok: true };
}

// ============================================================
//  VEHICLE MAKES & MODELS (VEHICLE_MASTER)
// ============================================================
/**
 * Makes sure type/make/model exist in VEHICLE_MASTER (adds them if new) and fixes the
 * spelling in `d` to match the existing list (e.g. "toyota" → "Toyota").
 * Returns the updated master list if something was added, otherwise null.
 */
function ensureMaster_(type, d, makeKey, modelKey) {
  const rows = readAll_('VEHICLE_MASTER');
  const make = str_(d[makeKey]), model = str_(d[modelKey]);
  if (!make) return null;
  const sameMake = rows.find(function (r) { return n_(r.make) === n_(make); });
  if (sameMake) d[makeKey] = String(sameMake.make);
  if (model) {
    const sameModel = rows.find(function (r) { return n_(r.make) === n_(make) && n_(r.model) === n_(model); });
    if (sameModel) d[modelKey] = String(sameModel.model);
  }
  const exists = rows.some(function (r) {
    return n_(r.vehicle_type) === n_(type) && n_(r.make) === n_(make) && (model ? n_(r.model) === n_(model) : true);
  });
  if (exists || !type) return null;
  appendObj_('VEHICLE_MASTER', { vehicle_type: type, make: d[makeKey], model: model ? d[modelKey] : '' });
  return masterList_();
}

function masterList_() {
  return readAll_('VEHICLE_MASTER').map(function (m) {
    return { vehicle_type: String(m.vehicle_type), make: String(m.make), model: String(m.model) };
  });
}

/** Settings → add a make and one or more models (comma / new-line separated). */
function addMaster_(p) {
  const type = str_(p.vehicle_type), make = str_(p.make);
  if (!type || !make) throw new Error('Please choose a vehicle type and enter the make');
  const models = String(p.models || '').split(/[,\n]+/).map(str_).filter(Boolean);
  let added = 0;
  (models.length ? models : ['']).forEach(function (model) {
    const d = { make: make, model: model };
    if (ensureMaster_(type, d, 'make', 'model')) added++;
  });
  return { added: added, master: masterList_() };
}

// ============================================================
//  VEHICLE PHOTOS (Google Drive)
// ============================================================
/** Uploads one photo (data URL) for a vehicle into its own Drive folder. */
function uploadPhoto_(p, user) {
  const m = String(p.data || '').match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!m) throw new Error('Invalid image file');
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 10 * 1024 * 1024) throw new Error('Photo is too large (max 10 MB)');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const v = findById_('VEHICLES', 'vehicle_id', p.vehicleId);
    if (!v) throw new Error('Vehicle not found');
    if (!isAdmin_(user) && !isMine_(v, user)) throw new Error('You can only add photos to your own vehicles');

    const folder = vehicleFolder_(v);
    const ext = m[1].split('/')[1].replace('jpeg', 'jpg');
    const name = v.vehicle_id + '_' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmmss') +
      '_' + Math.floor(Math.random() * 1000) + '.' + ext;
    folder.createFile(Utilities.newBlob(bytes, m[1], name));

    let count = 0;
    const it = folder.getFiles();
    while (it.hasNext()) { it.next(); count++; }
    v.photos_url = folder.getUrl();
    v.photo_count = count;
    writeRow_(sheet_('VEHICLES'), 'VEHICLES', v._row, v);
    return { photos_url: v.photos_url, photo_count: count };
  } finally {
    lock.releaseLock();
  }
}

function photosRoot_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PHOTO_ROOT_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* deleted → recreate */ } }
  const f = DriveApp.createFolder('Vehicle Match Photos');
  props.setProperty('PHOTO_ROOT_ID', f.getId());
  return f;
}

function vehicleFolder_(v) {
  const m = String(v.photos_url || '').match(/folders\/([\w-]+)/);
  if (m) { try { return DriveApp.getFolderById(m[1]); } catch (e) { /* recreate */ } }
  const f = photosRoot_().createFolder(v.vehicle_id + ' - ' + [v.make, v.model, v.year].filter(Boolean).join(' '));
  // Anyone with the link can view (so officers can open it). Falls back if your domain blocks this.
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e) { try { f.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (e2) {} }
  return f;
}

// ============================================================
//  OFFICERS & PRIVACY
// ============================================================
function isAdmin_(user) { return user.role === 'admin'; }

function isMine_(rec, user) {
  return String(rec.created_by || '').toLowerCase() === user.username.toLowerCase();
}

function officersMap_() {
  const m = {};
  readAll_('USERS').forEach(function (u) {
    m[String(u.username).toLowerCase()] = {
      username: String(u.username),
      name: String(u.full_name || u.username),
      phone: normPhone_(u.phone)
    };
  });
  return m;
}

function officerOf_(rec, officers) {
  const k = String(rec.created_by || '').toLowerCase();
  return officers[k] || { username: k, name: k || 'Unknown officer', phone: '' };
}

/**
 * Returns a copy of a buyer/vehicle safe to send to this user.
 * Own customers → full details. Other officers' customers → vehicle details + officer only.
 * forMatch = true applies the strict match rule (admins included unless ADMIN_SEES_ALL_CUSTOMERS).
 */
function viewRecord_(rec, kind, user, officers, forMatch) {
  const mine = isMine_(rec, user);
  const full = mine || (isAdmin_(user) && (!forMatch || APP.ADMIN_SEES_ALL_CUSTOMERS));
  let o;
  if (full) {
    o = Object.assign({}, rec);
  } else {
    o = {};
    PUBLIC_FIELDS[kind].forEach(function (k) { o[k] = rec[k]; });
  }
  delete o._row;
  o.mine = mine;
  o.masked = !full;
  o.officer = officerOf_(rec, officers);
  return o;
}

/** Officers only see matches that involve one of their own customers. */
function canSeeMatch_(m, bMap, vMap, user) {
  if (isAdmin_(user)) return true;
  const b = bMap[String(m.buyer_id)], v = vMap[String(m.vehicle_id)];
  return !!((b && isMine_(b, user)) || (v && isMine_(v, user)));
}

// ============================================================
//  SHEET HELPERS
// ============================================================
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error(name + ' sheet not found. Run setup() from the editor.');
  return sh;
}

function readAll_(name) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const cols = SCHEMA[name];
  return sh.getRange(2, 1, last - 1, cols.length).getValues()
    .map(function (r, i) {
      const o = { _row: i + 2 };
      cols.forEach(function (c, j) { o[c] = r[j]; });
      return o;
    })
    .filter(function (o) { return o[cols[0]] !== '' && o[cols[0]] !== null; });
}

function findById_(name, idCol, id) {
  return readAll_(name).find(function (r) { return String(r[idCol]) === String(id); }) || null;
}

function writeRow_(sh, name, row, obj) {
  const cols = SCHEMA[name];
  (TEXT_COLS[name] || []).forEach(function (c) {
    sh.getRange(row, cols.indexOf(c) + 1).setNumberFormat('@');
  });
  sh.getRange(row, 1, 1, cols.length).setValues([cols.map(function (c) {
    return obj[c] === undefined || obj[c] === null ? '' : obj[c];
  })]);
}

function appendObj_(name, obj) {
  const sh = sheet_(name);
  const row = sh.getLastRow() + 1;
  if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 200);
  writeRow_(sh, name, row, obj);
  return row;
}

function appendRows_(name, objs) {
  if (!objs.length) return;
  const sh = sheet_(name);
  const cols = SCHEMA[name];
  const start = sh.getLastRow() + 1;
  const need = start + objs.length - 1 - sh.getMaxRows();
  if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need + 100);
  sh.getRange(start, 1, objs.length, cols.length).setValues(objs.map(function (o) {
    return cols.map(function (c) { return o[c] === undefined || o[c] === null ? '' : o[c]; });
  }));
}

function nextId_(name, idCol, prefix) {
  let max = 0;
  readAll_(name).forEach(function (r) {
    const n = parseInt(String(r[idCol]).replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return prefix + ('0000' + (max + 1)).slice(-4);
}

function getLists_() {
  const lists = {};
  readAll_('DROPDOWN_LISTS').forEach(function (r) {
    const k = String(r.list_name).trim();
    if (!lists[k]) lists[k] = [];
    if (String(r.value).trim()) lists[k].push(String(r.value).trim());
  });
  return lists;
}

function mapBy_(arr, key) {
  const m = {};
  arr.forEach(function (o) { m[String(o[key])] = o; });
  return m;
}

// ============================================================
//  SMALL UTILS
// ============================================================
function str_(v) { return String(v == null ? '' : v).trim(); }

function numOrBlank_(v) {
  if (v === '' || v == null) return '';
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return isNaN(n) || String(v).trim() === '' ? '' : n;
}

function swapIfReversed_(o, a, b) {
  if (o[a] !== '' && o[b] !== '' && Number(o[a]) > Number(o[b])) {
    const t = o[a]; o[a] = o[b]; o[b] = t;
  }
}

/** 0771234567 / 771234567 / +94 77 123 4567 → 0771234567 */
function normPhone_(p) {
  let d = String(p == null ? '' : p).replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 11 && d.indexOf('94') === 0) d = '0' + d.slice(2);
  else if (d.length === 9) d = '0' + d;
  return d;
}

function isTrue_(v) {
  return v === true || v === 1 || ['true', '1', 'yes'].indexOf(String(v).toLowerCase()) !== -1;
}

function fmtDay_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, APP.TZ, 'yyyy-MM-dd');
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}
