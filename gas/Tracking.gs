/** First-party analytics v2026-09-15.1. Deploy with Code.gs and Booking.html. */
const TRACK_VERSION_ = '2026-09-15.1';
const TRACK_KEYS_ = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','campaign_id','adset_id','ad_id'];
const REG_EXTRA_ = ['職業','record_id','visitor_id','session_id'].concat(TRACK_KEYS_,['page_url','referrer','device','user_agent','test_run_id']);
const FLOW_HEADERS_ = ['event_time','event_name','visitor_id','session_id','utm_source','utm_medium','utm_campaign','utm_content','fbclid','page_url','referrer','device','user_agent','record_id','utm_term','campaign_id','adset_id','ad_id','event_id','received_at','test_run_id'];
const DASH_NOTE_ = '依進站日期、session_id 去重；匿名訪客數依 visitor_id。每工作階段各階段最多 1 次；成功僅由後端寫入。來源採最後非直接來源，保留 7 天。';

function adminOnly_() {
  if (!Session.getActiveUser().getEmail() || Session.getActiveUser().getEmail() !== Session.getEffectiveUser().getEmail() || !SpreadsheetApp.getActiveSpreadsheet()) {
    throw new Error('請由試算表擁有者在 Apps Script 編輯器或試算表選單執行。');
  }
}

// Editor-visible installation entry. Anonymous google.script.run callers cannot pass adminOnly_.
function setupTracking() {
  adminOnly_();
  const active = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID',active.getId());
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try { ensureTracking_(active); } finally { lock.releaseLock(); }
  if (!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='refreshAnalytics_')) {
    ScriptApp.newTrigger('refreshAnalytics_').timeBased().everyMinutes(1).create();
  }
  PropertiesService.getScriptProperties().setProperty('TRACKING_INSTALLED_AT',new Date().toISOString());
  refreshAnalytics_(); onOpen();
  active.toast('追蹤初始化完成，每分鐘更新已啟用。請將網頁應用程式更新為新版本。','流量分析',10);
}
function updateTrafficDashboard() { adminOnly_(); refreshAnalytics_(); }

function ensureTracking_(ss) {
  const reg=ss.getSheetByName('報名名單'); assertHeaders_(reg);
  const current=reg.getRange(1,1,1,Math.max(reg.getLastColumn(),HEADERS_.length)).getValues()[0];
  const missing=REG_EXTRA_.filter(h=>current.indexOf(h)<0);
  if (missing.length) {
    const start=current.length+1;
    if (reg.getMaxColumns()<start+missing.length-1) reg.insertColumnsAfter(reg.getMaxColumns(),start+missing.length-1-reg.getMaxColumns());
    reg.getRange(1,start,1,missing.length).setValues([missing]).setFontWeight('bold').setBackground('#dbb879').setWrap(true);
  }
  let flow=ss.getSheetByName('流量紀錄');
  if (!flow) flow=ss.insertSheet('流量紀錄');
  if (!flow.getLastRow()) flow.getRange(1,1,1,FLOW_HEADERS_.length).setValues([FLOW_HEADERS_]);
  if (flow.getRange(1,1,1,FLOW_HEADERS_.length).getValues()[0].join('|')!==FLOW_HEADERS_.join('|')) throw new Error('流量紀錄欄位不符');
  flow.setFrozenRows(1);
  flow.getRange(1,1,1,FLOW_HEADERS_.length).setBackground('#dbb879').setFontWeight('bold').setWrap(true);
  flow.getRange('A:A').setNumberFormat('yyyy/mm/dd hh:mm:ss');
  flow.getRange('T:T').setNumberFormat('yyyy/mm/dd hh:mm:ss');
  if (!flow.getFilter()) flow.getRange(1,1,flow.getMaxRows(),FLOW_HEADERS_.length).createFilter();
  let dash=ss.getSheetByName('流量分析');
  if (!dash) dash=ss.insertSheet('流量分析');
  if (!dash.getLastRow()) {
    dash.getRange('A1').setValue('《再次成為神》台南特映｜流量分析');
    dash.getRange('A3:D3').setValues([['起日（今天或YYYY-MM-DD）','今天','迄日（今天或YYYY-MM-DD）','今天']]);
    dash.getRange('A4').setValue(DASH_NOTE_);
  }
  ss.setSpreadsheetTimeZone('Asia/Taipei');
}

function trackText_(v,n) { return typeof v==='string' ? v.replace(/[\u0000-\u001f]/g,'').slice(0,n) : ''; }
function trackingContext_(raw) {
  if (!raw || typeof raw!=='object' || Array.isArray(raw)) return null;
  if (!/^[A-Za-z0-9-]{20,80}$/.test(raw.visitor_id||'') || !/^[A-Za-z0-9-]{20,80}$/.test(raw.session_id||'')) return null;
  const c={visitor_id:raw.visitor_id,session_id:raw.session_id};
  TRACK_KEYS_.forEach(k=>{c[k]=trackText_(raw[k],k==='fbclid'?500:160);});
  c.utm_source=({fb:'facebook',ig:'instagram',an:'audience_network',msg:'messenger'})[c.utm_source] || c.utm_source || 'direct';
  c.utm_medium=c.utm_medium || 'none';
  c.page_url=safePageURL_(raw.page_url);
  c.referrer=(trackText_(raw.referrer,300).match(/^https?:\/\/[^/?#]+/)||[''])[0];
  c.device=['mobile','desktop','tablet'].indexOf(raw.device)>=0?raw.device:'unknown';
  c.user_agent=trackText_(raw.user_agent,500);
  c.test_run_id=/^qa_[a-zA-Z0-9_-]{3,76}$/.test(raw.test_run_id||'')?raw.test_run_id:'';
  return c;
}
function safePageURL_(value) {
  const s=trackText_(value,4000), m=s.match(/^(https?:\/\/[^/?#]+[^?#]*)(?:\?([^#]*))?/);
  if(!m) return '';
  const pairs=(m[2]||'').split('&').filter(x=>TRACK_KEYS_.indexOf(x.split('=')[0])>=0);
  return m[1]+(pairs.length?'?'+pairs.join('&'):'');
}
function decodeTracking_(params) {
  try { return trackingContext_(JSON.parse(String(params.tracking||'').slice(0,12000))); } catch (_) { return null; }
}
function trackingBootstrap_(e) {
  const p=(e&&e.parameter)||{};
  const parent=p.parent_origin==='https://socialimpactlab0.github.io'?p.parent_origin:'';
  return {version:TRACK_VERSION_,service_url:ScriptApp.getService().getUrl(),context:decodeTracking_(p),parent_origin:parent,
    bridge_id:/^[A-Za-z0-9-]{20,80}$/.test(p.bridge_id||'')?p.bridge_id:'',standalone:p.standalone==='1'};
}
function regExtraValues_(p,id) {
  const c=trackingContext_(p.tracking)||{};
  const value=Object.assign({},c,{'職業':p.occupation||'',record_id:id});
  return REG_EXTRA_.map(k=>cell_(value[k]||''));
}
function registrationRow_(sheet,p,id,now,fingerprint) {
  const base=[now,id,EVENT_.id,cell_(p.name),"'"+p.phone,p.ticketQty,cell_(p.contact),cell_(p.source),cell_(p.note),'已報名',p.requestId,fingerprint,EVENT_.consentVersion,now];
  const header=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  const extra=regExtraValues_(p,id);
  return header.map((h,i)=>i<HEADERS_.length?base[i]:REG_EXTRA_.indexOf(h)>=0?extra[REG_EXTRA_.indexOf(h)]:'');
}
function normalizeEvent_(input) {
  const c=trackingContext_(input);
  if (!c || ['page_view','registration_click','form_start'].indexOf(input.event_name)<0 || !/^[A-Za-z0-9-]{20,80}$/.test(input.event_id||'')) return null;
  const when=new Date(input.event_time);
  if (!Number.isFinite(when.getTime()) || when.getTime()>Date.now()+300000 || when.getTime()<Date.now()-8*86400000) return null;
  return Object.assign(c,{event_name:input.event_name,event_time:when,event_id:input.event_id,record_id:''});
}
function flowObject_(row) { const o={}; FLOW_HEADERS_.forEach((h,i)=>{o[h]=row[i];}); return o; }
function flowRows_(ss) {
  const sheet=ss.getSheetByName('流量紀錄');
  if (!sheet) throw new Error('請先執行 setupTracking');
  return sheet.getLastRow()<2?[]:sheet.getRange(2,1,sheet.getLastRow()-1,FLOW_HEADERS_.length).getValues().map(flowObject_);
}
function appendFlow_(ss,events,existing) {
  const rows=existing||flowRows_(ss);
  const seenIds=new Set(rows.map(x=>String(x.event_id)));
  const seenSteps=new Set(rows.map(x=>x.event_name==='registration_success'?'success:'+x.record_id:x.visitor_id+'|'+x.session_id+'|'+x.event_name));
  const accepted=[],add=[];
  events.forEach(e=>{
    const key=e.event_name==='registration_success'?'success:'+e.record_id:e.visitor_id+'|'+e.session_id+'|'+e.event_name;
    if (!seenIds.has(e.event_id) && !seenSteps.has(key)) {
      const o=Object.assign({},e,{received_at:new Date()});
      add.push(FLOW_HEADERS_.map(k=>o[k] instanceof Date?o[k]:cell_(o[k]||'')));
      seenIds.add(e.event_id); seenSteps.add(key);
    }
    accepted.push(e.event_id);
  });
  if (add.length) {
    const sheet=ss.getSheetByName('流量紀錄'), end=sheet.getLastRow()+add.length;
    if (end>sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),Math.max(1000,end-sheet.getMaxRows()));
    sheet.getRange(sheet.getLastRow()+1,1,add.length,FLOW_HEADERS_.length).setValues(add);
    SpreadsheetApp.flush();
  }
  return accepted;
}
function trackEvents(input) {
  if (!Array.isArray(input) || !input.length || input.length>10) return {ok:false,accepted:[]};
  const events=input.map(normalizeEvent_);
  if (events.some(x=>!x)) return {ok:false,accepted:[]};
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000)) return {ok:false,accepted:[]};
  try { return {ok:true,version:TRACK_VERSION_,accepted:appendFlow_(spreadsheet_(),events)}; }
  catch (_) { return {ok:false,accepted:[]}; }
  finally { lock.releaseLock(); }
}
function doPost(e) {
  let result={ok:false,accepted:[]};
  try {
    const content=e&&e.postData&&e.postData.contents;
    if(content && content.length<45000) { const p=JSON.parse(content); if(p.action==='track') result=trackEvents(p.events); }
  } catch (_) {}
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
function recordSuccess_(ss,row) {
  const sheet=ss.getSheetByName('報名名單');
  const header=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0], o={};
  header.forEach((k,i)=>{o[k]=row[i];});
  const c=trackingContext_(o); if(!c) return;
  appendFlow_(ss,[Object.assign(c,{event_name:'registration_success',event_time:new Date(row[0]),record_id:String(row[1]),event_id:'success-'+row[1]})]);
}
function repairSuccessEvents_(ss,events,regs,headers) {
  const recorded=new Set(events.filter(e=>e.event_name==='registration_success').map(e=>e.record_id));
  const missing=[];
  regs.forEach(row=>{
    if(String(row[2])!==EVENT_.id || recorded.has(String(row[1]))) return;
    const o={}; headers.forEach((h,i)=>{o[h]=row[i];}); const c=trackingContext_(o);
    if(c) missing.push(Object.assign(c,{event_name:'registration_success',event_time:new Date(row[0]),record_id:String(row[1]),event_id:'success-'+row[1]}));
  });
  if(missing.length) appendFlow_(ss,missing,events);
  return events.concat(missing);
}
function day_(value) { return Utilities.formatDate(new Date(value),'Asia/Taipei','yyyy-MM-dd'); }
function dashboardDate_(value,today) {
  if(value instanceof Date) return day_(value);
  const t=String(value||'').trim(); if(!t || t==='今天') return today;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(t) || !Number.isFinite(new Date(t).getTime())) throw new Error('日期請填「今天」或 YYYY-MM-DD');
  return t;
}
// Pure aggregation: no personal registration fields are copied to the dashboard.
function summarizeTraffic_(events,start,end) {
  const sessions=new Map();
  events.forEach(e=>{
    if(!e.session_id) return;
    const key=e.visitor_id+'|'+e.session_id;
    if(!sessions.has(key)) sessions.set(key,{context:e,steps:new Set(),time:null,records:new Set()});
    const s=sessions.get(key);
    s.steps.add(e.event_name);
    if(e.event_name==='page_view' && (!s.time || new Date(e.event_time)<new Date(s.time))) {s.time=e.event_time;s.context=e;}
    if(e.event_name==='registration_success' && e.record_id) s.records.add(e.record_id);
  });
  const list=Array.from(sessions.values()).filter(s=>s.time && day_(s.time)>=start && day_(s.time)<=end);
  const count=(name,subset=list)=>subset.filter(s=>s.steps.has(name)).length;
  const rate=(n,d)=>d?n/d:0;
  const total=[count('page_view'),count('registration_click'),count('form_start'),count('registration_success')];
  const joint=(a,b)=>list.filter(s=>s.steps.has(a)&&s.steps.has(b)).length;
  function group(keys) {
    const groups=new Map(); list.forEach(s=>{
      const values=keys.map(k=>String(s.context[k]||'(未標記)')), key=JSON.stringify(values);
      if(!groups.has(key)) groups.set(key,{values,list:[]}); groups.get(key).list.push(s);
    });
    return Array.from(groups.values()).map(g=>{
      const numbers=['page_view','registration_click','form_start','registration_success'].map(n=>count(n,g.list));
      return g.values.concat(numbers,[rate(numbers[3],numbers[0])]);
    }).sort((a,b)=>b[b.length-2]-a[a.length-2] || b[b.length-5]-a[a.length-5]);
  }
  return {total,visitors:new Set(list.map(s=>s.context.visitor_id)).size,
    rates:[rate(joint('page_view','registration_click'),total[0]),rate(joint('registration_click','form_start'),total[1]),rate(joint('form_start','registration_success'),total[2]),rate(total[3],total[0])],
    groups:[group(['utm_source','utm_campaign','utm_content']),group(['utm_source','utm_campaign','campaign_id']),group(['utm_campaign','utm_term','adset_id']),group(['utm_source','utm_medium']),group(['device'])]};
}
function refreshAnalytics_() {
  const lock=LockService.getScriptLock(); if(!lock.tryLock(1000)) return;
  try {
    const ss=spreadsheet_(),sheet=ss.getSheetByName('流量分析'); if(!sheet) return;
    const today=day_(new Date()), dates=sheet.getRange('A3:D3').getValues()[0];
    const start=dashboardDate_(dates[1],today),end=dashboardDate_(dates[3],today);
    if(start>end) throw new Error('起日不能晚於迄日');
    const reg=ss.getSheetByName('報名名單'),headers=reg.getRange(1,1,1,reg.getLastColumn()).getValues()[0];
    const regs=reg.getLastRow()<2?[]:reg.getRange(2,1,reg.getLastRow()-1,headers.length).getValues();
    const events=repairSuccessEvents_(ss,flowRows_(ss),regs,headers);
    const summary=summarizeTraffic_(events,start,end);
    const actual=regs.filter(r=>String(r[2])===EVENT_.id && day_(r[0])>=start && day_(r[0])<=end);
    const without=actual.filter(r=>!r[headers.indexOf('session_id')]).length;
    const blocks=[
      ['素材成效',['來源','活動','素材','進站','點報名','開始填表','完成報名','報名率']],
      ['廣告活動成效',['來源','活動','campaign_id','進站','點報名','開始填表','完成報名','報名率']],
      ['受眾／廣告組合成效',['活動','受眾 utm_term','adset_id','進站','點報名','開始填表','完成報名','報名率']],
      ['來源成效',['來源','媒介','進站','點報名','開始填表','完成報名','報名率']],
      ['裝置成效',['裝置','進站','點報名','開始填表','完成報名','報名率']]
    ];
    const output=[['進站工作階段','點報名','開始填表','完成報名工作階段','匿名訪客數'],summary.total.concat([summary.visitors]),
      ['報名點擊率','開始填表率','表單完成率','整體報名率'],summary.rates,
      ['本區間新增報名筆數',actual.length,'目前有效報名人數',actual.filter(r=>r[9]==='已報名').reduce((n,r)=>n+(Number(r[5])||0),0)],
      ['其中缺少歷史追蹤的報名',without,'本區間測試流量筆數',events.filter(e=>e.test_run_id&&day_(e.event_time)>=start&&day_(e.event_time)<=end).length],
      ['跨日完成歸於進站日；新增報名筆數依實際報名日。匿名識別碼代表瀏覽器，無法辨認跨裝置同一人。'],
      ['開始填表率＝點過報名且填表／點報名；表單完成率＝開始填表且成功／開始填表。直接捲至表單者不虛增點擊。'],[]];
    const positions=[];
    blocks.forEach((b,i)=>{
      output.push([b[0]],b[1]); positions.push({title:output.length-2,header:output.length-1,length:summary.groups[i].length,width:b[1].length});
      output.push(...(summary.groups[i].length?summary.groups[i]:[['尚無資料']]),[]);
    });
    if(output.length+5>sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),output.length+5-sheet.getMaxRows());
    const old=Math.max(sheet.getLastRow(),output.length+5); sheet.getRange(6,1,Math.max(1,old-5),8).breakApart().clearContent().clearFormat();
    sheet.getRange(6,1,output.length,8).setValues(output.map(r=>Array.from({length:8},(_,i)=>typeof r[i]==='string'?cell_(r[i]):r[i]===undefined?'':r[i]))).setFontSize(10).setVerticalAlignment('middle').setWrap(true);
    sheet.getRange('A1:H1').breakApart().merge().setValue('《再次成為神》台南特映｜流量分析').setFontWeight('bold').setFontSize(17).setBackground('#dbb879');
    sheet.getRange('A2:H2').breakApart().merge().setValue('統計區間 '+start+' ～ '+end+'｜最後更新 '+Utilities.formatDate(new Date(),'Asia/Taipei','yyyy/MM/dd HH:mm:ss')).setFontColor('#555555');
    sheet.getRange('A4:H4').breakApart().merge().setValue(DASH_NOTE_).setWrap(true);
    sheet.getRange('A5:H5').breakApart().merge().setValue('編輯 B3／D3 可改日期；「特映會報名」選單可立即更新。測試資料亦會計入，驗收後請依 test_run_id 清除。').setWrap(true);
    sheet.getRange('A3:D3').setWrap(true); sheet.getRange('B3').setBackground('#fff2cc'); sheet.getRange('D3').setBackground('#fff2cc');
    sheet.getRange('A6:E6').setBackground('#f0e3ca').setFontWeight('bold');
    sheet.getRange('A7:E7').setFontSize(24).setFontWeight('bold').setNumberFormat('0');
    sheet.getRange('A8:D8').setFontWeight('bold').setBackground('#eeeeee');
    sheet.getRange('A9:D9').setNumberFormat('0.0%').setFontSize(18);
    sheet.getRange('A12:H12').breakApart().merge(); sheet.getRange('A13:H13').breakApart().merge();
    positions.forEach(p=>{
      const row=p.title+6;
      sheet.getRange(row,1,1,8).setBackground('#f0e3ca').setFontWeight('bold');
      sheet.getRange(row+1,1,1,p.width).setBackground('#eeeeee').setFontWeight('bold');
      if(p.length) sheet.getRange(row+2,p.width,p.length,1).setNumberFormat('0.0%');
    });
    sheet.setColumnWidths(1,8,140); sheet.setRowHeight(1,34); sheet.setRowHeight(4,48); sheet.setRowHeight(5,40); sheet.setRowHeight(7,42); sheet.setFrozenRows(5);
    sheet.getRange('A14').setNote('每分鐘觸發器不是精確秒級排程；受 Google Apps Script 配額與排程延遲影響。');
    SpreadsheetApp.flush();
  } catch(error) { console.error('Analytics refresh failed: '+error.message); throw error; }
  finally { lock.releaseLock(); }
}

// Only deletes exact qa_ run IDs entered by the owner; never removes ordinary registrations.
function cleanupTrackingTest() {
  adminOnly_(); const ui=SpreadsheetApp.getUi();
  const prompt=ui.prompt('清除驗收測試','請貼上完整 test_run_id（qa_ 開頭）；只刪除這一次測試資料。',ui.ButtonSet.OK_CANCEL);
  if(prompt.getSelectedButton()!==ui.Button.OK) return;
  const id=prompt.getResponseText().trim(); if(!/^qa_[a-zA-Z0-9_-]{3,76}$/.test(id)) throw new Error('測試代碼格式不符');
  const ss=spreadsheet_(),lock=LockService.getScriptLock(); lock.waitLock(30000);
  try {
    ['報名名單','流量紀錄'].forEach(name=>{
      const sh=ss.getSheetByName(name),headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0],col=headers.indexOf('test_run_id')+1;
      if(col<1||sh.getLastRow()<2) return;
      const ids=sh.getRange(2,col,sh.getLastRow()-1,1).getValues();
      for(let i=ids.length-1;i>=0;i--) if(String(ids[i][0])===id) sh.deleteRow(i+2);
    });
  } finally {lock.releaseLock();}
  refreshAnalytics_(); ss.toast('指定測試資料已清除。');
}
