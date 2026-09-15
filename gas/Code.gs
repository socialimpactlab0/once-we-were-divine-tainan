/**
 * 《再次成為神》台南特映會｜Google 試算表綁定式 Apps Script
 * 從試算表開啟 Apps Script，貼上本檔、建立 Booking.html，儲存後重新整理試算表。
 * 使用「特映會報名 → 初始化報名系統」執行 setup_，不使用編輯器下拉選單。
 * 初始化與輔助函式保留 _ 結尾，不開放 google.script.run 呼叫；onOpen 僅建立選單。
 */
const EVENT_ = Object.freeze({
  id: 'divine-tainan-20260920',
  name: '電影《再次成為神》特映會',
  date: '2026/9/20（日）',
  time: '下午 1:30 放映｜1:00 開放入場',
  venue: '台南市勞工育樂中心',
  address: '臺南市南區南門路261號',
  distributor: '雄獅影視',
  priceText: '特映價150元（原價250元）；現場付款',
  organizer: '雄獅影視',
  contactText: '陳小姐 0930-885-835',
  consentVersion: '2026-09-event-contact-v1'
});
const HEADERS_ = ['建立時間', '報名編號', '活動代碼', '姓名', '聯絡電話', '人數', 'LINE或Email', '訊息來源', '備註', '狀態', '請求碼', '內容指紋', '同意版本', '更新時間'];
const DEFAULTS_ = [
  ['設定鍵', '設定值', '說明'],
  ['registrationEnabled', true, 'TRUE 開放；FALSE 暫停。仍受截止時間及名額限制。'],
  ['capacity', 0, '後台總人數上限；0 不設自動上限。頁面不顯示總名額，可依實際座位修改。'],
  ['maxTickets', 2, '每筆可報名人數，1–20。預設 2，可調整。'],
  ['closeAt', '2026-09-20T13:30:00+08:00', '截止時間，須保留 +08:00 時區；預設開演時截止，可修改。'],
  ['priceText', EVENT_.priceText, '已確認每人 150 元、現場付款。本程式不處理線上收款，也不寄送電子票。'],
  ['organizer', EVENT_.organizer, '本場主辦單位名稱。'],
  ['contactText', EVENT_.contactText, '本場聯絡窗口，供報名修改或取消使用。']
];

// 只建立試算表的管理選單，不在開啟試算表時自動初始化或更動報名資料。
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('特映會報名')
    .addItem('初始化報名系統', 'setup_')
    .addItem('啟用完整追蹤與每分鐘更新', 'setupTracking')
    .addItem('立即更新流量分析', 'updateTrafficDashboard')
    .addItem('清除指定驗收測試', 'cleanupTrackingTest')
    .addToUi();
}

function setup_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('請從 Google 試算表的「擴充功能 → Apps Script」建立此專案。');
    let sheet = ss.getSheetByName('報名名單');
    if (!sheet) sheet = ss.insertSheet('報名名單');
    if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, HEADERS_.length).setValues([HEADERS_]);
    assertHeaders_(sheet);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS_.length).setFontWeight('bold').setBackground('#dbb879');
    sheet.getRange('E:E').setNumberFormat('@');
    sheet.getRange('A:A').setNumberFormat('yyyy/mm/dd hh:mm:ss');
    sheet.getRange('N:N').setNumberFormat('yyyy/mm/dd hh:mm:ss');
    sheet.hideColumns(11, 3);
    let config = ss.getSheetByName('活動設定');
    if (!config) config = ss.insertSheet('活動設定');
    if (config.getLastRow() === 0) {
      config.getRange(1, 1, DEFAULTS_.length, 3).setValues(DEFAULTS_);
      config.setFrozenRows(1);
      config.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#dbb879');
      config.setColumnWidth(1, 180);
      config.setColumnWidth(2, 280);
      config.setColumnWidth(3, 470);
    }
    // 升級舊版待公布的付款文字與空白主辦、聯絡欄；保留既有名單、名額及其他自訂設定。
    const configRows = config.getRange(2, 1, config.getLastRow() - 1, 2).getValues();
    configRows.forEach((row, index) => {
      const key = String(row[0]);
      if (['priceText', 'organizer', 'contactText'].indexOf(key) >= 0) {
        const updated = eventSetting_(key, row[1]);
        if (String(row[1]) !== updated) config.getRange(index + 2, 2, 1, 1).setValues([[updated]]);
      }
    });
    ss.setSpreadsheetTimeZone('Asia/Taipei');
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
    SpreadsheetApp.flush();
    ss.toast('初始化完成。請檢查「活動設定」，再部署網頁應用程式。', '特映會報名', 10);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Booking');
  template.bootstrapJSON = JSON.stringify(trackingBootstrap_(e)).replace(/</g, '\\u003c');
  return template.evaluate()
    .setTitle(EVENT_.name + '｜報名')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getPublicEvent() {
  try {
    const ss = spreadsheet_();
    const config = settings_(ss);
    const rows = rows_(ss);
    const remaining = config.capacity === 0 ? null : Math.max(0, config.capacity - usedSeats_(rows));
    const closed = closedMessage_(config, remaining);
    return {ok: true, event: publicEvent_(config), open: !closed, message: closed,
      maxTickets: config.maxTickets, remaining: remaining, trackingVersion: TRACK_VERSION_};
  } catch (error) {
    return {ok: false, message: '報名系統暫時無法使用，請稍後重試或聯絡主辦單位。'};
  }
}

function submitRegistration(input) {
  let p;
  try { p = validate_(input); }
  catch (error) { return {ok: false, message: error.message}; }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return {ok: false, retry: true, message: '報名人數較多，請按「再次確認」；會以同一筆資料重試。'};
  try {
    const ss = spreadsheet_();
    const config = settings_(ss);
    const sheet = ss.getSheetByName('報名名單');
    if (sheet.getLastColumn() < HEADERS_.length + REG_EXTRA_.length) ensureTracking_(ss);
    const rows = rows_(ss);
    const fingerprint = fingerprint_(p);
    const previous = rows.find(r => String(r[10]) === p.requestId && String(r[2]) === EVENT_.id);
    // 先判斷重試，再判斷截止與名額；已成功的同筆請求不會再占一席。
    if (previous) {
      if (String(previous[11]) !== fingerprint) return {ok: false, message: '這筆送出識別碼已被使用，請重新整理報名表。'};
      if (String(previous[9]).trim() !== '已報名') return {ok: false, message: '這筆報名已取消或狀態已變更，請聯絡主辦單位確認。'};
      const rowIndex = rows.indexOf(previous) + 2;
      try { recordSuccess_(ss, sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0]); } catch (_) { console.warn('Success event pending repair'); }
      return receipt_(String(previous[1]), Number(previous[5]), config);
    }
    const remaining = config.capacity === 0 ? null : Math.max(0, config.capacity - usedSeats_(rows));
    const closed = closedMessage_(config, remaining);
    if (closed) return {ok: false, message: closed};
    if (p.ticketQty > config.maxTickets) return {ok: false, message: '每筆最多可報名 ' + config.maxTickets + ' 位，請調整人數。'};
    if (rows.some(r => String(r[2]) === EVENT_.id && String(r[9]).trim() === '已報名' && phone_(String(r[4])) === p.phone)) {
      return {ok: false, message: '此電話已完成報名。如需修改人數或取消，請聯絡主辦單位，勿重複報名。'};
    }
    if (remaining !== null && p.ticketQty > remaining) return {ok: false, message: '剩餘名額不足，請減少人數或聯絡主辦單位。'};
    let bookingId;
    do { bookingId = 'TN0920-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(); }
    while (rows.some(r => String(r[1]) === bookingId));
    const now = new Date();
    const savedRow = registrationRow_(sheet, p, bookingId, now, fingerprint);
    sheet.appendRow(savedRow);
    SpreadsheetApp.flush();
    // A tracking outage never reverses an already committed registration. The minute job repairs the event.
    try { recordSuccess_(ss, savedRow); } catch (_) { console.warn('Success event pending repair'); }
    return receipt_(bookingId, p.ticketQty, config);
  } catch (error) {
    // 不回傳內部錯誤或個資；保留原請求碼，處理已寫入但回應中斷的情況。
    return {ok: false, retry: true, message: '目前尚無法確認結果。請按「再次確認」，系統會核對同一筆報名，避免重複建立。'};
  } finally {
    lock.releaseLock();
  }
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('尚未初始化');
  return SpreadsheetApp.openById(id);
}

function settings_(ss) {
  const sheet = ss.getSheetByName('活動設定');
  if (!sheet || sheet.getLastRow() < DEFAULTS_.length) throw new Error('活動設定不完整');
  const data = {};
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(r => { data[String(r[0])] = r[1]; });
  const capacity = Number(data.capacity), maxTickets = Number(data.maxTickets);
  if (data.capacity === '' || !Number.isInteger(capacity) || capacity < 0 || capacity > 100000) throw new Error('名額設定錯誤');
  if (!Number.isInteger(maxTickets) || maxTickets < 1 || maxTickets > 20) throw new Error('每筆人數設定錯誤');
  const closeText = String(data.closeAt || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(closeText)) throw new Error('截止時間格式錯誤');
  const closeAt = new Date(closeText).getTime();
  if (!Number.isFinite(closeAt)) throw new Error('截止時間錯誤');
  return {enabled: String(data.registrationEnabled).toLowerCase() === 'true', capacity: capacity,
    maxTickets: maxTickets, closeAt: closeAt, priceText: priceText_(data.priceText),
    organizer: eventSetting_('organizer', data.organizer), contactText: eventSetting_('contactText', data.contactText)};
}

function priceText_(value) {
  const text = String(value || '').trim();
  return ['', '票價與付款方式待公布', '票價待公布', '票價 150 元／人；付款方式待公布'].indexOf(text) >= 0
    ? EVENT_.priceText : text.slice(0, 300);
}

function eventSetting_(key, value) {
  if (key === 'priceText') return priceText_(value);
  const text = String(value || '').trim();
  return (text || EVENT_[key]).slice(0, key === 'organizer' ? 100 : 300);
}

function contactPhone_(text) {
  const match = String(text).match(/(?:^|[^0-9])(09[0-9]{2}[-\s]?[0-9]{3}[-\s]?[0-9]{3})(?![0-9])/);
  return match ? match[1].replace(/[^0-9]/g, '') : '';
}

function assertHeaders_(sheet) {
  if (!sheet || sheet.getRange(1, 1, 1, HEADERS_.length).getValues()[0].join('|') !== HEADERS_.join('|')) throw new Error('報名名單欄位已變更');
}

function rows_(ss) {
  const sheet = ss.getSheetByName('報名名單');
  assertHeaders_(sheet);
  return sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS_.length).getValues();
}

function usedSeats_(rows) {
  return rows.reduce((sum, r) => sum + (String(r[2]) === EVENT_.id && String(r[9]).trim() === '已報名' ? Number(r[5]) || 0 : 0), 0);
}

function closedMessage_(config, remaining) {
  if (!config.enabled) return '目前暫停報名，請留意主辦單位公告。';
  if (Date.now() >= config.closeAt) return '本場報名已截止，感謝你的關注。';
  if (remaining === 0) return '本場名額已滿，感謝你的關注。';
  return '';
}

function publicEvent_(config) {
  return {id: EVENT_.id, name: EVENT_.name, date: EVENT_.date, time: EVENT_.time,
    venue: EVENT_.venue, address: EVENT_.address, priceText: config.priceText, distributor: EVENT_.distributor,
    organizer: config.organizer, contactText: config.contactText, contactPhone: contactPhone_(config.contactText)};
}

function receipt_(bookingId, ticketQty, config) {
  return {ok: true, bookingId: bookingId, record_id: bookingId, ticketQty: ticketQty, event: publicEvent_(config)};
}

function text_(value, limit, required) {
  if (typeof value !== 'string' || value.length > limit) throw new Error('資料格式不正確或文字過長，請檢查後重試。');
  const cleaned = value.trim();
  if (required && !cleaned) throw new Error('請填寫所有必填欄位。');
  return cleaned;
}

function phone_(value) {
  let p = value.replace(/[\s()\-－]/g, '').replace(/^'/, '');
  if (p.indexOf('+886') === 0) p = '0' + p.slice(4).replace(/^0/, '');
  if (/^[2-9]\d{7,8}$/.test(p)) p = '0' + p; // Recover legacy numeric phone cells for duplicate detection.
  return p;
}

function validate_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('請重新開啟報名表。');
  if (input.eventId !== EVENT_.id) throw new Error('場次不符，請重新整理報名表。');
  if (input.website) throw new Error('無法送出，請重新開啟報名表。');
  if (input.consent !== true) throw new Error('請先同意將資料用於本次報名與活動聯繫。');
  const requestId = text_(input.requestId, 80, true);
  if (!/^[a-zA-Z0-9-]{20,80}$/.test(requestId)) throw new Error('送出識別碼不正確，請重新整理。');
  const phone = phone_(text_(input.phone, 30, true));
  if (!/^(09\d{8}|0[2-8]\d{7,8})$/.test(phone)) throw new Error('請填寫有效的臺灣手機或含區碼的市話號碼。');
  if (!Number.isInteger(input.ticketQty) || input.ticketQty < 1 || input.ticketQty > 20) throw new Error('請選擇有效的報名人數。');
  return {requestId: requestId, eventId: EVENT_.id, name: text_(input.name, 60, true), phone: phone,
    ticketQty: input.ticketQty, contact: text_(input.contact, 150, false), source: text_(input.source, 60, false),
    note: text_(input.note, 500, false), occupation: text_(input.occupation || '', 80, false), tracking: trackingContext_(input.tracking)};
}

function fingerprint_(p) {
  const text = JSON.stringify([p.eventId, p.name, p.phone, p.ticketQty, p.contact, p.source, p.note, EVENT_.consentVersion]);
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

function cell_(value) {
  const s = String(value);
  return /^[=+\-@\t\r\n]/.test(s) ? "'" + s : s;
}
