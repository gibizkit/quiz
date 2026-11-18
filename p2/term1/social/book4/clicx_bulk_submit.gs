/**
 * CLICX - Bulk submit จากชีท Input (หลายแถว) → ปลายทางของฟอร์ม แบบ headless
 * แล้วเขียน Status / Message / Submitted At กลับลงแถวเดิม
 *
 * วิธีใช้สั้นๆ
 *   1. แก้ CONFIG ด้านล่าง
 *   2. รัน setup() หนึ่งครั้ง (สร้างแท็บ Input, Lists, dropdown และ trigger)
 *   3. กรอกตัวเลือก dropdown ในแท็บ Lists → เมนู CLICX > อัปเดต dropdown
 *   4. กรอกข้อมูลในแท็บ Input แล้วรอ trigger หรือกดเมนู CLICX > ส่งข้อมูลตอนนี้
 */

const CONFIG = {
  INPUT_SHEET_ID: '',            // ว่าง = ใช้ไฟล์ Google Sheet ที่ script นี้ผูกอยู่
  INPUT_TAB: 'Input',
  LISTS_TAB: 'Lists',

  // 'SHEET'    = เขียนลงชีทปลายทางของฟอร์มตรงๆ (script นี้อยู่ที่ไหนก็ได้ ขอแค่มีสิทธิ์แก้ชีทปลายทาง)
  // 'FUNCTION' = เรียกฟังก์ชันบันทึกของฟอร์มเอง (ต้องวางไฟล์นี้ไว้ใน Apps Script project เดียวกับฟอร์ม)
  MODE: 'SHEET',

  TARGET_SHEET_ID: 'PUT_TARGET_SHEET_ID_HERE', // ID จากลิงก์ "เปิด Google Sheet" ในหน้าฟอร์ม
  TARGET_TAB: 'Sheet1',
  SAVE_FUNCTION: 'saveData',     // ชื่อฟังก์ชันที่ฟอร์มเรียกผ่าน google.script.run (โหมด FUNCTION)

  DATE_FORMAT: 'yyyy-MM-dd',     // รูปแบบเดียวกับที่ <input type="date"> ส่งมา
  BATCH_SIZE: 100,               // จำนวนแถวต่อรอบ (Apps Script รันได้สูงสุด ~6 นาที/รอบ)
  SKIP_DUPLICATE_CID: true,      // โหมด SHEET: ข้ามถ้า CID นี้มีในชีทปลายทางแล้ว
  TRIGGER_MINUTES: 15,           // 1, 5, 10, 15 หรือ 30
};

// header = หัวคอลัมน์ในแท็บ Input (ควรตรงกับหัวคอลัมน์ในชีทปลายทาง)
// key    = ชื่อ field ที่ส่งให้ฟังก์ชันของฟอร์ม (โหมด FUNCTION) ให้แก้ตาม name/id ในฟอร์มจริง
const FIELDS = [
  { header: 'Scene',           key: 'scene',          type: 'list' },
  { header: 'Product',         key: 'product',        type: 'list' },
  { header: 'CID',             key: 'cid',            type: 'text' },
  { header: 'CCD_ID',          key: 'ccdId',          type: 'text' },
  { header: 'Customer Type',   key: 'customerType',   type: 'list' },
  { header: 'Occupation Type', key: 'occupationType', type: 'list' },
  { header: 'Gender',          key: 'gender',         type: 'list' },
  { header: 'Birth Date',      key: 'birthDate',      type: 'date' },
  { header: 'Mobile No',       key: 'mobileNo',       type: 'mobile' },
  { header: 'Mobile Brand',    key: 'mobileBrand',    type: 'list' },
  { header: 'Mobile Model',    key: 'mobileModel',    type: 'list' },
];

const STATUS_HEADERS = ['Status', 'Message', 'Submitted At'];
const RUNNABLE_STATUS = ['', 'Pending', 'Retry'];
const TIMESTAMP_HEADERS = ['timestamp', 'created at', 'submitted at', 'วันที่บันทึก'];
const MAX_INPUT_ROWS = 2000;

/* ---------------- เมนู / setup ---------------- */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CLICX')
    .addItem('ส่งข้อมูลตอนนี้', 'processPending')
    .addItem('อัปเดต dropdown', 'applyValidation')
    .addSeparator()
    .addItem('Setup (สร้างแท็บ + trigger)', 'setup')
    .addToUi();
}

function setup() {
  const ss = getInputSpreadsheet_();

  let input = ss.getSheetByName(CONFIG.INPUT_TAB);
  if (!input) input = ss.insertSheet(CONFIG.INPUT_TAB);
  const headers = FIELDS.map(f => f.header).concat(STATUS_HEADERS);
  input.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  input.setFrozenRows(1);

  // กันเลข 0 นำหน้าหาย และกัน CID ยาวๆ กลายเป็น 1.23E+12
  FIELDS.forEach((f, i) => {
    const col = input.getRange(2, i + 1, MAX_INPUT_ROWS, 1);
    if (f.type === 'text' || f.type === 'mobile') col.setNumberFormat('@');
    if (f.type === 'date') col.setNumberFormat('dd/mm/yyyy');
  });
  input.getRange(2, FIELDS.length + 3, MAX_INPUT_ROWS, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');

  let lists = ss.getSheetByName(CONFIG.LISTS_TAB);
  if (!lists) {
    lists = ss.insertSheet(CONFIG.LISTS_TAB);
    const listHeaders = FIELDS.filter(f => f.type === 'list').map(f => f.header);
    lists.getRange(1, 1, 1, listHeaders.length).setValues([listHeaders]).setFontWeight('bold');
    lists.setFrozenRows(1);
  }

  applyValidation();
  installTrigger_();
}

function applyValidation() {
  const ss = getInputSpreadsheet_();
  const input = ss.getSheetByName(CONFIG.INPUT_TAB);
  const lists = ss.getSheetByName(CONFIG.LISTS_TAB);
  const listHeaders = lists.getRange(1, 1, 1, Math.max(lists.getLastColumn(), 1)).getValues()[0];

  FIELDS.forEach((f, i) => {
    if (f.type !== 'list') return;
    const listCol = listHeaders.indexOf(f.header) + 1;
    if (!listCol) return;
    const source = lists.getRange(2, listCol, MAX_INPUT_ROWS, 1);
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(source, true)
      .setAllowInvalid(false)
      .build();
    input.getRange(2, i + 1, MAX_INPUT_ROWS, 1).setDataValidation(rule);
  });

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pending', 'Retry', 'Done', 'Error', 'Duplicate'], true)
    .setAllowInvalid(true)
    .build();
  input.getRange(2, FIELDS.length + 1, MAX_INPUT_ROWS, 1).setDataValidation(statusRule);
}

function installTrigger_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'processPending')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('processPending').timeBased().everyMinutes(CONFIG.TRIGGER_MINUTES).create();
}

/* ---------------- งานหลัก ---------------- */

function processPending() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return; // รอบก่อนยังรันไม่เสร็จ

  try {
    const ss = getInputSpreadsheet_();
    const input = ss.getSheetByName(CONFIG.INPUT_TAB);
    const lastRow = input.getLastRow();
    if (lastRow < 2) return;

    const width = FIELDS.length + STATUS_HEADERS.length;
    const rows = input.getRange(2, 1, lastRow - 1, width).getValues();
    const allowed = readAllowedValues_(ss);
    const target = CONFIG.MODE === 'SHEET' ? openTarget_() : null;
    const statusCol = FIELDS.length + 1;
    let processed = 0;

    for (let i = 0; i < rows.length && processed < CONFIG.BATCH_SIZE; i++) {
      const row = rows[i];
      const fieldValues = row.slice(0, FIELDS.length);
      const status = String(row[FIELDS.length]).trim();
      if (fieldValues.every(v => v === '')) continue;
      if (RUNNABLE_STATUS.indexOf(status) === -1) continue;

      let result;
      try {
        const record = buildRecord_(fieldValues, allowed);
        if (target && CONFIG.SKIP_DUPLICATE_CID && target.cids.has(record.cid)) {
          result = ['Duplicate', 'CID นี้มีในชีทปลายทางแล้ว'];
        } else {
          submit_(record, target);
          result = ['Done', ''];
        }
      } catch (e) {
        result = ['Error', e.message];
      }

      input.getRange(i + 2, statusCol, 1, 3).setValues([[result[0], result[1], new Date()]]);
      processed++;
    }
  } finally {
    lock.releaseLock();
  }
}

function buildRecord_(values, allowed) {
  const record = {};
  const errors = [];

  FIELDS.forEach((f, i) => {
    let v = values[i];
    if (v === '' || v === null) {
      errors.push(f.header + ' ว่าง');
      return;
    }

    if (f.type === 'date') {
      v = toDate_(v);
      if (!v) return errors.push(f.header + ' ไม่ใช่วันที่ (ใช้ dd/mm/yyyy)');
      v = Utilities.formatDate(v, Session.getScriptTimeZone(), CONFIG.DATE_FORMAT);
    } else if (f.type === 'mobile') {
      v = String(v).replace(/\D/g, '');
      if (v.length === 9) v = '0' + v; // ชีทตัด 0 นำหน้าทิ้ง
      if (!/^0\d{9}$/.test(v)) return errors.push(f.header + ' ต้องเป็นเลข 10 หลักขึ้นต้นด้วย 0');
    } else {
      v = String(v).trim();
      if (f.type === 'list' && allowed[f.header] && allowed[f.header].length &&
          allowed[f.header].indexOf(v) === -1) {
        return errors.push(f.header + ' "' + v + '" ไม่อยู่ในตัวเลือก');
      }
    }
    record[f.key] = v;
  });

  if (errors.length) throw new Error(errors.join(', '));
  return record;
}

function submit_(record, target) {
  if (CONFIG.MODE === 'FUNCTION') {
    const fn = globalThis[CONFIG.SAVE_FUNCTION];
    if (typeof fn !== 'function') {
      throw new Error('ไม่พบฟังก์ชัน ' + CONFIG.SAVE_FUNCTION + ' ใน project นี้');
    }
    const res = fn(record);
    if (res && res.success === false) throw new Error(res.message || 'ฟังก์ชันบันทึกตอบกลับว่าไม่สำเร็จ');
    return;
  }

  // โหมด SHEET: วางค่าตามชื่อหัวคอลัมน์ของชีทปลายทาง ไม่ขึ้นกับลำดับคอลัมน์
  const out = target.headers.map(h => {
    const name = normalize_(h);
    const field = FIELDS.find(f => normalize_(f.header) === name);
    if (field) return field.type === 'text' || field.type === 'mobile' ? "'" + record[field.key] : record[field.key];
    if (TIMESTAMP_HEADERS.indexOf(name) !== -1) return new Date();
    return '';
  });
  target.sheet.appendRow(out);
  target.cids.add(record.cid);
}

/* ---------------- helpers ---------------- */

function getInputSpreadsheet_() {
  return CONFIG.INPUT_SHEET_ID
    ? SpreadsheetApp.openById(CONFIG.INPUT_SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function openTarget_() {
  const sheet = SpreadsheetApp.openById(CONFIG.TARGET_SHEET_ID).getSheetByName(CONFIG.TARGET_TAB);
  if (!sheet) throw new Error('ไม่พบแท็บ ' + CONFIG.TARGET_TAB + ' ในชีทปลายทาง');

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const matched = headers.filter(h => FIELDS.some(f => normalize_(f.header) === normalize_(h)));
  if (!matched.length) throw new Error('หัวคอลัมน์ชีทปลายทางไม่ตรงกับ FIELDS เลย ตรวจ TARGET_TAB');

  const cids = new Set();
  const cidCol = headers.findIndex(h => normalize_(h) === 'cid');
  if (cidCol !== -1 && sheet.getLastRow() > 1) {
    sheet.getRange(2, cidCol + 1, sheet.getLastRow() - 1, 1).getValues()
      .forEach(r => cids.add(String(r[0]).trim()));
  }
  return { sheet, headers, cids };
}

function readAllowedValues_(ss) {
  const lists = ss.getSheetByName(CONFIG.LISTS_TAB);
  const allowed = {};
  if (!lists || lists.getLastRow() < 2) return allowed;

  const data = lists.getDataRange().getValues();
  data[0].forEach((h, c) => {
    allowed[h] = data.slice(1).map(r => String(r[c]).trim()).filter(v => v !== '');
  });
  return allowed;
}

function toDate_(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year > 2400) year -= 543; // ปี พ.ศ.
  return new Date(year, Number(m[2]) - 1, Number(m[1]));
}

function normalize_(s) {
  return String(s).trim().toLowerCase();
}
