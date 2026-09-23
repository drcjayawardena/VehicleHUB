const SS_ID = '1PGUzlRCigdy3O7XYN6h4nNkUKqFUIeZP-phh4uHpB0I';

const SHEETS = {
  USERS: 'USERS',
  BUYERS: 'BUYERS',
  VEHICLES: 'VEHICLES',
  MASTER: 'VEHICLE_MASTER',
  LISTS: 'DROPDOWN_LISTS'
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Vehicle Match')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setupDatabase() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const defs = {
    USERS: ['User_ID','Name','Email','Role','Status'],
    BUYERS: ['Buyer_ID','Customer_Name','Mobile','Vehicle_Type','Make','Model','Year_From','Year_To','Budget_From','Budget_To','Fuel','Transmission','Location','Added_By','Created_At','Status'],
    VEHICLES: ['Vehicle_ID','Vehicle_Type','Make','Model','Year','Price','Fuel','Transmission','Location','Mobile','Added_By','Created_At','Status'],
    VEHICLE_MASTER: ['Make','Model','Status'],
    DROPDOWN_LISTS: ['Category','Value','Status']
  };
  Object.keys(defs).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(defs[name]);
  });
  ensureColumns_(ss.getSheetByName(SHEETS.BUYERS), defs.BUYERS);
  ensureColumns_(ss.getSheetByName(SHEETS.VEHICLES), defs.VEHICLES);
  ensureColumns_(ss.getSheetByName(SHEETS.MASTER), defs.VEHICLE_MASTER);
  seedVehicleMaster_(ss.getSheetByName(SHEETS.MASTER));
  seedDropdownLists_(ss.getSheetByName(SHEETS.LISTS));
  const users = ss.getSheetByName(SHEETS.USERS);
  if (users.getLastRow() === 1) {
    for (let i=1;i<=10;i++) users.appendRow([`U${String(i).padStart(2,'0')}`,`Officer ${String(i).padStart(2,'0')}`,'','Officer','ACTIVE']);
  }
  return 'Database setup complete';
}


function ensureColumns_(sh, headers) {
  const existing = sh.getLastColumn() ? sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String) : [];
  headers.forEach(h => { if (existing.indexOf(h) === -1) sh.getRange(1, sh.getLastColumn()+1).setValue(h); });
}

function seedVehicleMaster_(sh) {
  if (sh.getLastRow() > 1) return;
  const rows = [
    ['Toyota','Aqua','ACTIVE'],['Toyota','Vitz','ACTIVE'],['Toyota','Prius','ACTIVE'],['Toyota','KDH','ACTIVE'],['Toyota','Premio','ACTIVE'],['Toyota','Axio','ACTIVE'],
    ['Honda','Vezel','ACTIVE'],['Honda','Fit','ACTIVE'],['Honda','Grace','ACTIVE'],['Suzuki','Wagon R','ACTIVE'],['Suzuki','Alto','ACTIVE'],['Suzuki','Swift','ACTIVE'],
    ['Nissan','Leaf','ACTIVE'],['Nissan','March','ACTIVE'],['Nissan','X-Trail','ACTIVE'],['Mitsubishi','Montero','ACTIVE'],['Mitsubishi','Lancer','ACTIVE']
  ];
  sh.getRange(2,1,rows.length,3).setValues(rows);
}


function seedDropdownLists_(sh) {
  if (sh.getLastRow() > 1) return;
  const rows = [
    ['Vehicle Type','Car','ACTIVE'],['Vehicle Type','Van','ACTIVE'],['Vehicle Type','Lorry','ACTIVE'],['Vehicle Type','Bike','ACTIVE'],['Vehicle Type','Three-Wheeler','ACTIVE'],
    ['Fuel','Any','ACTIVE'],['Fuel','Petrol','ACTIVE'],['Fuel','Diesel','ACTIVE'],['Fuel','Hybrid','ACTIVE'],['Fuel','Electric','ACTIVE'],
    ['Transmission','Any','ACTIVE'],['Transmission','Automatic','ACTIVE'],['Transmission','Manual','ACTIVE'],
    ['Location','Any','ACTIVE'],['Location','Colombo','ACTIVE'],['Location','Gampaha','ACTIVE'],['Location','Negombo','ACTIVE'],['Location','Wattala','ACTIVE'],['Location','Kurunegala','ACTIVE'],['Location','Kandy','ACTIVE'],
    ['Vehicle_Status','AVAILABLE','ACTIVE'],['Vehicle_Status','SOLD','ACTIVE'],['Vehicle_Status','INACTIVE','ACTIVE'],
    ['Buyer_Status','ACTIVE','ACTIVE'],['Buyer_Status','CLOSED','ACTIVE'],['Buyer_Status','INACTIVE','ACTIVE']
  ];
  sh.getRange(2,1,rows.length,3).setValues(rows);
}

function getData() {
  const ss = SpreadsheetApp.openById(SS_ID);
  SpreadsheetApp.flush();
  return {
    sync: { spreadsheetName: ss.getName(), spreadsheetId: ss.getId(), syncedAt: new Date().toISOString() },
    users: readSheet_(ss.getSheetByName(SHEETS.USERS)),
    buyers: readSheet_(ss.getSheetByName(SHEETS.BUYERS)),
    vehicles: readSheet_(ss.getSheetByName(SHEETS.VEHICLES)),
    master: readSheet_(ss.getSheetByName(SHEETS.MASTER)),
    lists: readSheet_(ss.getSheetByName(SHEETS.LISTS))
  };
}

function readSheet_(sh) {
  if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 1) return [];
  const values = sh.getDataRange().getDisplayValues();
  const headers = values.shift().map(h => String(h).trim());
  return values.filter(r => r.some(v => String(v).trim() !== '')).map(r => {
    const o = {};
    headers.forEach((h,i) => o[h] = String(r[i] == null ? '' : r[i]).trim());
    if (o.Status) o.Status = o.Status.toUpperCase();
    return o;
  });
}

function getDatabaseStatus() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const result = { spreadsheetName:ss.getName(), spreadsheetId:ss.getId(), sheets:{} };
  [SHEETS.USERS,SHEETS.BUYERS,SHEETS.VEHICLES,SHEETS.MASTER,SHEETS.LISTS].forEach(name => {
    const sh=ss.getSheetByName(name);
    result.sheets[name]=sh ? {rows:Math.max(0,sh.getLastRow()-1), columns:sh.getLastColumn()} : null;
  });
  return result;
}

function addBuyer(b) {
  validateBuyer_(b);
  const ss = SpreadsheetApp.openById(SS_ID);
  const sh = ss.getSheetByName(SHEETS.BUYERS);
  const dup = findDuplicateBuyer_(sh, b);
  if (dup) throw new Error('Possible duplicate buyer requirement already exists for ' + dup.Customer_Name + ' (' + dup.Buyer_ID + ').');
  const id = 'B' + Utilities.getUuid().slice(0,8).toUpperCase();
  appendObjectRow_(sh, {Buyer_ID:id,Customer_Name:b.name,Mobile:b.mobile,Vehicle_Type:b.vehicleType,Make:b.make,Model:b.model,Year_From:Number(b.y1),Year_To:Number(b.y2),Budget_From:Number(b.p1),Budget_To:Number(b.p2),Fuel:b.fuel,Transmission:b.trans,Location:b.loc,Added_By:b.user,Created_At:new Date(),Status:'ACTIVE'});
  return id;
}

function addVehicle(v) {
  validateVehicle_(v);
  const ss = SpreadsheetApp.openById(SS_ID);
  const sh = ss.getSheetByName(SHEETS.VEHICLES);
  const dup = findDuplicateVehicle_(sh, v);
  if (dup) throw new Error('Possible duplicate vehicle already exists: ' + dup.Make + ' ' + dup.Model + ' ' + dup.Year + ' (' + dup.Vehicle_ID + ').');
  const id = 'V' + Utilities.getUuid().slice(0,8).toUpperCase();
  appendObjectRow_(sh, {Vehicle_ID:id,Vehicle_Type:v.vehicleType,Make:v.make,Model:v.model,Year:Number(v.year),Price:Number(v.price),Fuel:v.fuel,Transmission:v.trans,Location:v.loc,Mobile:v.mobile || '',Added_By:v.user,Created_At:new Date(),Status:'AVAILABLE'});
  return id;
}

function updateVehicleStatus(id,status) {
  if (!['AVAILABLE','SOLD','INACTIVE'].includes(status)) throw new Error('Invalid vehicle status.');
  const sh = SpreadsheetApp.openById(SS_ID).getSheetByName(SHEETS.VEHICLES);
  const data = sh.getDataRange().getValues();
  const headers = data[0], idCol = headers.indexOf('Vehicle_ID'), statusCol = headers.indexOf('Status');
  for (let r=1;r<data.length;r++) {
    if (String(data[r][idCol])===String(id)) {
      sh.getRange(r+1,statusCol+1).setValue(status);
      return true;
    }
  }
  throw new Error('Vehicle not found.');
}

function updateBuyerStatus(id,status) {
  if (!['ACTIVE','CLOSED','INACTIVE'].includes(status)) throw new Error('Invalid buyer status.');
  const sh = SpreadsheetApp.openById(SS_ID).getSheetByName(SHEETS.BUYERS);
  const data = sh.getDataRange().getValues();
  const headers = data[0], idCol = headers.indexOf('Buyer_ID'), statusCol = headers.indexOf('Status');
  for (let r=1;r<data.length;r++) {
    if (String(data[r][idCol])===String(id)) {
      sh.getRange(r+1,statusCol+1).setValue(status);
      return true;
    }
  }
  throw new Error('Buyer not found.');
}

function findDuplicateVehicle_(sh,v) {
  if (sh.getLastRow() < 2) return null;
  const rows = readSheet_(sh);
  const make = norm_(v.make), model = norm_(v.model), year = Number(v.year), price = Number(v.price);
  return rows.find(x => norm_(x.Make)===make && norm_(x.Model)===model && Number(x.Year)===year && Math.abs(Number(x.Price)-price) <= Math.max(50000,price*0.01) && String(x.Status)==='AVAILABLE') || null;
}

function findDuplicateBuyer_(sh,b) {
  if (sh.getLastRow() < 2) return null;
  const rows = readSheet_(sh);
  return rows.find(x => String(x.Status)==='ACTIVE' && norm_(x.Mobile)===norm_(b.mobile) && norm_(x.Make)===norm_(b.make) && norm_(x.Model)===norm_(b.model)) || null;
}

function appendObjectRow_(sh, obj) { const headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String); sh.appendRow(headers.map(h => obj[h] !== undefined ? obj[h] : '')); }

function norm_(v) { return String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g,' '); }

function validateVehicle_(v) {
  if (!v.vehicleType || !v.make || !v.model || !v.year || !v.price || !v.mobile || !v.user) throw new Error('Please complete Make, Model, Year, Price and Added By.');
  if (Number(v.year) < 1980 || Number(v.year) > new Date().getFullYear()+1) throw new Error('Please enter a valid vehicle year.');
  if (Number(v.price) <= 0) throw new Error('Price must be greater than zero.');
}

function validateBuyer_(b) {
  if (!b.name || !b.mobile || !b.vehicleType || !b.make || !b.model || !b.y1 || !b.y2 || !b.p1 || !b.p2 || !b.user) throw new Error('Please complete the required buyer fields.');
  if (Number(b.y1) > Number(b.y2)) throw new Error('Year From cannot be greater than Year To.');
  if (Number(b.p1) > Number(b.p2)) throw new Error('Budget From cannot be greater than Budget To.');
}
