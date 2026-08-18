// @dsh-lan-exposure/lan — expose dsh's loopback web GUI to the LAN.
//
// dsh's own webserver deliberately binds only 127.0.0.1 (it refuses
// 0.0.0.0 for safety), so cross-device access must come from a reverse
// proxy. This plugin runs that proxy INSIDE the dsh process: it opens
// 0.0.0.0:<port> and forwards to <targetHost>:<targetPort>, rewriting the
// Host and Origin headers so dsh's trust fence lets the phone through,
// and injecting a crypto.randomUUID polyfill for phone browsers that
// block it on non-secure (http://lan-ip) contexts.
//
// It also exposes GET /api/dsh-lan-exposure/status (live connection readout
// the browser polls) and injects a small connection badge into the page.
//
// Tuning via environment variables (read once at load):
//   DSH_LAN_ENABLED        enable LAN exposure      (default true)
//   DSH_LAN_PORT           listen port              (default 8080)
//   DSH_LAN_LISTEN_HOST    listen bind              (default 0.0.0.0)
//   DSH_LAN_TARGET_HOST    upstream host            (default 127.0.0.1)
//   DSH_LAN_TARGET_PORT    upstream port            (default 3080)
//   DSH_LAN_AUTH_USER      basic-auth user          (default unset => auth off)
//   DSH_LAN_AUTH_PASS      basic-auth pass          (default unset => auth off)
//
// Zero external dependencies: only node: built-ins. (Keeping it dependency-
// free is deliberate — dsh loads this plugin from a linked package whose
// node_modules cannot resolve @deepseek-ai/* or react in the deployed
// profile, so any such import would fail to load.)

import http from 'node:http'
import net from 'node:net'

export const name = 'lan-exposure'

const ENABLED = (process.env.DSH_LAN_ENABLED ?? 'true') !== 'false'
const LISTEN_HOST = process.env.DSH_LAN_LISTEN_HOST || '0.0.0.0'
const LISTEN_PORT = Number(process.env.DSH_LAN_PORT || 8080)
const TARGET_HOST = process.env.DSH_LAN_TARGET_HOST || '127.0.0.1'
const TARGET_PORT = Number(process.env.DSH_LAN_TARGET_PORT || 3080)
const AUTH_USER = process.env.DSH_LAN_AUTH_USER || null
const AUTH_PASS = process.env.DSH_LAN_AUTH_PASS || null

const TARGET_ORIGIN = `http://${TARGET_HOST}:${TARGET_PORT}`

// Phone browsers on http://<lan-ip> are a non-secure context, so
// crypto.randomUUID is undefined there and the web client throws.
// This polyfill runs before any module code.
//
// Implementation notes (this exact shape is what worked on real phones):
//  - Use a plain `crypto.randomUUID = g` direct assignment, NOT
//    Object.defineProperty: on some phones `crypto` is a read-only getter
//    and defineProperty is silently dropped while direct assignment works.
//  - `g` falls back to a pure Math.random generator when getRandomValues
//    is unavailable, so it never depends on a secure context.
const CRYPTO_POLYFILL = `<script>(function(){try{
  if(typeof crypto==='undefined'||!crypto.randomUUID){
    var g=function(){
      try{
        if(typeof crypto!=='undefined'&&crypto.getRandomValues){
          return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[0189]/g,function(c){return(c^c.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)});
        }
      }catch(e){}
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;var v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});
    };
    if(typeof crypto==='undefined'){crypto={}}
    try{crypto.randomUUID=g;}catch(e){}
    if(typeof globalThis!=='undefined'){try{globalThis.crypto.randomUUID=g;}catch(e){}}
  }
}catch(e){}})();</script>`

// Connection badge: a live, self-healing indicator injected into the page.
// It polls our own status endpoint (independent of WS event interception,
// so it survives SPA re-renders and shows the real server-side state:
// listening port + how many devices are currently connected).
const CONN_MONITOR = `<script>(function(){
  if(window.__dsh_lan_monitor__)return;
  window.__dsh_lan_monitor__=true;
  console.log('[dsh-lan-exposure] connection monitor loaded');
  function root(){return document.documentElement||document.body;}
  function ensureUI(){
    if(document.getElementById('dsh-lan-conn'))return;
    var r=root(); if(!r){setTimeout(ensureUI,50);return;}
    var d=document.createElement('div');
    d.id='dsh-lan-conn';
    d.style.cssText='position:fixed;bottom:16px;right:16px;top:auto;z-index:2147483647;padding:4px 10px;border-radius:12px;background:rgba(0,0,0,0.65);color:#fff;font-size:12px;line-height:1.4;display:flex;align-items:center;gap:6px;pointer-events:none;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,\\"Segoe UI\\",Roboto,\\"Helvetica Neue\\",Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.25);';
    d.innerHTML='<span id="dsh-lan-dot" style="width:9px;height:9px;border-radius:50%;background:#eab308;box-shadow:0 0 5px rgba(234,179,8,0.7);"></span><span id="dsh-lan-text" style="white-space:nowrap;">连接状态…</span>';
    r.appendChild(d);
  }
  function set(ok,text){
    var dot=document.getElementById('dsh-lan-dot'),txt=document.getElementById('dsh-lan-text');
    if(!dot)return;
    dot.style.background=ok?'#22c55e':'#ef4444';
    if(txt)txt.textContent=text;
  }
  // Recreate if the SPA removes it during navigation/re-render.
  if(typeof MutationObserver!=='undefined'&&document.documentElement){
    new MutationObserver(function(){ensureUI();}).observe(document.documentElement,{childList:true,subtree:true});
  }
  setInterval(ensureUI,2000);
  if(document.readyState!=='loading')ensureUI();else document.addEventListener('DOMContentLoaded',ensureUI);
  function poll(){
    fetch('/api/dsh-lan-exposure/status',{cache:'no-store'})
      .then(function(r){return r.json();})
      .then(function(s){
        if(s&&s.listening){set(true,'已监听 :'+s.port+' · '+s.devices+' 台设备');}
        else{set(false,'未监听');}
      })
      .catch(function(){set(false,'状态获取失败');});
  }
  poll(); setInterval(poll,3000);
})();</script>`

const headerValue = (v) => (Array.isArray(v) ? v.join(', ') : v)

function requireAuth(req) {
  if (!AUTH_USER || !AUTH_PASS) return false
  const h = req.headers['authorization'] || ''
  const [scheme, b64] = h.split(' ')
  if (scheme !== 'Basic') return true
  const [u, p] = Buffer.from(b64 || '', 'base64').toString('utf8').split(':')
  return !(u === AUTH_USER && p === AUTH_PASS)
}

export function apply(ctx) {
  if (!ENABLED) {
    console.error('[dsh-lan-exposure] disabled via env (DSH_LAN_ENABLED=false), skipping')
    return
  }
  console.error(`[dsh-lan-exposure] starting reverse proxy -> ${TARGET_ORIGIN}`)

  // Connected clients (one entry per live WebSocket through the proxy).
  /** @type {Map<number, {ip:string, since:number, ua:string}>} */
  const clients = new Map()
  let connSeq = 0

  const server = http.createServer((req, res) => {
    // Own status endpoint — served directly, never forwarded to dsh.
    if (req.url === '/api/dsh-lan-exposure/status') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      const deviceSet = new Set([...clients.values()].map((c) => c.ip))
      res.end(JSON.stringify({
        listening: true,
        port: LISTEN_PORT,
        target: `${TARGET_HOST}:${TARGET_PORT}`,
        devices: deviceSet.size,
        clients: [...clients.values()].map((c) => ({ ip: c.ip, since: c.since, ua: c.ua })),
      }))
      return
    }
    if (requireAuth(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="dsh-lan"' })
      res.end('401 Unauthorized')
      return
    }
    const targetReq = http.request(
      {
        host: TARGET_HOST,
        port: TARGET_PORT,
        method: req.method,
        path: req.url,
        headers: {
          ...req.headers,
          host: `${TARGET_HOST}:${TARGET_PORT}`,
          origin: TARGET_ORIGIN,
        },
        setHost: false,
      },
      (targetRes) => {
        const ct = targetRes.headers['content-type'] || ''
        if (ct.includes('text/html')) {
          // Body length changes after injection: drop hop-by-hop / length headers.
          delete targetRes.headers['content-length']
          delete targetRes.headers['content-encoding']
          // Stop phones from caching a broken/stale page.
          delete targetRes.headers['cache-control']
          targetRes.headers['cache-control'] = 'no-store'
          targetRes.headers['pragma'] = 'no-cache'
          const chunks = []
          targetRes.on('data', (c) => chunks.push(c))
          targetRes.on('end', () => {
            let body = Buffer.concat(chunks).toString('utf8')
            body = body.replace(/<head[^>]*>/i, (m) => m + CRYPTO_POLYFILL + CONN_MONITOR)
            res.writeHead(targetRes.statusCode, targetRes.headers)
            res.end(body)
          })
        } else {
          res.writeHead(targetRes.statusCode, targetRes.headers)
          targetRes.pipe(res)
        }
      },
    )
    targetReq.on('error', () => res.destroy())
    req.pipe(targetReq)
  })

  // WebSocket / SSE upgrade: GUI real-time streaming rides on this.
  server.on('upgrade', (req, clientSocket, head) => {
    if (requireAuth(req)) {
      clientSocket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      clientSocket.destroy()
      return
    }
    const id = ++connSeq
    const targetSocket = net.connect(TARGET_PORT, TARGET_HOST, () => {
      console.error(`[dsh-lan-exposure] UPGRADE ${req.method} ${req.url}`)
      clients.set(id, {
        ip: req.socket.remoteAddress || '',
        since: Date.now(),
        ua: (req.headers['user-agent'] || '').slice(0, 80),
      })
      targetSocket.write(`${req.method} ${req.url} HTTP/1.1\r\n`)
      for (const [k, v] of Object.entries(req.headers)) {
        const lk = k.toLowerCase()
        if (lk === 'host' || lk === 'connection' || lk === 'proxy-connection' || lk === 'proxy-authorization') continue
        if (lk === 'origin') {
          targetSocket.write(`origin: ${TARGET_ORIGIN}\r\n`)
          continue
        }
        targetSocket.write(`${k}: ${headerValue(v)}\r\n`)
      }
      targetSocket.write(`Host: ${TARGET_HOST}:${TARGET_PORT}\r\n`)
      targetSocket.write(`Connection: Upgrade\r\n`)
      if (head && head.length) targetSocket.write(head)
      // Must end the HTTP headers with a blank line, else the peer waits
      // forever for the request body and the handshake times out.
      targetSocket.write('\r\n')
    })
    const cleanup = () => clients.delete(id)
    targetSocket.on('error', cleanup)
    targetSocket.on('close', cleanup)
    clientSocket.on('error', () => targetSocket.destroy())
    clientSocket.on('close', cleanup)
    targetSocket.pipe(clientSocket)
    clientSocket.pipe(targetSocket)
  })

  server.listen(LISTEN_PORT, LISTEN_HOST, () => {
    console.error(`[dsh-lan-exposure] listening on http://${LISTEN_HOST}:${LISTEN_PORT} -> ${TARGET_ORIGIN}`)
    console.error(`[dsh-lan-exposure] phone URL: http://<你的LAN IP>:${LISTEN_PORT}`)
  })

  // Cordis-managed lifecycle: disposed automatically on plugin unload.
  ctx.effect(
    () => () => {
      clients.clear()
      server.close()
      console.error('[dsh-lan-exposure] server closed')
    },
    'lan-exposure: reverse proxy',
  )
}
