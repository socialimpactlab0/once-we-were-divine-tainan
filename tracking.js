/* First-party event tracking. No names, phone numbers or form values enter this module. */
(function (root) {
  'use strict';
  const PREFIX = 'divine0920:v1:';
  const TTL = 7 * 86400000;
  const IDLE = 30 * 60000;
  const KEYS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','campaign_id','adset_id','ad_id'];
  const EVENTS = ['page_view','registration_click','form_start'];
  function read(store, key, fallback) { try { return JSON.parse(store.getItem(PREFIX + key)) || fallback; } catch (_) { return fallback; } }
  function write(store, key, value) { try { store.setItem(PREFIX + key, JSON.stringify(value)); } catch (_) {} }
  function uuid() { return root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
  function sourceName(value) { const s = String(value || '').toLowerCase(); return ({fb:'facebook',ig:'instagram',an:'audience_network',msg:'messenger'})[s] || s; }
  function cleanURL(value) {
    try { const u = new URL(value); if (!/^https?:$/.test(u.protocol)) return ''; const q = new URLSearchParams(); KEYS.forEach(k => { if (u.searchParams.has(k)) q.set(k, u.searchParams.get(k).slice(0, k === 'fbclid' ? 500 : 160)); }); return u.origin + u.pathname + (q.size ? '?' + q : ''); } catch (_) { return ''; }
  }
  function refOrigin(value) { try { return new URL(value).origin; } catch (_) { return ''; } }
  function attribution(url, referrer, prior, now) {
    const u = new URL(url), supplied = KEYS.some(k => u.searchParams.has(k));
    if (supplied) {
      const a = {}; KEYS.forEach(k => { a[k] = (u.searchParams.get(k) || '').slice(0, k === 'fbclid' ? 500 : 160); });
      a.utm_source = sourceName(a.utm_source) || (a.fbclid ? 'meta_unknown' : 'unknown');
      a.utm_medium = a.utm_medium || (a.fbclid ? 'social' : 'unknown');
      a.captured_at = now; return a;
    }
    const ref = refOrigin(referrer);
    if (ref && ref !== u.origin && !/googleusercontent\.com$/.test(new URL(ref).hostname)) {
      const h = new URL(ref).hostname;
      const social = /(^|\.)facebook\.com$/.test(h) ? 'facebook' : /(^|\.)instagram\.com$/.test(h) ? 'instagram' : '';
      return Object.assign(Object.fromEntries(KEYS.map(k => [k,''])), {utm_source:social || h, utm_medium:social ? 'organic_social' : 'referral',captured_at:now});
    }
    if (prior && now - prior.captured_at < TTL) return prior;
    return Object.assign(Object.fromEntries(KEYS.map(k => [k,''])), {utm_source:'direct',utm_medium:'none',captured_at:now});
  }
  function makeState(env) {
    const now = env.now, previous = read(env.local, 'attribution', null);
    let visitor = read(env.local, 'visitor', null);
    if (!visitor) { visitor = uuid(); write(env.local, 'visitor', visitor); }
    const attr = attribution(env.url, env.referrer, previous, now);
    if (attr.utm_source !== 'direct') write(env.local, 'attribution', attr);
    const signature = JSON.stringify(KEYS.map(k => attr[k] || '').concat(new URL(env.url).searchParams.get('test_run_id') || ''));
    let state = read(env.session, 'session', null);
    if (!state || now - state.last_seen > IDLE || state.signature !== signature) {
      const u = new URL(env.url);
      state = {visitor_id:visitor, session_id:uuid(), signature, last_seen:now, sent:{},
        context:Object.assign({},attr,{visitor_id:visitor,session_id:'',page_url:cleanURL(env.url),referrer:refOrigin(env.referrer),
          device:/iPad|Tablet|Android(?!.*Mobile)/i.test(env.ua) ? 'tablet' : /Mobile|iPhone|Android/i.test(env.ua) ? 'mobile' : 'desktop',
          user_agent:env.ua.slice(0,500),test_run_id:(u.searchParams.get('test_run_id') || '').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80)})};
      state.context.session_id = state.session_id;
    }
    state.last_seen = now; write(env.session, 'session', state); return state;
  }
  const core = {attribution, makeState, cleanURL, sourceName, TTL, IDLE};
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (!root.document) return;
  let local, session;
  try { local = root.localStorage; } catch (_) { local = null; }
  try { session = root.sessionStorage; } catch (_) { session = null; }
  const state = makeState({local,session,now:Date.now(),url:root.location.href,referrer:document.referrer,ua:navigator.userAgent});
  let queue = read(local, 'outbox', []).filter(e => Date.now() - Date.parse(e.event_time) < TTL);
  let endpoint = '', peer = null, peerOrigin = '', inflight = null;
  const bridgeId = uuid();
  const status = {version:'2026-09-15.1',backendReady:false,pending:queue.length,lastError:''};
  function saveQueue() { write(local,'outbox',queue); status.pending = queue.length; }
  function beacon(events) {
    if (!endpoint || !events.length) return;
    try { navigator.sendBeacon(endpoint,new Blob([JSON.stringify({action:'track',events:events.slice(0,10)})],{type:'text/plain;charset=UTF-8'})); } catch (_) {}
    // Accepted for delivery is NOT confirmation that Sheet was written. Keep outbox until RPC acknowledgement.
  }
  function flush() {
    if (!peer || !queue.length || inflight) return;
    const batch = queue.slice(0,10), request = uuid();
    inflight = {request,at:Date.now()};
    peer.postMessage({channel:'divine-tracking-v1',bridge_id:bridgeId,type:'events',request_id:request,events:batch},peerOrigin);
  }
  function track(name) {
    if (!EVENTS.includes(name) || state.sent[name]) return;
    const event = Object.assign({},state.context,{event_name:name,event_time:new Date().toISOString(),event_id:uuid(),record_id:''});
    queue.push(event); queue = queue.slice(-100); saveQueue();
    state.sent[name] = true; state.last_seen = Date.now(); write(session,'session',state);
    beacon([event]); flush();
  }
  root.addEventListener('message', e => {
    const m = e.data;
    if (!m || m.channel !== 'divine-tracking-v1' || m.bridge_id !== bridgeId || !/^https:\/\/(?:script|[a-z0-9-]+-script)\.googleusercontent\.com$/.test(e.origin)) return;
    if (m.type === 'ready') { if (peer && e.source !== peer) return; peer=e.source; peerOrigin=e.origin; status.backendReady=m.version===status.version; flush(); }
    if (e.source !== peer) return;
    if (m.type === 'ack' && inflight && m.request_id === inflight.request) {
      if (m.ok && Array.isArray(m.accepted)) { const accepted=new Set(m.accepted); queue=queue.filter(x=>!accepted.has(x.event_id)); saveQueue(); status.lastError=''; }
      else status.lastError='流量尚未確認寫入，將自動重試';
      inflight=null; if (m.ok) flush();
    }
    if (m.type === 'form_start') track('form_start');
    if (m.type === 'success') { status.lastRecordId = m.record_id; /* success is recorded by GAS, never by the browser */ }
  });
  document.addEventListener('click', e => { const a = e.target.closest('a'); if (a && (a.getAttribute('href') === '#booking' || a.id === 'standalone-form')) track('registration_click'); });
  root.addEventListener('pagehide',()=>beacon(queue));
  root.addEventListener('online',flush);
  root.setInterval(()=>{ if (inflight && Date.now()-inflight.at>20000) inflight=null; flush(); },10000);
  root.DivineTracking = {status,track,mount(form,url) {
    endpoint=url.href;
    const ctx=JSON.stringify(state.context);
    url.searchParams.set('tracking',ctx); url.searchParams.set('parent_origin',location.origin); url.searchParams.set('bridge_id',bridgeId);
    form.loading='eager'; form.src=url.href;
    const standalone=new URL(endpoint); standalone.searchParams.set('tracking',ctx); standalone.searchParams.set('standalone','1');
    document.getElementById('standalone-form').href=standalone.href;
    beacon(queue); flush();
  }};
  track('page_view');
})(typeof window !== 'undefined' ? window : globalThis);
