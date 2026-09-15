const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const core=require('../tracking.js');
const mem=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
let tests=0;
function test(name,fn){fn();tests++;console.log('PASS '+name)}
const now=Date.parse('2026-09-15T04:00:00Z');
const url='https://socialimpactlab0.github.io/once-we-were-divine-tainan/?utm_source=ig&utm_medium=paid_social&utm_campaign=0920_divine&utm_content=poster_a&utm_term=women45&adset_id=123';
const env={now,url,referrer:'',ua:'Mozilla Desktop',local:mem(),session:mem()};
let a=core.makeState(env);
test('IG normalized; IDs persist across refresh',()=>{const b=core.makeState({...env,now:now+1000});assert.equal(a.visitor_id,b.visitor_id);assert.equal(a.session_id,b.session_id);assert.equal(a.context.utm_source,'instagram')});
test('direct return retains source 7 days; new tab gets new session',()=>{const b=core.makeState({...env,now:now+86400000,url:url.split('?')[0],session:mem()});assert.equal(b.context.utm_content,'poster_a');assert.equal(b.visitor_id,a.visitor_id);assert.notEqual(b.session_id,a.session_id)});
test('new creative rotates session, not visitor',()=>{const b=core.makeState({...env,url:url.replace('poster_a','poster_b')});assert.notEqual(a.session_id,b.session_id);assert.equal(a.visitor_id,b.visitor_id)});
test('30-minute inactivity rotates session',()=>{const b=core.makeState({...env,now:now+31*60000});assert.notEqual(a.session_id,b.session_id)});
test('expired attribution becomes direct',()=>assert.equal(core.attribution(url.split('?')[0],'',{utm_source:'facebook',captured_at:now},now+8*86400000).utm_source,'direct'));
test('URLs remove name, phone, email and hash',()=>{const u=core.cleanURL(url+'&phone=0912000001&name=test#email');assert.ok(!/phone|name=test|email/.test(u))});
test('storage denied still permits page and registration context',()=>{const s=core.makeState({...env,local:null,session:null});assert.ok(s.visitor_id&&s.session_id)});
test('mobile and desktop distinguished',()=>{const s=core.makeState({...env,ua:'Mozilla Android Mobile',session:mem()});assert.equal(s.context.device,'mobile');assert.equal(a.context.device,'desktop')});

class Range {
 constructor(sh,r,c,h=1,w=1){Object.assign(this,{sh,r,c,h,w})}
 getValues(){return Array.from({length:this.h},(_,i)=>Array.from({length:this.w},(_,j)=>this.sh.data[this.r+i-1]?.[this.c+j-1]??''))}
 setValues(rows){if(this.sh.failWrite)throw Error('simulated Sheet write outage');assert.equal(rows.length,this.h);rows.forEach((row,i)=>{assert.equal(row.length,this.w);if(!this.sh.data[this.r+i-1])this.sh.data[this.r+i-1]=[];row.forEach((x,j)=>this.sh.data[this.r+i-1][this.c+j-1]=x)});return this}
 setValue(v){return this.setValues(Array.from({length:this.h},()=>Array.from({length:this.w},()=>v)))}
 clearContent(){return this.setValues(Array.from({length:this.h},()=>Array(this.w).fill('')))}
}
for(const n of ['setFontWeight','setBackground','setWrap','setNumberFormat','setFontSize','setVerticalAlignment','setFontColor','setNote','breakApart','merge','clearFormat'])Range.prototype[n]=function(){return this};
Range.prototype.createFilter=function(){this.sh.filter=true;return this};
function col(x){return [...x].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)}
class Sheet {
 constructor(name,data=[]){this.name=name;this.data=data;this.maxRows=1000;this.maxCols=26}
 getRange(r,c,h,w){if(typeof r==='string'){const m=r.match(/^([A-Z]+)(\d*)?(?::([A-Z]+)(\d*)?)?$/);if(!m)throw Error(r);const start=Number(m[2]||1),end=Number(m[4]||(m[3]?this.maxRows:start));return new Range(this,start,col(m[1]),end-start+1,col(m[3]||m[1])-col(m[1])+1)}return new Range(this,r,c,h,w)}
 getLastRow(){let n=this.data.length;while(n&&!this.data[n-1]?.some(x=>x!==''&&x!==undefined))n--;return n}
 getLastColumn(){return Math.max(0,...this.data.map(r=>r.length))}
 getMaxRows(){return this.maxRows}getMaxColumns(){return this.maxCols}
 insertRowsAfter(n,k){this.maxRows+=k;return this}insertColumnsAfter(n,k){this.maxCols+=k;return this}
 appendRow(row){if(this.failAppend)throw Error('simulated write outage');this.data.push(row);return this}
 getFilter(){return this.filter}deleteRow(r){this.data.splice(r-1,1)}
}
for(const n of ['setFrozenRows','setColumnWidth','setColumnWidths','setRowHeight','hideColumns'])Sheet.prototype[n]=function(){return this};
const sheets=new Map();
const ss={getId:()=> 'test-only',getSheetByName:n=>sheets.get(n)||null,insertSheet:n=>{const sh=new Sheet(n);sheets.set(n,sh);return sh},setSpreadsheetTimeZone:()=>{},toast:()=>{}};
let locked=false, props=new Map([['SPREADSHEET_ID','test-only']]);
const ctx=vm.createContext({console,Date,Set,Map,JSON,Object,Number,String,Array,Math,RegExp,
 Session:{getActiveUser:()=>({getEmail:()=>''}),getEffectiveUser:()=>({getEmail:()=> 'owner@example.com'})},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},
 LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true},waitLock:()=>{if(locked)throw Error('nested lock');locked=true},releaseLock:()=>{locked=false}})},
 SpreadsheetApp:{getActiveSpreadsheet:()=>ss,openById:()=>ss,flush:()=>{}},
 Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,t)=>[...crypto.createHash('sha256').update(t).digest()],formatDate:(d,tz,fmt)=>{const day=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d));return day}},
 ScriptApp:{getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/test/exec'})},
});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../gas/Code.gs'),'utf8')+'\n'+fs.readFileSync(require('node:path').join(__dirname,'../gas/Tracking.gs'),'utf8'),ctx);
const run=code=>vm.runInContext(code,ctx);
const headers=Array.from(run('HEADERS_'));
sheets.set('報名名單',new Sheet('報名名單',[headers.slice()]));
const defaults=run('DEFAULTS_.map(r=>Array.from(r))');
defaults.find(r=>r[0]==='closeAt')[1]='2099-09-20T13:30:00+08:00';
sheets.set('活動設定',new Sheet('活動設定',defaults));
ctx.testSS=ss;
run('ensureTracking_(testSS)');
const reg=sheets.get('報名名單'),flow=sheets.get('流量紀錄');
test('migration preserves legacy headers and adds 18 new columns',()=>{assert.deepEqual(reg.data[0].slice(0,14),headers);assert.equal(reg.data[0].length,32);run('ensureTracking_(testSS)');assert.equal(reg.data[0].length,32)});
const ev=name=>({...a.context,event_name:name,event_time:new Date().toISOString(),event_id:crypto.randomUUID()});
ctx.events=[ev('page_view'),ev('registration_click'),ev('form_start')];
test('three core events stored and duplicate retries acknowledged only once',()=>{assert.equal(run('trackEvents(events).ok'),true);assert.equal(run('trackEvents(events).ok'),true);assert.equal(flow.getLastRow(),4)});
ctx.duplicate=ev('page_view');test('new event ID for same session step still deduplicated',()=>{assert.equal(run('trackEvents([duplicate]).ok'),true);assert.equal(flow.getLastRow(),4)});
ctx.forged=ev('registration_success');test('browser cannot forge registration success',()=>assert.equal(run('trackEvents([forged]).ok'),false));
ctx.input={requestId:crypto.randomUUID(),eventId:'divine-tainan-20260920',name:'驗收測試',phone:'0912000001',ticketQty:1,contact:'',source:'',note:'',occupation:'測試',website:'',consent:true,tracking:a.context};
let receipt;
test('confirmed registration writes full linkage then success',()=>{receipt=run('submitRegistration(input)');assert.equal(receipt.ok,true);assert.equal(reg.getLastRow(),2);assert.equal(flow.getLastRow(),5);assert.equal(reg.data[1][reg.data[0].indexOf('session_id')],a.session_id);assert.equal(reg.data[1][reg.data[0].indexOf('record_id')],receipt.record_id);assert.equal(reg.data[1][4],"'0912000001")});
test('identical registration retry creates no extra row/event',()=>{assert.equal(run('submitRegistration(input).record_id'),receipt.record_id);assert.equal(reg.getLastRow(),2);assert.equal(flow.getLastRow(),5)});
test('same phone with new request is rejected',()=>{ctx.input={...ctx.input,requestId:crypto.randomUUID()};assert.equal(run('submitRegistration(input).ok'),false);assert.equal(reg.getLastRow(),2)});
test('anonymous callers cannot install triggers or delete data',()=>{assert.throws(()=>run('setupTracking()'));assert.throws(()=>run('cleanupTrackingTest()'))});
test('dashboard deduplication returns 1/1/1/1 and 100% rates',()=>{const stats=run('summarizeTraffic_(flowRows_(testSS),"2020-01-01","2099-01-01")');assert.deepEqual(Array.from(stats.total),[1,1,1,1]);assert.deepEqual(Array.from(stats.rates),[1,1,1,1]);assert.equal(stats.groups[0][0][2],'poster_a')});
test('missing success is reconstructed only from saved registrations',()=>{flow.data.pop();run('refreshAnalytics_()');assert.equal(flow.getLastRow(),5);assert.equal(sheets.get('流量分析').getLastRow()>30,true);run('refreshAnalytics_()');assert.equal(flow.getLastRow(),5)});
test('PII and sensitive query values never copied into anonymous events',()=>{const values=flow.data.flat().join('|');assert.ok(!values.includes('0912000001'));assert.ok(!values.includes('驗收測試'))});
test('legacy phone normalization retains duplicate protection',()=>assert.equal(run('phone_("912000001")'),'0912000001'));
test('failed registration write never creates success',()=>{
 const count=flow.getLastRow(),bookings=reg.getLastRow();
 ctx.input={...ctx.input,requestId:crypto.randomUUID(),phone:'0912000002'};
 reg.failAppend=true;
 assert.equal(run('submitRegistration(input).ok'),false);
 reg.failAppend=false;
 assert.equal(flow.getLastRow(),count);assert.equal(reg.getLastRow(),bookings);
});
test('success-log outage preserves booking; later refresh repairs exactly once',()=>{
 const count=flow.getLastRow(),bookings=reg.getLastRow();flow.failWrite=true;
 assert.equal(run('submitRegistration(input).ok'),true);
 assert.equal(reg.getLastRow(),bookings+1);assert.equal(flow.getLastRow(),count);
 flow.failWrite=false;run('refreshAnalytics_()');
 assert.equal(flow.getLastRow(),count+1);run('refreshAnalytics_()');assert.equal(flow.getLastRow(),count+1);
});
test('HTML inline scripts compile',()=>{for(const f of ['index.html','gas/Booking.html']){let html=fs.readFileSync(require('node:path').join(__dirname,'..',f),'utf8').replace('<?!= bootstrapJSON ?>','{}');for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1])}});
console.log(tests+' tests passed');
