(function(){try{(function (root) {
'use strict';
const CFG = {
FINGER_RADIUS: 24,        // px: tolerancia del toque (un ratón tiene precisión de 1 px; la yema del dedo cubre ~40 px)
REPEAT_AFTER_MS: 220,     // se empieza a repetir si sigues pulsando (el cliente abre el selector de poderes a los 400 ms)
REPEAT_EVERY_MS: 250,     // mismo ritmo que el botón de ataque oficial del cliente móvil
PILE_MAX: 5               // ítems que se listan al mantener pulsado sobre un montón
};
function distToRect(p, r) {
const dx = Math.max(r.left - p.x, 0, p.x - r.right), dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
return Math.hypot(dx, dy);
}
const center = (r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
function labelsNear(p, rects, radius = CFG.FINGER_RADIUS) {
const out = [];
rects.forEach((r, i) => {
if (!r) return;
const d = distToRect(p, r);
if (d <= radius) { const c = center(r); out.push({ i, d, dc: Math.hypot(c.x - p.x, c.y - p.y) }); }
});
out.sort((a, b) => a.d - b.d || a.dc - b.dc || a.i - b.i);
return out.map(o => o.i);
}
function pickLabel(p, rects, radius = CFG.FINGER_RADIUS) {
const l = labelsNear(p, rects, radius);
return l.length ? l[0] : -1;
}
const needsTarget = ({ pvpOn, hasTarget }) => !pvpOn && !hasTarget;
function repeatDue({ held, now, last }) {
if (held < CFG.REPEAT_AFTER_MS) return false;
return !last || now - last >= CFG.REPEAT_EVERY_MS;
}
root.__mmLogic = { CFG, distToRect, labelsNear, pickLabel, needsTarget, repeatDue };
})(typeof window !== 'undefined' ? window : globalThis);
(function () {
'use strict';
const L = window.__mmLogic;
if (window.__mm && window.__mm.toggle) { window.__mm.toggle(); return; }      // marcador: ejecutarlo otra vez lo apaga/enciende
if (!L || window.__mmLoaded) return;
window.__mmLoaded = true;
const KEY = 'portmu_movil';
const defaults = { repeat: true, tol: true, labels: true };
let st = { ...defaults };
try { st = { ...defaults, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; } catch (e) { /* sin almacenamiento */ }
let enabled = true;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* nada */ } };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const mobileOn = () => !!$('.mobile-controls');
const css = document.createElement('style');
css.textContent = `
#mm-panel{position:fixed;right:8px;top:132px;z-index:99990;display:none;flex-direction:column;gap:6px;touch-action:manipulation}
#mm-panel button{all:unset;box-sizing:border-box;width:48px;height:48px;overflow:hidden;flex-direction:column;border-radius:50%;background:rgba(20,16,12,.72);border:1px solid rgba(230,190,90,.55);color:#e6be5a;font:600 12px/1 'Segoe UI',sans-serif;text-align:center;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none}
#mm-panel button.on{background:rgba(230,190,90,.9);color:#1b140c}
#mm-panel small{display:block;font-size:9px;line-height:11px;margin-top:2px;opacity:.9;white-space:nowrap}
body.mm-labels .world-objects .drop{font-size:13px !important;padding:3px 6px !important;text-shadow:0 0 3px #000,0 0 3px #000;border-radius:3px;background:rgba(0,0,0,.35)}
#mm-pile{position:fixed;z-index:99995;background:rgba(18,14,10,.94);border:1px solid rgba(230,190,90,.7);border-radius:8px;padding:4px;display:flex;flex-direction:column;gap:3px;min-width:140px}
#mm-pile button{all:unset;box-sizing:border-box;padding:9px 10px;border-radius:5px;background:rgba(255,255,255,.07);font:600 14px 'Segoe UI',sans-serif;color:#fff;cursor:pointer}
`;
document.documentElement.appendChild(css);
const panel = document.createElement('div');
panel.id = 'mm-panel';
const mkBtn = (id, html, title) => { const b = document.createElement('button'); b.id = id; b.type = 'button'; b.title = title; b.innerHTML = html; panel.appendChild(b); return b; };
const bLoot = mkBtn('mm-loot', '👁<small>Botín</small>', 'Botín: como mantener Alt en PC (nombres de todos los ítems del suelo; el toque prefiere ítems). Toca para activar/desactivar.');
const bRep = mkBtn('mm-rep', '🔁<small>Repetir</small>', 'Mantener un poder lo repite (como el botón derecho mantenido en PC)');
const bTol = mkBtn('mm-tol', '🎯<small>Dedo</small>', 'El toque elige el ítem más cercano al dedo (hasta 24 px)');
document.documentElement.appendChild(panel);
const paint = () => {
bRep.classList.toggle('on', !!st.repeat); bTol.classList.toggle('on', !!st.tol);
bLoot.classList.toggle('on', altDown);
document.body && document.body.classList.toggle('mm-labels', !!st.labels);
};
let altDown = false;
const altEvent = (type) => new KeyboardEvent(type, { code: 'AltLeft', key: 'Alt', keyCode: 18, which: 18, altKey: type === 'keydown', bubbles: true, cancelable: true });
function setAlt(on) {
if (on === altDown) return;
altDown = on;
document.dispatchEvent(altEvent(on ? 'keydown' : 'keyup'));
paint();
}
bLoot.addEventListener('click', (e) => { e.stopPropagation(); setAlt(!altDown); });
bLoot.addEventListener('pointerdown', (e) => e.stopPropagation());
const synth = (el, type, pointerId, extra = {}) => {
const r = el.getBoundingClientRect();
el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId, pointerType: 'touch', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, ...extra }));
};
const tap = (el, pointerId) => { synth(el, 'pointerdown', pointerId); synth(el, 'pointerup', pointerId); };
const hasTarget = () => !!$('.mobile-target-label');
const pvpOn = () => !!$('.mobile-pvp-button.on');
let hold = null;     // { el, pid, t0, last, timer }
function stopHold() { if (hold) { clearInterval(hold.timer); hold = null; } }
function tick() {
if (!hold) return;
if (!document.contains(hold.el) || document.hidden) return stopHold();
const now = Date.now();
if (!L.repeatDue({ held: now - hold.t0, now, last: hold.last })) return;
hold.last = now;
if (L.needsTarget({ pvpOn: pvpOn(), hasTarget: hasTarget() })) {
const k = (type) => document.dispatchEvent(new KeyboardEvent(type, { code: 'KeyN', key: 'n', keyCode: 78, which: 78, bubbles: true, cancelable: true }));
k('keydown'); k('keyup');
}
tap(hold.el, hold.pid);                           // un toque normal sobre la ranura: lanza el poder seleccionado (el juego aplica cooldown, maná y alcance)
}
document.addEventListener('pointerdown', (e) => {
if (!enabled || !e.isTrusted || !st.repeat || !mobileOn()) return;
const slot = e.target && e.target.closest && e.target.closest('.mobile-skill-slot');
if (!slot || !$('.mobile-skill-art', slot)) return;       // ranura vacía: se deja el comportamiento normal (abrir el selector)
stopHold();
hold = { el: slot, pid: e.pointerId, t0: Date.now(), last: 0, timer: setInterval(tick, 50) };
}, true);
const release = (e) => { if (e.isTrusted && hold && e.pointerId === hold.pid) stopHold(); };
document.addEventListener('pointerup', release, true);
document.addEventListener('pointercancel', release, true);
window.addEventListener('blur', stopHold);
const labels = () => $$('.world-objects .drop');
const rectOf = (el) => { const r = el.getBoundingClientRect(); return r.width && r.height ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null; };
let pileTimer = null, pileStart = null;
const closePile = () => { const p = $('#mm-pile'); if (p) p.remove(); };
function openPile(p, els) {
closePile();
const box = document.createElement('div'); box.id = 'mm-pile';
els.slice(0, L.CFG.PILE_MAX).forEach((el) => {
const b = document.createElement('button'); b.type = 'button';
b.textContent = (el.textContent || 'ítem').trim(); b.style.color = getComputedStyle(el).color;
b.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); });
b.addEventListener('click', (ev) => { ev.stopPropagation(); closePile(); synth(el, 'pointerdown', 7001); synth(el, 'pointerup', 7001); });
box.appendChild(b);
});
box.style.left = Math.max(4, Math.min(innerWidth - 160, p.x - 70)) + 'px';
box.style.top = Math.max(4, Math.min(innerHeight - 40 - els.length * 40, p.y - 20)) + 'px';
document.documentElement.appendChild(box);
setTimeout(() => document.addEventListener('pointerdown', closePile, { once: true, capture: true }), 0);
}
document.addEventListener('pointerdown', (e) => {
clearTimeout(pileTimer);
if (!enabled || !e.isTrusted || e.pointerType !== 'touch' || !st.tol || !mobileOn()) return;
if (e.target && e.target.closest && e.target.closest('#mm-panel,#mm-pile,.mobile-controls')) return;
const els = labels(); if (!els.length) return;
const rects = els.map(rectOf), p = { x: e.clientX, y: e.clientY };
pileStart = p;
const near = L.labelsNear(p, rects);
if (!near.length) return;
const best = els[near[0]];
if (near.length > 1) {                             // montón: mantener pulsado abre la lista con solo los que hay bajo el dedo
const group = near.map(i => els[i]);
pileTimer = setTimeout(() => openPile(p, group), 450);
}
if (e.target !== best && !best.contains(e.target)) {   // el dedo no cayó exactamente sobre la etiqueta más cercana: se le pasa el toque a ella
e.stopPropagation(); e.preventDefault();
synth(best, 'pointerdown', e.pointerId, { clientX: p.x, clientY: p.y });
}
}, true);
const cancelPile = (e) => { if (e.isTrusted) clearTimeout(pileTimer); };
document.addEventListener('pointerup', cancelPile, true);
document.addEventListener('pointermove', (e) => { if (e.isTrusted && pileStart && Math.hypot(e.clientX - pileStart.x, e.clientY - pileStart.y) > 14) clearTimeout(pileTimer); }, true);      // deslizar el dedo cancela la lista
bRep.addEventListener('click', (e) => { e.stopPropagation(); st.repeat = !st.repeat; save(); paint(); });
bTol.addEventListener('click', (e) => { e.stopPropagation(); st.tol = !st.tol; save(); paint(); });
[bRep, bTol].forEach(b => b.addEventListener('pointerdown', (e) => e.stopPropagation()));
const sync = () => { const show = enabled && mobileOn(); panel.style.display = show ? 'flex' : 'none'; if (!show && altDown) setAlt(false); };
let syncQueued = false;
new MutationObserver(() => { if (syncQueued) return; syncQueued = true; requestAnimationFrame(() => { syncQueued = false; sync(); }); }).observe(document.documentElement, { childList: true, subtree: true });
sync(); paint();
const toggle = () => { enabled = !enabled; if (!enabled) { stopHold(); closePile(); } sync(); paint(); return enabled; };
window.__mm = { st, setAlt, toggle, version: 2 };
})();
}catch(e){alert("Ayuda móvil: "+e.message)}})();
