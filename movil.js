(function(){try{
// HUD circular del modo móvil (v0.2). Se ejecuta en el mundo de la página (MAIN) para poder tocar los botones del cliente como lo haría un dedo.
// No inventa acciones: el ataque básico es el botón ORIGINAL movido de sitio; cada poder es un botón circular que, al tocarlo o mantenerlo,
// "toca" la ranura original del cliente (que aplica cooldown, maná y alcance); PvP/Monstruos tocan el botón PvP original.
(function () {
  'use strict';
  if (window.__hudCircular) { if (window.__hudCircularToggle) window.__hudCircularToggle(); return; }   // marcador: ejecutarlo otra vez lo apaga/enciende
  window.__hudCircular = true;
  const CFG = {
    ATTACK: 84,         // diámetro del ataque básico
    POWER: 54,          // diámetro de cada poder
    SMALL: 32,          // diámetro de PvP / Monstruos
    UTIL: 44,           // diámetro de pociones y recoger
    MARGIN: 14,
    POWER_RADIUS: 118,  // anillo 1; los siguientes se alejan POWER+8 px
    SMALL_RADIUS: 64,
    ARC_FROM: 175, ARC_TO: 275,   // grados (180 = izquierda, 270 = arriba)
    REPEAT_MS: 250,     // mismo ritmo que el botón de ataque oficial
    LONGPRESS_MS: 470   // el cliente abre el selector de poderes a los 400 ms
  };
  const BASE = { ATTACK: CFG.ATTACK, POWER: CFG.POWER, SMALL: CFG.SMALL, UTIL: CFG.UTIL, MARGIN: CFG.MARGIN, POWER_RADIUS: CFG.POWER_RADIUS, SMALL_RADIUS: CFG.SMALL_RADIUS };
  // Factor de escala según la pantalla (el HUD móvil es horizontal: manda la altura, sin pasarse del ancho)
  const unit = () => Math.max(0.72, Math.min(1.5, Math.min(innerHeight / 480, innerWidth / 900)));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const KEY = 'portmu_hud_circular';
  let on = true;
  try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* sin almacenamiento */ }

  // ---- lector de paquetes de respaldo (marcador): si wshook.js no estuvo desde el arranque, se engancha a send() del WebSocket ya abierto ----
  // Posición propia: de las peticiones de caminar que envía el cliente (C1 D4 x y ... pasos). Monstruos: de los paquetes 13/14/17/10 que llegan desde ahora.
  // Los que ya estaban a la vista antes de pulsar el marcador no se conocen: hasta que te alejes ~25 casillas solo se bloquea si se SABE que no hay monstruos cerca.
  if (!window.__hcWsHook) (() => {
    window.__hcWsHook = 'late';
    const mobs = new Map(); let posOk = true, parsed = false, start = null, complete = false;
    const DIRS = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
    const isNpcType = (t) => (t >= 200 && t < 300) || (t >= 690 && t <= 699);
    const setPos = (x, y) => {
      const p = window.__hcPos;
      if (p && Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) > 40) { mobs.clear(); complete = true; }
      if (!start) start = { x, y }; else if (!complete && Math.max(Math.abs(start.x - x), Math.abs(start.y - y)) > 25) complete = true;
      window.__hcPos = { x, y, at: Date.now() }; posOk = true;
    };
    const eachPacket = (u8, fn) => {
      let o = 0;
      while (o + 3 <= u8.length) {
        const h = u8[o]; if (h < 0xc1 || h > 0xc4) break;
        const c12 = h === 0xc1 || h === 0xc3; let len, code;
        if (c12) { len = u8[o + 1]; code = u8[o + 2]; } else { if (o + 4 > u8.length) break; len = (u8[o + 1] << 8) | u8[o + 2]; code = u8[o + 3]; }
        if (len <= 0 || o + len > u8.length) len = u8.length - o;
        fn(h, code, o, len); o += len;
      }
    };
    const scanOut = (u8) => eachPacket(u8, (h, code, o, len) => {
      if (h !== 0xc1 || code !== 0xd4 || len < 6) return;
      let x = u8[o + 3], y = u8[o + 4]; const n = u8[o + 5] & 15;
      for (let i = 0; i < n; i++) { const b = u8[o + 6 + (i >> 1)]; const d = DIRS[(i & 1) ? (b & 15) : (b >> 4)]; if (!d) break; x += d[0]; y += d[1]; }
      setPos(x, y);
    });
    const scanIn = (u8) => eachPacket(u8, (h, code, o, len) => {
      if (h === 0xc1 && code === 0x10 && len >= 7) { const m = mobs.get(((u8[o + 3] << 8) | u8[o + 4]) & 0x7fff); if (m) { m.x = u8[o + 5]; m.y = u8[o + 6]; } }
      else if (h === 0xc1 && code === 0x14 && len >= 4) { for (let i = 0; i < u8[o + 3] && 4 + i * 2 + 1 < len; i++) mobs.delete(((u8[o + 4 + i * 2] << 8) | u8[o + 5 + i * 2]) & 0x7fff); }
      else if (h === 0xc1 && code === 0x17 && len >= 5) mobs.delete(((u8[o + 3] << 8) | u8[o + 4]) & 0x7fff);
      else if (h === 0xc2 && code === 0x13) {
        const n = u8[o + 4], body = len - 5, sz = body === n * 12 ? 12 : (body === n * 10 ? 10 : 0); if (!n || !sz) return;
        const pos = window.__hcPos; let far = 0, seen = 0;
        for (let i = 0; i < n; i++) {
          const b = o + 5 + i * sz, id = ((u8[b] << 8) | u8[b + 1]) & 0x7fff, type = sz === 12 ? (u8[b + 2] | (u8[b + 3] << 8)) : ((u8[b + 2] << 8) | u8[b + 3]);
          const x = u8[b + (sz === 12 ? 6 : 4)], y = u8[b + (sz === 12 ? 7 : 5)]; parsed = true;
          if (isNpcType(type)) continue; mobs.set(id, { x, y, type });
          if (pos) { seen++; if (Math.max(Math.abs(pos.x - x), Math.abs(pos.y - y)) > 45) far++; }
        }
        if (seen && far === seen) posOk = false;
      }
    });
    window.__hcNear = (range) => {
      const p = window.__hcPos; if (!parsed || !p || !posOk) return null;
      let best = Infinity; for (const m of mobs.values()) { const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < best) best = d; }
      if (!complete && best > (range || 8)) return null;   // lista aún incompleta: no se puede afirmar que no hay monstruos cerca
      return { d: best, n: mobs.size };
    };
    const toU8 = (d, cb) => {
      if (d instanceof ArrayBuffer) cb(new Uint8Array(d));
      else if (ArrayBuffer.isView(d)) cb(new Uint8Array(d.buffer, d.byteOffset, d.byteLength));
      else if (typeof Blob !== 'undefined' && d instanceof Blob) d.arrayBuffer().then(b => cb(new Uint8Array(b))).catch(() => { });
    };
    const origSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      try {
        if (!this.__hcSeen) { this.__hcSeen = true; this.addEventListener('message', ev => { try { toU8(ev.data, scanIn); } catch (e) { /* nunca afectar al juego */ } }); }
        toU8(d, scanOut);
      } catch (e) { /* nunca afectar al juego */ }
      return origSend.apply(this, arguments);
    };
  })();

  const css = document.createElement('style');
  css.textContent = `
  body.hc-on .mobile-skill-pad, body.hc-on .mobile-skill-slots { display: contents !important; }
  body.hc-on .mobile-potion-button, body.hc-on .mobile-pickup-button { position: fixed !important; margin: 0 !important; pointer-events: auto !important; z-index: 99980; }
  body.hc-on .mobile-skill-slot, body.hc-on .mobile-attack-button { position: fixed !important; margin: 0 !important; pointer-events: auto !important; z-index: 99980; }
  body.hc-on .mobile-skill-slot { border-radius: 50% !important; overflow: hidden !important; background: radial-gradient(#281e14e6,#000d) !important; border: 2px solid rgba(232,200,119,.6) !important; box-sizing: border-box !important; }
  body.hc-on .mobile-skill-slot .mobile-scaled { width: 100% !important; height: 100% !important; }
  body.hc-on .mobile-skill-slot .mobile-scaled > *:not(.mobile-skill-art):not(.mobile-skill-delay) { display: none !important; }
  body.hc-on .mobile-skill-slot .mobile-skill-art { transform: translate(-50%,-50%) scale(calc(1.25 * var(--hc-u,1))) !important; }
  body.hc-on .mobile-skill-slot.hc-hide { display: none !important; }
  body.hc-on .mobile-attack-button { border-width: 4px !important; }
  body.hc-on .mobile-attack-button .mobile-attack-glyph { font-size: calc(44px * var(--hc-u,1)) !important; }
  body.hc-on .mobile-pvp-button { opacity: 0 !important; pointer-events: none !important; position: fixed !important; width: 1px !important; height: 1px !important; left: 0 !important; top: 0 !important; }
  body.hc-harvest .mobile-skill-picker { opacity: 0 !important; }
  body.hc-on .quick-command-window { transform: scale(calc(1.6 * var(--hc-u,1))) !important; transform-origin: 0 0 !important; }
  /* los botones del HUD cuelgan de <html>, no de <body>: la clase hc-under va en <html> */
  html.hc-under .hc-skill, html.hc-under #hc-pvp, html.hc-under #hc-mon, html.hc-under #hc-cfg, html.hc-under #hc-eye, html.hc-under #hc-atkicon,
  html.hc-under body.hc-on .mobile-attack-button, html.hc-under body.hc-on .mobile-skill-slot, html.hc-under body.hc-on .mobile-potion-button, html.hc-under body.hc-on .mobile-pickup-button { visibility: hidden !important; }
  body.hc-on .world-objects .drop { font-size: 13px !important; padding: 3px 6px !important; text-shadow: 0 0 3px #000, 0 0 3px #000; border-radius: 3px; background: rgba(0,0,0,.35); }
  .hc-skill { position: fixed; z-index: 99981; box-sizing: border-box; border-radius: 50%; overflow: hidden; display: none; touch-action: none; user-select: none; -webkit-user-select: none;
    background: radial-gradient(#281e14e6,#000d); border: 2px solid rgba(232,200,119,.6); box-shadow: 0 0 6px #000b; cursor: pointer; }
  .hc-skill.press { transform: scale(.94); background: radial-gradient(#785a28cc,#1e140ad9); }
  .hc-skill .mobile-skill-art { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%) scale(calc(1.25 * var(--hc-u,1))); pointer-events: none; }
  .hc-skill b { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #f2dca0; font: 700 calc(13px * var(--hc-u,1))/1 'Segoe UI',sans-serif; pointer-events: none; }
  #hc-panel { position: fixed; z-index: 99999; left: 50%; top: 50%; transform: translate(-50%,-50%); width: min(92vw, 560px); max-height: 86vh; overflow: auto; box-sizing: border-box; padding: 10px;
    background: rgba(18,14,10,.96); border: 1px solid rgba(230,190,90,.7); border-radius: 10px; color: #fff; font: 13px/1.3 'Segoe UI',sans-serif; }
  #hc-panel .hc-ptitle { color: #ffc832; font-weight: 700; margin-bottom: 8px; }
  #hc-panel .hc-holes, #hc-panel .hc-pgrid, #hc-panel .hc-prow { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 6px 0; }
  #hc-panel .hc-hole, #hc-panel .hc-pick { position: relative; width: 56px; height: 56px; border-radius: 50%; overflow: hidden; border: 2px solid rgba(232,200,119,.5); background: radial-gradient(#281e14e6,#000d); cursor: pointer; flex: none; }
  #hc-panel .hc-hole.sel { border-color: #6fd36f; box-shadow: 0 0 8px #28ff4acc; }
  #hc-panel .hc-pick.used { opacity: .45; }
  #hc-panel .mobile-skill-art { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%) scale(1.25); pointer-events: none; }
  #hc-panel small { position: absolute; left: 0; right: 0; bottom: 0; text-align: center; font-size: 9px; line-height: 11px; background: #000a; color: #fff; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  #hc-panel b { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #f2dca0; font-size: 13px; pointer-events: none; }
  #hc-panel button { all: unset; box-sizing: border-box; padding: 7px 12px; border-radius: 6px; background: #ffffff1a; color: #fff; cursor: pointer; }
  #hc-panel .hc-pcur { color: #e8c877; margin: 4px 0; }
  #hc-cfg, #hc-eye { position: fixed; z-index: 99985; box-sizing: border-box; border-radius: 50%; display: none; align-items: center; justify-content: center; font-size: calc(15px * var(--hc-u,1)); color: #e8c877;
    background: radial-gradient(#281e14b3,#000c); border: 2px solid rgba(232,200,119,.6); box-shadow: 0 0 6px #000b; user-select: none; touch-action: none; cursor: pointer; }
  #hc-eye.act { border-color: #888; color: #888; }
  #hc-pvp, #hc-mon { position: fixed; z-index: 99985; box-sizing: border-box; border-radius: 50%; display: none; align-items: center; justify-content: center;
    background: radial-gradient(#281e14b3,#000c); border: 2px solid rgba(232,200,119,.6); color: #e8c877; font: 700 calc(10px * var(--hc-u,1))/1 'Segoe UI',sans-serif;
    box-shadow: 0 0 6px #000b; user-select: none; touch-action: none; cursor: pointer; }
  #hc-pvp.act { border-color: #ff3b2f; background: radial-gradient(#aa140ad9,#3c0000e6); color: #fff; box-shadow: 0 0 10px #ff2814cc; }
  #hc-mon.act { border-color: #6fd36f; background: radial-gradient(#145a14d9,#001e00e6); color: #fff; box-shadow: 0 0 10px #28ff4acc; }
  #hc-info { position: fixed; z-index: 99985; padding: 0; color: #8fe3ff; font: 700 calc(11px * var(--hc-u,1))/1.2 'Segoe UI',sans-serif; display: none; text-shadow: 0 0 3px #000, 0 0 3px #000; user-select: none; pointer-events: none; white-space: nowrap; }
  #hc-atkicon { position: fixed; z-index: 99981; box-sizing: border-box; border-radius: 50%; overflow: hidden; display: none; pointer-events: none; }
  #hc-atkicon .mobile-skill-art { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%) scale(calc(1.7 * var(--hc-u,1))); }
  #hc-atkicon b { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #f2dca0; font: 700 calc(20px * var(--hc-u,1))/1 'Segoe UI',sans-serif; }
  body.hc-basicskill .mobile-attack-button .mobile-attack-glyph { opacity: 0 !important; }
  `;
  document.documentElement.appendChild(css);

  const mk = (id, html, title) => { const b = document.createElement('div'); b.id = id; b.innerHTML = html; b.title = title; document.documentElement.appendChild(b); return b; };
  const bPvp = mk('hc-pvp', 'PvP', 'Atacar jugadores (fijar y atacar a un PJ)');
  const bMon = mk('hc-mon', '👾', 'Solo monstruos');
  const info = mk('hc-info', '', 'Toca para recargar la lista de poderes');
  const bCfg = mk('hc-cfg', '⚙', 'Elegir poderes del HUD');
  const bEye = mk('hc-eye', '👁', 'Mostrar / ocultar los poderes');
  const atkIcon = mk('hc-atkicon', '', '');

  // ---- toques simulados sobre los botones originales ----
  // El cliente llama a setPointerCapture con el id del puntero; con un id inventado lanza una excepción y la acción no se ejecuta.
  function noCapture(fn) {
    const P = Element.prototype, a = P.setPointerCapture, b = P.releasePointerCapture;
    P.setPointerCapture = function () { }; P.releasePointerCapture = function () { };
    try { fn(); } finally { P.setPointerCapture = a; P.releasePointerCapture = b; }
  }
  const pev = (el, t, id) => { const r = el.getBoundingClientRect(); return new PointerEvent(t, { bubbles: true, cancelable: true, composed: true, pointerId: id, pointerType: 'touch', isPrimary: true, button: 0, buttons: t === 'pointerup' ? 0 : 1, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }); };
  const down = (el, id = 9101) => noCapture(() => el.dispatchEvent(pev(el, 'pointerdown', id)));
  const up = (el, id = 9101) => noCapture(() => el.dispatchEvent(pev(el, 'pointerup', id)));
  const tap = (el) => { if (!el) return; down(el); up(el); };

  const mobileOn = () => !!$('.mobile-controls');
  // ajustes globales: alcance máximo del objetivo automático (casillas; 0 = sin límite) y poderes ocultos
  const SK = 'portmu_hud_set';
  let setg = { range: 8, hide: false }; try { Object.assign(setg, JSON.parse(localStorage.getItem(SK) || '{}')); } catch (e) { /* sin almacenamiento */ }
  const saveSet = () => { try { localStorage.setItem(SK, JSON.stringify(setg)); } catch (e) { /* nada */ } };
  // true si se puede dejar que el botón de ataque oficial fije un objetivo: hay un monstruo a menos de "range" casillas.
  // Si no se puede medir (marcador sin lector de paquetes, o aún sin posición) se deja al juego como siempre.
  const nearOk = () => {
    if (!setg.range || typeof window.__hcNear !== 'function') return true;
    const n = window.__hcNear(setg.range); if (!n) return true;
    return n.d <= setg.range;
  };
  const pvpBtn = () => $('.mobile-pvp-button');
  const pvpActive = () => !!$('.mobile-pvp-button.on');
  const hasTarget = () => !!$('.mobile-target-label');

  const swallow = (b, fn) => {
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
    b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); });
  };
  swallow(bPvp, () => { if (!pvpActive()) tap(pvpBtn()); queue(); });   // encender PvP
  swallow(bMon, () => { if (pvpActive()) tap(pvpBtn()); queue(); });    // apagarlo: solo monstruos

  // ---- lanzar un poder (tocar la ranura original; si no hay objetivo, el botón de ataque oficial lo fija) ----
  // needT: si es true y no hay objetivo, el botón de ataque oficial fija el más cercano antes de lanzar (los buffs/áreas sobre uno mismo no lo necesitan)
  function fire(slot, needT) {
    if (!slot || !document.contains(slot)) return;
    if (needT && !pvpActive() && !hasTarget()) { if (!nearOk()) return; tap($('.mobile-attack-button')); }
    tap(slot);
  }
  // Mantener pulsado repite el poder. h = { pid, timer }; needT es una función (se lee en cada disparo)
  function startHold(h, getSlot, el, needT = () => true) {
    return async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (h.pid !== null) return;
      h.pid = e.pointerId; if (el) el.classList.add('press');
      try { (el || e.currentTarget).setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
      const slot = await getSlot();
      if (h.pid === null || !slot) return;   // lo soltó mientras se preparaba el poder
      fire(slot, needT()); h.timer = setInterval(() => fire(slot, needT()), CFG.REPEAT_MS);
    };
  }
  const endHold = (h, el) => (e) => {
    if (h.pid === null || (e && e.pointerId !== undefined && e.pointerId !== h.pid)) return;
    h.pid = null; clearInterval(h.timer); h.timer = null; if (el) el.classList.remove('press');
  };

  // ---- lista completa de poderes: se lee una vez del selector del cliente (invisible) ----
  let skills = [], harvestOk = false, picking = false, lastLevel = '';
  async function openPicker(slotEl) {
    down(slotEl); await sleep(CFG.LONGPRESS_MS); up(slotEl);
    for (let i = 0; i < 25; i++) { if ($('.mobile-picker-slot')) return true; await sleep(100); }
    return false;
  }
  const closePicker = () => { const p = $('.mobile-skill-picker'); if (p) tap(p); };
  async function harvest() {
    if (picking) return;
    const s0 = $('.mobile-skill-slot'); if (!s0) return;
    picking = true; document.body.classList.add('hc-harvest');
    try {
      if (!(await openPicker(s0))) return;
      const items = $$('.mobile-picker-slot').map(e => { const a = e.querySelector('.mobile-skill-art'); return { title: e.title || '', art: a ? a.cloneNode(true) : null }; }).filter(x => x.title);
      closePicker(); await sleep(150);
      if (items.length) { skills = items; harvestOk = true; builtKey = ''; autofill(); }
    } catch (err) { console.warn('HUD circular: no se pudo leer la lista de poderes', err); }
    finally { document.body.classList.remove('hc-harvest'); picking = false; queue(); }
    if (harvestOk) preload();
  }
  // Pone un poder en la ranura real número idx mediante el selector (long press + elegir). Devuelve la ranura o null.
  async function setSlot(idx, title) {
    const slots = $$('.mobile-skill-slot'), target = slots[idx];
    if (!target) return null;
    const find = () => $$('.mobile-skill-slot').find(s => s.title === title);
    if (target.title === title) return target;
    if (!(await openPicker(target))) return null;
    const it = $$('.mobile-picker-slot').find(e => e.title === title);
    if (!it) { closePicker(); return null; }
    tap(it); await sleep(200);
    return find() || target;
  }
  // Devuelve la ranura del cliente que tiene ese poder; si ninguna lo tiene, lo asigna a la última ranura mediante el selector
  async function slotForSkill(sk) {
    const find = () => $$('.mobile-skill-slot').find(s => s.title === sk.title);
    const s = find(); if (s) return s;
    if (picking) return null;
    picking = true; document.body.classList.add('hc-harvest');
    try { return await setSlot($$('.mobile-skill-slot').length - 1, sk.title); }
    finally { document.body.classList.remove('hc-harvest'); picking = false; }
  }
  // Deja cargados en las 3 ranuras reales los primeros poderes elegidos (Básico, 1, 2): esos se lanzan al instante; los demás usan la última ranura
  async function preload() {
    if (picking) return;
    const c = cfg(), order = [c.basic, ...c.slots].filter(Boolean).filter(t => skills.some(s => s.title === t));
    picking = true; document.body.classList.add('hc-harvest');
    try { for (let i = 0; i < Math.min(order.length, $$('.mobile-skill-slot').length, 3); i++) await setSlot(i, order[i]); }
    catch (err) { console.warn('HUD circular: precarga', err); }
    finally { document.body.classList.remove('hc-harvest'); picking = false; }
  }

  // ---- configuración por personaje: qué poder va en el básico y en cada uno de los 4 círculos ----
  const CK = 'portmu_hud_cfg';
  let cfgAll = {}; try { cfgAll = JSON.parse(localStorage.getItem(CK) || '{}') || {}; } catch (e) { /* sin almacenamiento */ }
  const charName = () => (($('.mobile-vitals-name') || {}).textContent || '').trim() || '_';
  const cfg = () => { const n = charName(); return cfgAll[n] || (cfgAll[n] = { basic: null, slots: [null, null, null, null], tgt: {}, init: false }); };
  const saveCfg = () => { try { localStorage.setItem(CK, JSON.stringify(cfgAll)); } catch (e) { /* nada */ } };
  const wantsTarget = (title) => cfg().tgt[title] !== false;
  function autofill() {   // primera vez: los 4 primeros poderes de la lista; el básico queda como ataque normal
    const c = cfg(); if (c.init || charName() === '_') return;
    c.init = true; c.slots = [0, 1, 2, 3].map(i => (skills[i] ? skills[i].title : null)); saveCfg();
  }
  const skillByTitle = (t) => skills.find(s => s.title === t);
  const iconFor = (sk, into) => {
    if (sk.art) into.appendChild(sk.art.cloneNode(true));
    const hasArt = sk.art && (sk.art.children.length > 0 || sk.art.textContent.trim() || sk.art.style.backgroundImage);
    if (!hasArt) { const t = document.createElement('b'); t.textContent = sk.title.replace(/[^A-Za-z0-9 ]/g, '').split(' ').map(w => w[0] || '').join('').slice(0, 3).toUpperCase(); into.appendChild(t); }
  };

  // ---- botones circulares de los poderes elegidos ----
  let skillBtns = [], builtKey = '';
  function buildSkillButtons() {
    const chosen = cfg().slots.map(skillByTitle).filter(Boolean);
    const key = chosen.map(s => s.title).join('|');
    if (key === builtKey) return;
    builtKey = key;
    skillBtns.forEach(b => b.remove()); skillBtns = [];
    chosen.forEach(sk => {
      const b = document.createElement('div'); b.className = 'hc-skill'; b.title = sk.title;
      iconFor(sk, b);
      const h = { pid: null, timer: null };
      b.addEventListener('pointerdown', startHold(h, () => slotForSkill(sk), b, () => wantsTarget(sk.title)));
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => b.addEventListener(ev, endHold(h, b)));
      b.addEventListener('contextmenu', e => e.preventDefault());
      document.documentElement.appendChild(b); skillBtns.push(b);
    });
  }

  // Toques reales: (1) botón de ataque grande con un poder asignado -> repite ese poder; (2) respaldo: ranuras originales si no se leyó la lista
  const realHolds = new Map();
  document.addEventListener('pointerdown', (e) => {
    if (!on || !e.isTrusted || !document.body.classList.contains('hc-on')) return;
    const t = e.target && e.target.closest ? e.target : null; if (!t) return;
    const atk = t.closest('.mobile-attack-button');
    if (atk) {
      const sk = harvestOk && cfg().basic ? skillByTitle(cfg().basic) : null;
      if (!sk) { if (!pvpActive() && !hasTarget() && !nearOk()) { e.stopImmediatePropagation(); e.preventDefault(); } return; }   // sin poder asignado: ataque básico normal del cliente (salvo que no haya monstruos cerca)
      e.stopImmediatePropagation(); e.preventDefault();
      const h = { pid: null, timer: null }; realHolds.set(e.pointerId, h);
      startHold(h, () => slotForSkill(sk), null, () => wantsTarget(sk.title))(e);
      return;
    }
    if (harvestOk) return;
    const slot = t.closest('.mobile-skill-slot');
    if (!slot || !$('.mobile-skill-art', slot)) return;   // ranura vacía: se deja abrir el selector
    e.stopImmediatePropagation(); e.preventDefault();
    const h = { pid: null, timer: null }; realHolds.set(e.pointerId, h);
    startHold(h, async () => slot, slot)(e);
  }, true);
  ['pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, (e) => {
    const h = realHolds.get(e.pointerId); if (!h) return;
    const slot = e.target && e.target.closest ? e.target.closest('.mobile-skill-slot') : null;
    endHold(h, slot)(e); realHolds.delete(e.pointerId);
  }, true));

  // ---- panel ⚙: elegir el poder del básico y de cada círculo ----
  let panel = null, selHole = 0;   // 0 = Básico, 1..4 = círculos
  const holeTitle = (i) => (i === 0 ? cfg().basic : cfg().slots[i - 1]);
  function closePanel() { if (panel) { panel.remove(); panel = null; } }
  function assign(title) {
    const c = cfg();
    if (c.basic === title) c.basic = null;
    c.slots = c.slots.map(t => (t === title ? null : t));
    if (selHole === 0) c.basic = title; else c.slots[selHole - 1] = title;
    saveCfg(); builtKey = ''; queue(); renderPanel(); preload();
  }
  function clearHole() { const c = cfg(); if (selHole === 0) c.basic = null; else c.slots[selHole - 1] = null; saveCfg(); builtKey = ''; queue(); renderPanel(); }
  function renderPanel() {
    if (!panel) return;
    const c = cfg(); panel.innerHTML = '';
    const mkEl = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
    panel.appendChild(mkEl('div', 'hc-ptitle', 'Poderes del HUD — ' + charName()));
    const holes = mkEl('div', 'hc-holes');
    for (let i = 0; i <= 4; i++) {
      const hd = mkEl('div', 'hc-hole' + (i === selHole ? ' sel' : '')); const t = holeTitle(i), sk = t ? skillByTitle(t) : null;
      if (sk) iconFor(sk, hd);
      hd.appendChild(mkEl('small', '', i === 0 ? 'Básico' : String(i)));
      hd.addEventListener('click', () => { selHole = i; renderPanel(); });
      holes.appendChild(hd);
    }
    panel.appendChild(holes);
    const cur = holeTitle(selHole);
    panel.appendChild(mkEl('div', 'hc-pcur', cur ? cur : (selHole === 0 ? 'Sin poder: el botón grande es el ataque básico normal' : 'Vacío: elige un poder abajo')));
    const row = mkEl('div', 'hc-prow');
    if (cur) {
      const lab = mkEl('label', '', ' Fijar objetivo antes de lanzar'); const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = wantsTarget(cur);
      cb.addEventListener('change', () => { c.tgt[cur] = cb.checked; saveCfg(); }); lab.prepend(cb); row.appendChild(lab);
      const q = mkEl('button', '', 'Quitar'); q.addEventListener('click', clearHole); row.appendChild(q);
    }
    const rg = mkEl('label', '', ' Alcance del objetivo automático: '); const sel = document.createElement('select');
    [[5, '5 casillas'], [8, '8 casillas'], [11, '11 casillas'], [15, '15 casillas'], [0, 'sin límite']].forEach(([v, t]) => { const o = document.createElement('option'); o.value = String(v); o.textContent = t; if (v === setg.range) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', () => { setg.range = Number(sel.value); saveSet(); });
    rg.appendChild(sel); panel.appendChild(rg);
    const rl = mkEl('button', '', 'Recargar poderes'); rl.addEventListener('click', () => { harvest(); }); row.appendChild(rl);
    const x = mkEl('button', '', 'Cerrar'); x.addEventListener('click', closePanel); row.appendChild(x);
    panel.appendChild(row);
    const grid = mkEl('div', 'hc-pgrid');
    skills.forEach(sk => {
      const b = mkEl('div', 'hc-pick' + ((c.basic === sk.title || c.slots.includes(sk.title)) ? ' used' : '')); b.title = sk.title; iconFor(sk, b);
      b.appendChild(mkEl('small', '', sk.title));
      b.addEventListener('click', () => assign(sk.title)); grid.appendChild(b);
    });
    panel.appendChild(grid);
  }
  function openPanel() {
    if (!harvestOk) { harvest(); return; }
    closePanel(); panel = document.createElement('div'); panel.id = 'hc-panel';
    panel.addEventListener('pointerdown', e => e.stopPropagation());
    document.documentElement.appendChild(panel); renderPanel();
  }
  swallow(bCfg, openPanel);
  swallow(bEye, () => { setg.hide = !setg.hide; saveSet(); queue(); });

  // ---- disposición ----
  const place =(el, cx, cy, d) => {
    const x = Math.max(d / 2, Math.min(innerWidth - d / 2, cx)), y = Math.max(d / 2 + 24, Math.min(innerHeight - d / 2, cy));
    el.style.width = d + 'px'; el.style.height = d + 'px'; el.style.left = Math.round(x - d / 2) + 'px'; el.style.top = Math.round(y - d / 2) + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto';
  };
  const polar = (cx, cy, deg, r) => ({ x: cx + r * Math.cos(deg * Math.PI / 180), y: cy + r * Math.sin(deg * Math.PI / 180) });
  // n posiciones en anillos concéntricos: cada anillo mete tantos botones como caben sin pisarse
  function ringPositions(n, cx, cy) {
    const out = []; let r = CFG.POWER_RADIUS, left = n;
    while (left > 0 && r < 700) {
      const minDeg = 2 * Math.asin(Math.min(1, (CFG.POWER + 6) / 2 / r)) * 180 / Math.PI;
      const per = Math.max(1, Math.floor((CFG.ARC_TO - CFG.ARC_FROM) / minDeg) + 1), k = Math.min(per, left);
      for (let i = 0; i < k; i++) out.push(polar(cx, cy, k > 1 ? CFG.ARC_FROM + (CFG.ARC_TO - CFG.ARC_FROM) * i / (k - 1) : (CFG.ARC_FROM + CFG.ARC_TO) / 2, r));
      left -= k; r += CFG.POWER + 8;
    }
    return out;
  }
  const setCls = (el, c, v) => { if (el.classList.contains(c) !== v) el.classList.toggle(c, v); };

  // Ventanas del juego (inventario, bóveda, tiendas...): se mira qué hay REALMENTE bajo varios puntos del HUD. Si el elemento visible no es el mundo
  // ni el propio HUD, es una ventana encima: el HUD se esconde para no taparla. Interruptor de emergencia: window.__hcNoUnder = true
  const MINE = '.hc-skill,#hc-pvp,#hc-mon,#hc-cfg,#hc-eye,#hc-atkicon,#hc-info,#hc-panel,.mobile-controls,.mobile-attack-button,.mobile-skill-slot,.mobile-potion-button,.mobile-pickup-button,.mobile-pvp-button';
  function coveredAt(x, y) {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null;
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.closest(MINE)) continue;
      const tag = el.tagName; if (tag === 'HTML' || tag === 'BODY' || tag === 'CANVAS') return null;
      if (el.closest('.world-objects,.chat-window,.hc-hide')) continue;
      const r = el.getBoundingClientRect(); if (r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9) continue;   // capa de pantalla completa
      return el;
    }
    return null;
  }
  function windowOverHud(cx, cy) {
    if (window.__hcNoUnder) { window.__hcUnder = null; return false; }
    const pts = [[cx, cy], [cx - CFG.POWER_RADIUS, cy], [cx, cy - CFG.POWER_RADIUS], [innerWidth / 2, innerHeight - CFG.MARGIN - CFG.UTIL / 2]];
    for (const [x, y] of pts) { const el = coveredAt(Math.round(x), Math.round(y)); if (el) { window.__hcUnder = (el.className && el.className.toString ? el.className.toString() : el.tagName) + ' @' + Math.round(x) + ',' + Math.round(y); return true; } }
    window.__hcUnder = null; return false;
  }

  function layout() {
    const show = on && mobileOn();
    setCls(document.body, 'hc-on', show);
    syncAlt();
    const disp = show ? 'flex' : 'none';
    if (bPvp.style.display !== disp) { bPvp.style.display = disp; bMon.style.display = disp; }
    if (!show) { info.style.display = 'none'; bCfg.style.display = 'none'; bEye.style.display = 'none'; atkIcon.style.display = 'none'; setCls(document.body, 'hc-basicskill', false); setCls(document.documentElement, 'hc-under', false); skillBtns.forEach(b => { b.style.display = 'none'; }); return; }
    const U = unit(); for (const k in BASE) CFG[k] = BASE[k] * U;
    document.documentElement.style.setProperty('--hc-u', U.toFixed(3));
    const cx = innerWidth - CFG.MARGIN - CFG.ATTACK / 2 - 8, cy = innerHeight - CFG.MARGIN - CFG.ATTACK / 2 - 8;
    setCls(document.documentElement, 'hc-under', windowOverHud(cx, cy));
    const atk = $('.mobile-attack-button'); if (atk) place(atk, cx, cy, CFG.ATTACK);
    // si el básico tiene un poder asignado, el botón grande muestra su icono
    const bs = harvestOk && cfg().basic ? skillByTitle(cfg().basic) : null;
    setCls(document.body, 'hc-basicskill', !!(bs && atk));
    if (bs && atk) {
      place(atkIcon, cx, cy, CFG.ATTACK - 8 * U);
      if (atkIcon.dataset.t !== bs.title) { atkIcon.innerHTML = ''; iconFor(bs, atkIcon); atkIcon.dataset.t = bs.title; }
      if (atkIcon.style.display !== 'block') atkIcon.style.display = 'block';
    } else if (atkIcon.style.display !== 'none') { atkIcon.style.display = 'none'; atkIcon.dataset.t = ''; }

    // pociones y recoger: en fila, abajo al centro de la pantalla (antes quedaban tapadas por el ataque)
    const util = [...$$('.mobile-potion-button'), ...$$('.mobile-pickup-button')];
    util.forEach((el, i) => place(el, innerWidth / 2 + (i - (util.length - 1) / 2) * (CFG.UTIL + 8), innerHeight - CFG.MARGIN - CFG.UTIL / 2, CFG.UTIL));

    const lvl = (($('.mobile-vitals-level') || {}).textContent || '').trim();
    if (lvl && lvl !== lastLevel) { const first = lastLevel === ''; lastLevel = lvl; setTimeout(harvest, first ? 2500 : 4000); }   // lee los poderes al entrar y al subir de nivel

    const realSlots = $$('.mobile-skill-slot');
    if (harvestOk && skills.length) {
      buildSkillButtons();
      realSlots.forEach(s => setCls(s, 'hc-hide', true));
      ringPositions(skillBtns.length, cx, cy).forEach((p, i) => { const b = skillBtns[i]; place(b, p.x, p.y, CFG.POWER); const d = setg.hide ? 'none' : 'block'; if (b.style.display !== d) b.style.display = d; });
    } else {
      // respaldo: ranuras originales, solo las equipadas (y un "+" para equipar si hay alguna vacía)
      skillBtns.forEach(b => { b.style.display = 'none'; });
      const full = realSlots.filter(s => $('.mobile-skill-art', s)), empty = realSlots.filter(s => !$('.mobile-skill-art', s));
      const list = full.slice(); if (empty.length) list.push(empty[0]);
      realSlots.forEach(s => setCls(s, 'hc-hide', setg.hide || !list.includes(s)));
      const pos = ringPositions(list.length, cx, cy);
      list.forEach((s, i) => place(s, pos[i].x, pos[i].y, empty.includes(s) ? CFG.POWER * 0.7 : CFG.POWER));
    }
    // PvP y Monstruos: entre el ataque básico y los poderes
    const mid = (CFG.ARC_FROM + CFG.ARC_TO) / 2, sep = 24;
    const pp = polar(cx, cy, mid - sep, CFG.SMALL_RADIUS), pm = polar(cx, cy, mid + sep, CFG.SMALL_RADIUS);
    place(bPvp, pp.x, pp.y, CFG.SMALL); place(bMon, pm.x, pm.y, CFG.SMALL);
    const pg = polar(cx, cy, 300, CFG.SMALL_RADIUS + 4); place(bCfg, pg.x, pg.y, CFG.SMALL);
    const cd = harvestOk ? 'flex' : 'none'; if (bCfg.style.display !== cd) bCfg.style.display = cd;
    const pe = polar(cx, cy, 300, CFG.SMALL_RADIUS + 4 + CFG.SMALL + 6); place(bEye, pe.x, pe.y, CFG.SMALL);
    if (bEye.style.display !== 'flex') bEye.style.display = 'flex'; setCls(bEye, 'act', setg.hide);
    const act = pvpActive(); setCls(bPvp, 'act', act); setCls(bMon, 'act', !act);
    const pos = readPos();
    // coordenadas: dentro del HUD de vitales, a la derecha del nombre del personaje
    const nm = $('.mobile-vitals-name');
    if (pos && nm) {
      const txt = `(${pos[0]}, ${pos[1]})`;
      if (info.textContent !== txt) info.textContent = txt;
      info.style.display = 'block';
      const r = nm.getBoundingClientRect(), vr = ($('.mobile-vitals') || nm).getBoundingClientRect();
      const left = Math.min(r.right + 8 * U, vr.right - 4 - info.offsetWidth);
      info.style.left = Math.round(Math.max(vr.left + 2, left)) + 'px'; info.style.top = Math.round(r.top + (r.height - info.offsetHeight) / 2) + 'px';
    } else info.style.display = 'none';
  }

  // Coordenadas propias: el modo móvil no las muestra como texto; si algún elemento tipo minimapa/coordenadas las trae como "(x, y)", se leen
  function readPos() {
    const p = window.__hcPos;                          // de los paquetes del juego (wshook.js)
    if (p && Date.now() - p.at < 600000) return [p.x, p.y];
    const cand = $$('[class*="minimap"],[class*="coord"],[class*="position"],[class*="mapinfo"],[class*="map-info"]').filter(e => !e.closest('.party-coords,.party-meta,#hc-info'));
    for (const e of cand) { const m = (e.textContent || '').match(/\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/); if (m) return [Number(m[1]), Number(m[2])]; }
    return null;
  }

  // ---- nombres de los ítems del suelo siempre visibles (como mantener Alt en PC) ----
  let altDown = false;
  const altEvent = (type) => new KeyboardEvent(type, { code: 'AltLeft', key: 'Alt', keyCode: 18, which: 18, altKey: type === 'keydown', bubbles: true, cancelable: true });
  function setAlt(v) { if (v === altDown) return; altDown = v; document.dispatchEvent(altEvent(v ? 'keydown' : 'keyup')); }
  function syncAlt() { const want = on && mobileOn(); if (want && !altDown) setAlt(true); else if (!want && altDown) setAlt(false); }
  // si el navegador pierde el foco el juego suelta Alt: se vuelve a pulsar al volver
  const reAlt = () => { if (altDown) { altDown = false; syncAlt(); } };
  addEventListener('focus', reAlt); document.addEventListener('visibilitychange', () => { if (!document.hidden) reAlt(); });

  // ---- carteles de ítems apilados: se separan en vertical para que ninguno tape a otro (p. ej. Zen sobre una joya) ----
  function deoverlap() {
    if (!on || !mobileOn()) return;
    const els = $$('.world-objects .drop');
    const items = els.map(e => { const r = e.getBoundingClientRect(), dy = Number(e.dataset.hcDy || 0); return { e, l: r.left, r: r.right, t: r.top - dy, b: r.bottom - dy, h: r.height, dy }; }).filter(o => o.h > 0);
    items.sort((a, b) => a.t - b.t || a.l - b.l);
    const placed = [];
    for (const o of items) {
      let dy = 0;
      for (let guard = 0; guard < 30; guard++) {
        let hit = null;
        for (const p of placed) if (o.l < p.r - 1 && o.r > p.l + 1 && o.t + dy < p.b && o.b + dy > p.t) { hit = p; break; }
        if (!hit) break;
        dy = hit.b - o.t + 1;
      }
      placed.push({ l: o.l, r: o.r, t: o.t + dy, b: o.b + dy });
      if (dy !== o.dy) { o.e.style.translate = dy ? `0px ${dy}px` : ''; o.e.dataset.hcDy = String(dy); }
    }
  }
  setInterval(deoverlap, 120);

  // ---- mantener pulsado sobre un personaje: abre el menú rápido del propio juego (Trade, Compra, Party, Susurro, Seguir, Duelo, Atacar) ----
  // El juego ya lo abre con clic derecho (o Alt/Mayús) sobre un jugador. Aquí se repite ese clic derecho en el punto pulsado; el menú, los nombres
  // y las acciones son los del cliente. Con PvP encendido el juego trata el toque como ataque y no abre el menú.
  const LP_MS = 550, LP_MOVE = 10;
  let lp = null, swallowUp = false;
  const clearLp = () => { if (lp) { clearTimeout(lp.timer); lp = null; } };
  const quickEl = () => $('.quick-command-window');
  async function openQuickAt(x, y, cv) {
    const mk = (t, btn, btns) => new PointerEvent(t, { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: btn, buttons: btns, clientX: x, clientY: y, altKey: true });
    swallowUp = true;
    noCapture(() => cv.dispatchEvent(mk('pointermove', -1, 0)));       // el juego elige el objetivo con el último movimiento
    await sleep(90);
    noCapture(() => { cv.dispatchEvent(mk('pointerdown', 2, 2)); cv.dispatchEvent(mk('pointerup', 2, 0)); });
    await sleep(220);
    const q = quickEl();
    if (!q) { swallowUp = false; return; }                           // no había ningún jugador bajo el dedo
    // el menú es pequeño: se agranda según la pantalla y se mantiene dentro de ella
    await sleep(40);
    const r = q.getBoundingClientRect();
    const left = Math.max(4, Math.min(innerWidth - r.width - 4, r.left)), top = Math.max(4, Math.min(innerHeight - r.height - 4, r.top));
    q.style.left = Math.round(left) + 'px'; q.style.top = Math.round(top) + 'px';
  }
  document.addEventListener('pointerdown', (e) => {
    if (!on || !e.isTrusted || e.button !== 0 || !mobileOn()) return;
    const cv = e.target;
    if (!cv || cv.tagName !== 'CANVAS' || document.documentElement.classList.contains('hc-under')) return;
    if (!cv.__hcLp) {   // el siguiente pointerup real (al soltar el dedo) no debe cerrar el menú que se acaba de abrir
      cv.__hcLp = true;
      cv.addEventListener('pointerup', (ev) => { if (swallowUp && ev.isTrusted) { swallowUp = false; ev.stopPropagation(); } });
    }
    clearLp(); const x = e.clientX, y = e.clientY;
    lp = { id: e.pointerId, x, y, timer: setTimeout(() => { lp = null; openQuickAt(x, y, cv); }, LP_MS) };
  }, true);
  document.addEventListener('pointermove', (e) => { if (lp && e.pointerId === lp.id && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > LP_MOVE) clearLp(); }, true);
  ['pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, (e) => { if (lp && e.pointerId === lp.id) clearLp(); }, true));

  info.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); harvest(); });

  let queued = false;
  function queue() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; try { layout(); } catch (e) { console.warn('HUD circular', e); } }); }
  new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', queue); addEventListener('orientationchange', queue);
  setInterval(queue, 700);

  window.__hudCircularToggle = () => { on = !on; try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* nada */ } queue(); return on; };
  window.__hudCircularHarvest = harvest;
  queue();
})();

}catch(e){alert("HUD circular: "+e.message)}})();
