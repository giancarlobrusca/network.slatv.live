// THE SLA NETWORK: raw WebGL renderer (no deps) with a 2D-canvas fallback.
// Palette is sourced from SLA, MTS and Pitch Night CSS (see README).
(() => {
'use strict';
const PAL = {               // per-vertical star colors
  dev:      '#39f688',      // SLA --acid (slatv.live)
  producto: '#ffc800',      // MTS --mts-yellow (mts.now)
  diseno:   '#ff6b6b',      // MTS coral #ff6b6b (mts.now bundle)
  hogar:    '#b07ae0',      // approximation: lightened Pitch Night --purple #7534ab
  fintech:  '#a7bb6e',      // Pitch Night --lcd (pitchnight.slatv.live)
  negocios: '#ff6719',      // MTS orange #FF6719 (mts.now bundle)
  team:     '#c8ffdf',      // SLA --acid mixed toward --foreground (green-white)
  null:     '#eafff3',      // SLA --foreground
  hub:      '#39f688'       // SLA hub star
};
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = id => document.getElementById(id);
const C = $('sky');
const hex = h => [1,3,5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const XCOL = hex('#8fe9ff'); // X streams: cool cyan-white (approximation, not a brand color)
const h32 = s => { let x = 2166136261; for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return (x >>> 0) / 4294967296; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let W = 0, H = 0, DPR = 1, data, stars = [], links = [], xlinks = [], showX = true, dust = [], hover = null, sel = null, filter = null;
const cam = { yaw: 1.25, pitch: -0.42, vy: 0, vp: 0, zoom: 1 };

// ---------- data ----------
fetch('data/constellation.json').then(r => r.json()).then(d => { data = d; build(); init(); requestAnimationFrame(loop); })
  .catch(e => console.error('No se pudo cargar data/constellation.json', e));

function build() {
  const comp = Object.fromEntries(data.companies.map(c => [c.id, c]));
  const ep = Object.fromEntries(data.episodes.map(e => [e.id, e]));
  const vs = [...data.verticals.map(v => v.id), null];
  stars = data.people.map(p => {
    const v = (p.companies.map(c => comp[c]?.vertical).find(Boolean)) ?? null;
    const vi = vs.indexOf(v);
    const a = vi / vs.length * Math.PI * 2 + (h32(p.id) - .5) * 1.1;
    const r = (0.6 + h32(p.id + 'r') * 0.5) * Math.min(1.45, Math.sqrt(data.people.length / 9));
    if (p.team) { const ti = data.people.filter(q => q.team).indexOf(p), tn = data.people.filter(q => q.team).length, ta = ti / tn * Math.PI * 2;
      return { p, v, comp, ep, team: true, col: hex(PAL.team), css: PAL.team, pos: [Math.cos(ta) * .55, Math.sin(ta * 2) * .08, Math.sin(ta) * .55], size: 1.35, views: 0, ph: h32(p.id + 't') * 6.28, sx: 0, sy: 0, sz: 1, k: 1, hl: 0 }; }
    const views = p.episodes.reduce((s, e) => s + (ep[e]?.views || 0), 0);
    return { p, v, comp, ep, col: hex(PAL[v] || PAL.null), css: PAL[v] || PAL.null,
      pos: [Math.cos(a) * r, (h32(p.id + 'y') - .5) * 1.3 * Math.min(1.4, Math.sqrt(data.people.length / 9)), Math.sin(a) * r],
      size: 0.75 + p.episodes.length * 0.08 + (views ? Math.log10(views) * 0.27 : 0.35), views,
      ph: h32(p.id + 't') * 6.28, sx: 0, sy: 0, sz: 1, k: 1, hl: 0 };
  });
  if (data.hub) stars.push({ p: { ...data.hub, companies: [], episodes: [], investors: [] }, hub: true, v: 'hub', comp, ep, col: hex(PAL.hub), css: PAL.hub,
    pos: [0, 0, 0], size: 2.1, ph: 0, sx: 0, sy: 0, sz: 1, k: 1, hl: 0 });
  // relax: push stars apart so names never pile up (deterministic)
  for (let it = 0; it < 120; it++) for (const a of stars) for (const b of stars) { if (a === b || a.hub || a.team) continue; const lim = b.team || b.hub ? 1.1 : .8;
    const d = [0,1,2].map(i => a.pos[i] - b.pos[i]), l = Math.hypot(...d) || 1e-3; if (l < lim) for (let i = 0; i < 3; i++) a.pos[i] += d[i] / l * (lim - l) * .25; }
  const hubS = stars.find(s => s.hub); if (hubS) stars.filter(s => s.team).forEach(s => links.push({ a: hubS, b: s, kind: 'equipo' }));
  const groups = k => { const m = {}; stars.forEach(s => (s.p[k] || []).forEach(id => (m[id] ??= []).push(s))); return m; };
  for (const [k, kind] of [['companies','empresa'], ['episodes','episodio'], ['investors','inversor']])
    for (const g of Object.values(groups(k)).map(g => g.filter(s => !s.team))) for (let i = 1; i < g.length; i++) links.push({ a: g[i - 1], b: g[i], kind });
  // X interactions -> directed streams, aggregated per (source,target)
  const byId = Object.fromEntries(stars.map(s => [s.p.id, s])), xa = {};
  for (const r of data.interactions || []) { const a = byId[r.source], b = byId[r.target]; if (!a || !b) continue;
    const k = r.source + '>' + r.target; const o = xa[k] ??= { a, b, count: 0, types: {}, examples: [], lastAt: '' };
    o.count += r.count; o.types[r.type] = (o.types[r.type] || 0) + r.count; o.examples.push(...r.examples.map(u => ({ u, at: r.lastAt, type: r.type })));
    if (r.lastAt > o.lastAt) o.lastAt = r.lastAt; }
  xlinks = Object.values(xa); xlinks.forEach(l => { l.mutual = !!xa[l.b.p.id + '>' + l.a.p.id]; l.ph = h32(l.a.p.id + l.b.p.id) * 10; });
  // faint "thread" lines through consecutive episodes give the sky its shape (chronological spine)
  const order = data.episodes.slice().sort((a, b) => a.date.localeCompare(b.date)).map(e => e.id);
  const first = order.map(id => stars.find(s => s.p.episodes.includes(id))).filter(Boolean);
  for (let i = 1; i < first.length; i++) if (!links.some(l => (l.a === first[i-1] && l.b === first[i]) || (l.b === first[i-1] && l.a === first[i])))
    links.push({ a: first[i - 1], b: first[i], kind: 'hilo' });
  for (let i = 0; i < 900; i++) { const u = Math.random() * 2 - 1, th = Math.random() * 6.283, rr = 2.2 + Math.random() * 3;
    dust.push({ pos: [Math.sqrt(1 - u * u) * Math.cos(th) * rr, u * rr, Math.sqrt(1 - u * u) * Math.sin(th) * rr], ph: Math.random() * 6.28, b: Math.random() }); }

  // UI: legend, stats, labels
  const count = id => stars.filter(s => s.v === id).length;
  const items = [...data.verticals.map(v => ({ id: v.id, name: v.name })), ...(count(null) ? [{ id: null, name: 'Sin vertical' }] : [])];
  $('legend').innerHTML = (xlinks.length ? `<button data-x class="xt on" aria-pressed="true" style="color:#8fe9ff"><b class="xs"></b><span style="color:rgba(234,255,243,.82)">Conexiones en X</span><small>${xlinks.length}</small></button><hr>` : '') + items.map(v => `<button data-v="${v.id}" style="color:${PAL[v.id] || PAL.null}"><b></b><span style="color:rgba(234,255,243,.82)">${esc(v.name)}</span><small>${count(v.id)}</small></button>`).join('');
  $('legend').onclick = e => { const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-x')) { showX = !showX; b.classList.toggle('on', showX); b.setAttribute('aria-pressed', showX); return; } const v = b.dataset.v === 'null' ? null : b.dataset.v;
    filterOn = !(filterOn && filter === v); filter = v; $('legend').classList.toggle('filtering', filterOn);
    [...$('legend').querySelectorAll('button:not([data-x])')].forEach(x => x.classList.toggle('on', filterOn && x === b)); if (sel && !visible(sel)) hide(); };
  $('stats').innerHTML = [['ESTRELLAS', stars.length], ['EPISODIOS', data.episodes.length], ['LAZOS', links.filter(l => l.kind !== 'hilo').length], ['EN X', xlinks.length]]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${String(v).padStart(2, '0')}</dd></div>`).join('');
  const L = $('labels');
  stars.forEach(s => { const el = document.createElement('div'); el.className = 'lbl';
    const c = s.p.companies.map(c => s.comp[c]?.name).filter(Boolean)[0];
    el.innerHTML = `${esc(s.p.name)}${c && c !== s.p.name ? `<span>${esc(c)}</span>` : ''}${s.p.avatar ? `<img class="lav" src="${esc(s.p.avatar)}" alt="" loading="lazy">` : ''}`; L.appendChild(el); s.el = el; });
}
let filterOn = false;
const visible = s => !filterOn || s.v === filter || s.hub;

// ---------- projection ----------
function project(p, t) {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  let x = p[0] * cy - p[2] * sy, z = p[0] * sy + p[2] * cy, y = p[1];
  const y2 = y * cp - z * sp; z = y * sp + z * cp; y = y2;
  const d = 3.1 / cam.zoom, k = 1 / (d + z);
  const f = W > 900 ? Math.min(W, H) * 1.25 : Math.min(W, H) * 1.2;
  const cx = W > 900 ? W * 0.6 : W * 0.5, cyy = W > 900 ? H * 0.52 : H * 0.6;
  return [cx + x * f * k, cyy + y * f * k, k * d, z];
}

// ---------- WebGL ----------
let gl, prog = {}, buf;
const VS_BG = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
const FS_BG = `precision highp float;uniform vec2 r;uniform float t;uniform vec2 m;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
void main(){vec2 uv=gl_FragCoord.xy/r;vec2 p=(gl_FragCoord.xy-.5*r)/r.y;p+=m*.04;
 float T=t*.035;vec2 q=vec2(fbm(p*1.6+T),fbm(p*1.6-T+4.1));float f=fbm(p*1.3+q*1.8+vec2(T*.6,-T));
 vec3 bg=vec3(.008,.047,.031);
 vec3 acid=vec3(.224,.965,.533),purple=vec3(.459,.204,.671),yel=vec3(1.,.784,0.),red=vec3(.91,.227,.18);
 float band=smoothstep(.35,.95,f)*smoothstep(1.1,.1,abs(p.y+.15*sin(p.x*2.+T*3.)+.05));
 vec3 c=bg;
 c+=acid*pow(band,1.4)*.42;
 c+=purple*smoothstep(.45,.9,q.x)*smoothstep(1.1,.0,length(p-vec2(.6,.38)))*.55;
 c+=yel*smoothstep(.6,.95,q.y)*smoothstep(.9,.0,length(p-vec2(-.75,-.5)))*.16;
 c+=red*smoothstep(.62,.95,f)*smoothstep(.8,.0,length(p-vec2(.9,-.45)))*.16;
 c*=1.-.65*smoothstep(.35,1.25,length(p*vec2(.9,1.15)));
 c+=(h(gl_FragCoord.xy+fract(t)*91.)-.5)*.035;
 gl_FragColor=vec4(c,1.);}`;
const VS_PT = `attribute vec2 a;attribute float s;attribute vec4 c;uniform vec2 r;uniform float d;varying vec4 vc;
void main(){gl_Position=vec4(a/r*2.-1.,0.,1.);gl_Position.y*=-1.;gl_PointSize=s*d;vc=c;}`;
const FS_PT = `precision mediump float;varying vec4 vc;void main(){vec2 p=gl_PointCoord*2.-1.;float r=length(p);
 float core=smoothstep(.07,0.,r),halo=exp(-r*r*14.)*.9+exp(-r*5.)*.35;
 float flare=(exp(-abs(p.x)*40.)*exp(-abs(p.y)*3.)+exp(-abs(p.y)*40.)*exp(-abs(p.x)*3.))*.35;
 vec3 col=mix(vc.rgb,vec3(1.),core*.9);float a=(core+halo+flare*step(.5,vc.a))*vc.a;a*=smoothstep(1.,.85,r);
 gl_FragColor=vec4(col*a,a);}`;
const VS_LN = `attribute vec2 a;attribute vec2 u;attribute vec3 c1;attribute vec3 c2;attribute float al;uniform vec2 r;
varying vec2 vu;varying vec3 vc;varying float va;void main(){gl_Position=vec4(a/r*2.-1.,0.,1.);gl_Position.y*=-1.;vu=u;vc=mix(c1,c2,u.x);va=al;}`;
const FS_LN = `precision mediump float;uniform float t;varying vec2 vu;varying vec3 vc;varying float va;
void main(){float g=exp(-vu.y*vu.y*14.)*.5+smoothstep(.22,0.,abs(vu.y));float e=fract(vu.x-t*.22);
 float pulse=smoothstep(.0,.18,e)*smoothstep(.3,.18,e);float ends=smoothstep(0.,.06,vu.x)*smoothstep(1.,.94,vu.x);
 float a=g*(.38+pulse*1.2)*va*ends;gl_FragColor=vec4(vc*a,a);}`;

function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
function mk(vs, fs) { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const o = { p, a: {}, u: {} }; const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES), nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < na; i++) { const n = gl.getActiveAttrib(p, i).name; o.a[n] = gl.getAttribLocation(p, n); }
  for (let i = 0; i < nu; i++) { const n = gl.getActiveUniform(p, i).name; o.u[n] = gl.getUniformLocation(p, n); } return o; }

let ctx2d = null;
function init() {
  try {
    gl = C.getContext('webgl', { antialias: true, alpha: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no webgl');
    prog.bg = mk(VS_BG, FS_BG); prog.pt = mk(VS_PT, FS_PT); prog.ln = mk(VS_LN, FS_LN);
    buf = gl.createBuffer(); prog.tri = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, prog.tri);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  } catch (e) { gl = null; ctx2d = C.getContext('2d'); }
  addEventListener('resize', resize); resize(); bindInput();
}
function resize() { DPR = Math.min(devicePixelRatio || 1, W < 720 ? 1.5 : 2); W = innerWidth; H = innerHeight;
  C.width = Math.round(W * DPR); C.height = Math.round(H * DPR); if (gl) gl.viewport(0, 0, C.width, C.height);
  else ctx2d.setTransform(DPR, 0, 0, DPR, 0, 0); }

function attribs(o, layout, stride) { let off = 0; for (const [n, size] of layout) { const loc = o.a[n]; if (loc >= 0) {
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, off * 4); } off += size; } }
function off(o) { for (const k in o.a) gl.disableVertexAttribArray(o.a[k]); }

// ---------- frame ----------
let t0 = performance.now(), last = t0, mouse = [0, 0];
function loop(now) {
  const t = reduce ? 12 : (now - t0) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now;
  if (!dragging) { cam.yaw += cam.vy; cam.pitch += cam.vp; cam.vy *= .94; cam.vp *= .94; if (!reduce) cam.yaw += dt * 0.035; }
  cam.pitch = Math.max(-1.1, Math.min(1.1, cam.pitch));
  const focus = sel || hover;
  for (const s of stars) { const [x, y, k, z] = project(s.pos, t); s.sx = x; s.sy = y; s.k = k; s.z = z;
    const target = (s === focus ? 1 : 0); s.hl += (target - s.hl) * .15; }
  stars.slice().sort((a, b) => b.z - a.z).forEach((s, i) => s.el.style.zIndex = i);
  // labels: greedy placement (below, above, right, left) by depth so names never overlap
  const boxes = [];
  for (const s of stars.slice().sort((a, b) => (b === focus) - (a === focus) || !!b.hub - !!a.hub || b.size * b.k - a.size * a.k)) {
    const on = s === focus || (focus && [...links.filter(l => l.kind !== 'hilo'), ...(showX ? xlinks : [])].some(l => (l.a === focus && l.b === s) || (l.b === focus && l.a === s)));
    const w = s.el.offsetWidth || 80, h = s.el.offsetHeight || 28, g = 10 + s.size * 5 * s.k;
    const cands = [[s.sx - w / 2, s.sy + g], [s.sx - w / 2, s.sy - g - h], [s.sx + g, s.sy - h / 2], [s.sx - g - w, s.sy - h / 2]];
    let pos = null; for (const c of cands) { if (!boxes.some(b => c[0] < b[2] && c[0] + w > b[0] && c[1] < b[3] && c[1] + h > b[1])) { pos = c; break; } }
    const hidden = !pos && !on; s.el.classList.toggle('hide', hidden); pos ??= cands[0]; if (hidden) { s.el.style.transform = `translate(${pos[0].toFixed(1)}px,${pos[1].toFixed(1)}px)`; s.el.dataset.sx = s.sx | 0; s.el.dataset.sy = s.sy | 0; continue; }
    pos = [Math.max(8, Math.min(W - w - 8, pos[0])), pos[1]];
    boxes.push([pos[0] - 4, pos[1] - 2, pos[0] + w + 4, pos[1] + h + 2]);
    s.el.style.transform = `translate(${pos[0].toFixed(1)}px,${pos[1].toFixed(1)}px)`; s.el.dataset.sx = s.sx | 0; s.el.dataset.sy = s.sy | 0;
    s.el.classList.toggle('on', !!on); s.el.classList.toggle('dim', !visible(s) || (!!focus && !on)); s.el.style.opacity = (Math.min(1, s.k * 1.1)).toFixed(2); }
  gl ? drawGL(t) : draw2D(t);
  requestAnimationFrame(loop);
}

function lineQuads(t) {
  const v = []; const focus = sel || hover;
  for (const l of links) { const a = l.a, b = l.b; if (!visible(a) && !visible(b)) continue;
    const dx = b.sx - a.sx, dy = b.sy - a.sy, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const hot = focus && (a === focus || b === focus); const w = (l.kind === 'hilo' ? 3 : 7) * (hot ? 1.5 : 1) * (a.k + b.k) / 2;
    let al = l.kind === 'hilo' ? .16 : l.kind === 'episodio' ? .7 : .85; if (hot) al = 1.4; else if (focus) al *= .35;
    const P = (x, y, ux, uy) => v.push(x, y, ux, uy, ...a.col, ...b.col, al);
    const A1 = [a.sx + nx * w, a.sy + ny * w], A2 = [a.sx - nx * w, a.sy - ny * w], B1 = [b.sx + nx * w, b.sy + ny * w], B2 = [b.sx - nx * w, b.sy - ny * w];
    P(...A1, 0, 1); P(...A2, 0, -1); P(...B1, 1, 1); P(...B1, 1, 1); P(...A2, 0, -1); P(...B2, 1, -1); }
  if (showX) for (const l of xlinks) { const a = l.a, b = l.b; if (!visible(a) || !visible(b)) continue;
    const hot = focus && (a === focus || b === focus); const o = l.mutual ? 2.5 : 0;
    const dx = b.sx - a.sx, dy = b.sy - a.sy, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, w = (2 + Math.min(4, l.count * .5)) * (a.k + b.k) / 2;
    const al = (hot ? .6 : focus ? .06 : .34) * Math.max(1, 1.6 - (a.k + b.k) / 2); const P = (x, y, ux, uy) => v.push(x + nx * o, y + ny * o, ux, uy, ...XCOL, ...XCOL, al);
    P(a.sx + nx * w, a.sy + ny * w, 0, 1); P(a.sx - nx * w, a.sy - ny * w, 0, -1); P(b.sx + nx * w, b.sy + ny * w, 1, 1);
    P(b.sx + nx * w, b.sy + ny * w, 1, 1); P(a.sx - nx * w, a.sy - ny * w, 0, -1); P(b.sx - nx * w, b.sy - ny * w, 1, -1); }
  return new Float32Array(v);
}
// particle stream for X links: count -> density + size, direction source -> target
function xParticles(t, pv) { if (!showX) return; const focus = sel || hover;
  for (const l of xlinks) { const a = l.a, b = l.b; if (!visible(a) || !visible(b)) continue;
    const hot = focus && (a === focus || b === focus), dim = focus && !hot ? .15 : 1;
    const n = Math.min(14, 3 + l.count * 2), speed = .08 + Math.min(.22, l.count * .025);
    const dx = b.sx - a.sx, dy = b.sy - a.sy, len = Math.hypot(dx, dy) || 1, nx = -dy / len * (l.mutual ? 2.5 : 0), ny = dx / len * (l.mutual ? 2.5 : 0);
    for (let i = 0; i < n; i++) { const u = ((reduce ? 0 : t * speed) + i / n + l.ph) % 1, e = Math.sin(u * Math.PI);
      const k = Math.max(1, a.k + (b.k - a.k) * u);
      pv.push(a.sx + dx * u + nx, a.sy + dy * u + ny, (9 + Math.min(8, l.count)) * k * (hot ? 1.5 : 1), ...(u > .85 ? b.col : XCOL), Math.min(1, .9 + l.count * .04) * Math.pow(e, .5) * dim); } } }
function drawGL(t) {
  gl.disable(gl.BLEND); const B = prog.bg; gl.useProgram(B.p); gl.bindBuffer(gl.ARRAY_BUFFER, prog.tri);
  gl.enableVertexAttribArray(B.a.p); gl.vertexAttribPointer(B.a.p, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(B.u.r, C.width, C.height); gl.uniform1f(B.u.t, t); gl.uniform2f(B.u.m, cam.yaw % 6.283, cam.pitch); gl.drawArrays(gl.TRIANGLES, 0, 3); off(B);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  // lines
  const lv = lineQuads(t); if (lv.length) { const L = prog.ln; gl.useProgram(L.p); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, lv, gl.DYNAMIC_DRAW);
    attribs(L, [['a', 2], ['u', 2], ['c1', 3], ['c2', 3], ['al', 1]], 11); gl.uniform2f(L.u.r, W, H); gl.uniform1f(L.u.t, t); gl.drawArrays(gl.TRIANGLES, 0, lv.length / 11); off(L); }
  // points: dust then stars
  const pv = [];
  for (const d of dust) { const [x, y, k] = project(d.pos, t); if (k <= 0) continue; const tw = .55 + .45 * Math.sin(t * (.6 + d.b) + d.ph);
    pv.push(x, y, (3 + d.b * 5) * k, .8, .95, .88, (.18 + .4 * d.b) * tw * Math.min(1, k * 1.2)); }
  for (const s of stars) { const tw = .9 + .1 * Math.sin(t * 1.6 + s.ph); const vis = visible(s) ? 1 : .18; const dim = (sel || hover) && s.hl < .05 ? .55 : 1;
    pv.push(s.sx, s.sy, (70 + 40 * s.hl) * s.size * s.k * tw, ...s.col, vis * dim * (1 + .3 * s.hl)); }
  xParticles(t, pv);
  const P = prog.pt; gl.useProgram(P.p); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pv), gl.DYNAMIC_DRAW);
  attribs(P, [['a', 2], ['s', 1], ['c', 4]], 7); gl.uniform2f(P.u.r, W, H); gl.uniform1f(P.u.d, DPR); gl.drawArrays(gl.POINTS, 0, pv.length / 7); off(P);
}
function draw2D(t) {
  const X = ctx2d, g = X.createRadialGradient(W * .6, H * .5, 0, W * .6, H * .5, Math.max(W, H) * .8);
  g.addColorStop(0, '#0b2a1c'); g.addColorStop(.5, '#06140e'); g.addColorStop(1, '#020c08'); X.fillStyle = g; X.fillRect(0, 0, W, H);
  for (const d of dust) { const [x, y, k] = project(d.pos, t); X.fillStyle = `rgba(220,255,235,${.3 * d.b * k})`; X.fillRect(x, y, 1.2, 1.2); }
  X.globalCompositeOperation = 'lighter';
  for (const l of links) { const gr = X.createLinearGradient(l.a.sx, l.a.sy, l.b.sx, l.b.sy); gr.addColorStop(0, l.a.css); gr.addColorStop(1, l.b.css);
    X.strokeStyle = gr; X.globalAlpha = l.kind === 'hilo' ? .15 : .6; X.lineWidth = 1; X.beginPath(); X.moveTo(l.a.sx, l.a.sy); X.lineTo(l.b.sx, l.b.sy); X.stroke(); }
  for (const s of stars) { const r = 10 * s.size * s.k * (1 + .4 * s.hl), gg = X.createRadialGradient(s.sx, s.sy, 0, s.sx, s.sy, r * 2.5);
    gg.addColorStop(0, '#fff'); gg.addColorStop(.12, s.css); gg.addColorStop(1, 'transparent'); X.globalAlpha = visible(s) ? 1 : .2; X.fillStyle = gg; X.beginPath(); X.arc(s.sx, s.sy, r * 2.5, 0, 7); X.fill(); }
  if (showX) { const pv = []; xParticles(t, pv); for (let i = 0; i < pv.length; i += 7) { X.globalAlpha = pv[i + 6]; X.fillStyle = '#8fe9ff'; X.beginPath(); X.arc(pv[i], pv[i + 1], pv[i + 2] / 6, 0, 7); X.fill(); } }
  X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
}

// ---------- input ----------
let dragging = false, moved = 0, lx = 0, ly = 0, ptype = 'mouse', downAt = 0;
function pick(x, y) { let b = null, bd = ptype === 'mouse' ? 26 : 44; for (const s of stars) { if (!visible(s)) continue; const d = Math.hypot(s.sx - x, s.sy - y); if (d < bd) { bd = d; b = s; } } return b; }
const tapSlop = () => ptype === 'mouse' ? 6 : 14;
function bindInput() {
  C.addEventListener('pointercancel', () => { dragging = false; C.classList.remove('drag'); });
  C.addEventListener('pointerdown', e => { ptype = e.pointerType || 'mouse'; downAt = performance.now(); dragging = true; moved = 0; lx = e.clientX; ly = e.clientY; C.setPointerCapture(e.pointerId); C.classList.add('drag'); });
  C.addEventListener('pointermove', e => { mouse = [e.clientX / W - .5, e.clientY / H - .5];
    if (dragging) { const dx = e.clientX - lx, dy = e.clientY - ly; moved += Math.abs(dx) + Math.abs(dy); lx = e.clientX; ly = e.clientY;
      cam.yaw += dx * .005; cam.pitch += dy * .004; cam.vy = dx * .0008; cam.vp = dy * .0006; if (moved > tapSlop()) $('hint').style.opacity = 0; return; }
    hover = pick(e.clientX, e.clientY); C.classList.toggle('hot', !!hover); });
  C.addEventListener('pointerup', e => { dragging = false; C.classList.remove('drag'); if (moved < tapSlop() || (ptype !== 'mouse' && performance.now() - downAt < 250 && moved < 24)) { cam.vy = cam.vp = 0; const s = pick(e.clientX, e.clientY); s ? show(s) : hide(); } });
  C.addEventListener('pointerleave', () => { hover = null; });
  C.addEventListener('wheel', e => { e.preventDefault(); cam.zoom = Math.max(.7, Math.min(1.8, cam.zoom * Math.exp(-e.deltaY * .001))); }, { passive: false });
  $('close').onclick = hide; addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
}

// ---------- card ----------
const SV = d => `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">${d}</svg>`;
const ICONS = {
  x: SV('<path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.2h1.7L7.4 4.73H5.58L16.67 19.2Z"/>'),
  linkedin: SV('<path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4V21H3V9.75Zm6.5 0h3.83v1.54h.06c.53-1 1.84-2.06 3.79-2.06 4.05 0 4.8 2.67 4.8 6.13V21h-4v-4.98c0-1.19-.02-2.72-1.66-2.72-1.66 0-1.91 1.3-1.91 2.63V21h-4V9.75Z"/>'),
  github: SV('<path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/>'),
  web: SV('<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.93 6h-2.95a15.7 15.7 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.93 8ZM12 4.04A13.9 13.9 0 0 1 13.91 8h-3.82A13.9 13.9 0 0 1 12 4.04ZM4.26 14a8.2 8.2 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4H4.26Zm.81 2h2.95c.32 1.25.78 2.45 1.38 3.56A8.03 8.03 0 0 1 5.07 16Zm2.95-8H5.07a8.03 8.03 0 0 1 4.33-3.56A15.7 15.7 0 0 0 8.02 8ZM12 19.96A13.9 13.9 0 0 1 10.09 16h3.82A13.9 13.9 0 0 1 12 19.96ZM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4Zm.26 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56ZM16.36 14a16.5 16.5 0 0 0 0-4h3.38a8.2 8.2 0 0 1 0 4h-3.38Z"/>'),
  instagram: SV('<path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4ZM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4ZM12 2c-2.7 0-3.05.01-4.1.06-1.06.05-1.79.22-2.42.46a4.9 4.9 0 0 0-1.77 1.16A4.9 4.9 0 0 0 2.52 5.45c-.24.63-.41 1.36-.46 2.42C2.01 8.95 2 9.3 2 12s.01 3.05.06 4.1c.05 1.07.22 1.8.46 2.43.25.65.59 1.21 1.16 1.77.56.57 1.12.91 1.77 1.16.63.24 1.36.41 2.42.46 1.06.05 1.4.06 4.13.06s3.05-.01 4.1-.06c1.07-.05 1.8-.22 2.43-.46a4.9 4.9 0 0 0 1.77-1.16 4.9 4.9 0 0 0 1.16-1.77c.24-.63.41-1.36.46-2.43.05-1.05.06-1.4.06-4.1s-.01-3.05-.06-4.13c-.05-1.06-.22-1.79-.46-2.42a4.9 4.9 0 0 0-1.16-1.77 4.9 4.9 0 0 0-1.77-1.16c-.63-.24-1.36-.41-2.43-.46C15.05 2.01 14.7 2 12 2Z"/>'),
  youtube: SV('<path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z"/>')
};
const vname = id => id === 'hub' ? 'Hub · SLA TV' : data.verticals.find(v => v.id === id)?.name || 'Sin vertical';
function show(s) {
  sel = s; const p = s.p, cs = p.companies.map(c => s.comp[c]?.name).filter(Boolean);
  const peers = [...new Map(links.filter(l => l.kind !== 'hilo' && (l.a === s || l.b === s)).map(l => { const o = l.a === s ? l.b : l.a; return [o.p.id, { o, kind: l.kind }]; })).values()];
  const card = $('card'); card.style.setProperty('--c', s.css);
  const L = p.links || (p.x ? { x: p.x } : {});
  const ini = p.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2);
  $('cardBody').innerHTML = `<div class="prof">
      <div class="av">${p.avatar ? `<img src="${esc(p.avatar)}" alt="" width="72" height="72" decoding="async">` : `<span>${esc(ini)}</span>`}</div>
      <div class="pmeta"><span class="tag"><i></i>${esc(vname(s.v))}</span>
        <h2>${esc(p.name)}</h2><div class="sub">${esc([p.role, cs.join(', ')].filter(Boolean).join(' · ') || '—')}</div>${p.slaRole && !p.team ? `<div class="sub" style="color:var(--acid);font-size:12px;margin-top:2px">SLA · ${esc(p.slaRole)}</div>` : ""}</div></div>
    ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ''}
    ${p.skills?.length ? `<div class="chips">${p.skills.map(k => `<span>${esc(k)}</span>`).join('')}</div>` : ''}
    ${Object.keys(ICONS).some(k => L[k]) ? `<div class="soc">${Object.keys(ICONS).filter(k => L[k]).map(k => `<a href="${esc(L[k])}" target="_blank" rel="noopener" aria-label="${k}" title="${esc(L[k].replace(/^https?:\/\/(www\.)?/, ''))}">${ICONS[k]}</a>`).join('')}</div>` : ''}
    ${peers.length ? `<div class="links">CONECTA CON ${peers.map(q => `<b>${esc(q.o.p.name)}</b> <span>(${q.kind})</span>`).join(', ')}</div>` : ''}
    ${xSection(s)}
    ${p.sources?.length ? `<details class="src"><summary>Fuentes (${p.sources.length})</summary>${p.sources.map(u => /^https?:/.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, ''))}</a>` : `<span>${esc(u)}</span>`).join('')}</details>` : ''}
    <div class="eps">${p.episodes.map(e => s.ep[e]).filter(Boolean).map(e => `<a class="ep" href="${esc(e.youtube)}" target="_blank" rel="noopener">
      <div class="meta"><span>${e.number ? 'EP. ' + String(e.number).padStart(2, '0') : e.kind === 'entrevista' ? 'ENTREVISTA' : 'ESPECIAL'}</span><span>${e.views ? Number(e.views).toLocaleString('es-AR') + ' vistas · ' : ''}${esc(e.date)}</span></div>
      <div class="t">${esc(e.title)}</div><span class="go">Ver en YouTube →</span></a>`).join('')}</div>`;
  $('card').scrollTop = 0;
  card.hidden = false; card.style.animation = 'none'; card.offsetHeight; card.style.animation = ''; blip();
}
const TY = { mention: 'mención', reply: 'respuesta', quote: 'cita', follow: 'sigue' };
function xSection(s) { const rel = xlinks.filter(l => l.a === s || l.b === s); if (!rel.length) return '';
  const per = {}; for (const l of rel) { const o = l.a === s ? l.b : l.a, r = per[o.p.id] ??= { o, out: 0, inn: 0, ex: [] };
    l.a === s ? r.out += l.count : r.inn += l.count; r.ex.push(...l.examples.map(e => ({ ...e, mine: l.a === s }))); }
  const rows = Object.values(per).sort((x, y) => (y.out + y.inn) - (x.out + x.inn));
  const ex = rel.flatMap(l => l.examples.map(e => ({ ...e, from: l.a, to: l.b }))).sort((x, y) => y.at.localeCompare(x.at)).filter((e, i, a) => a.findIndex(z => z.u === e.u) === i).slice(0, 3);
  return `<div class="xsec"><div class="xh"><span>EN X</span><span>${rel.reduce((n, l) => n + l.count, 0)} interacciones</span></div>
    ${rows.map(r => `<div class="xr"><b style="color:${r.o.css}">●</b><span>${esc(r.o.p.name)}</span><small>${r.out ? '→ ' + r.out : ''}${r.out && r.inn ? ' · ' : ''}${r.inn ? '← ' + r.inn : ''}</small></div>`).join('')}
    <div class="xex">${ex.map(e => `<a href="${esc(e.u)}" target="_blank" rel="noopener">@${esc(e.from.p.social?.x || '')} → @${esc(e.to.p.social?.x || '')} · ${TY[e.type] || e.type} · post ${esc(e.u.split('/').pop().slice(-6))} ↗</a>`).join('')}</div></div>`; }
function hide() { sel = null; $('card').hidden = true; }

// ---------- ambient sound (WebAudio, no assets) ----------
let ac, master; const sb = $('sound');
sb.onclick = () => { if (!ac) { ac = new AudioContext(); master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    [110, 164.8, 220, 329.6].forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain();
      o.frequency.value = f; g.gain.value = .05 / (i + 1); l.frequency.value = .05 + i * .03; lg.gain.value = .03 / (i + 1); l.connect(lg).connect(g.gain); o.connect(g).connect(master); o.start(); l.start(); }); }
  const on = master.gain.value < .5; master.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, .8); sb.setAttribute('aria-pressed', on); };
function blip() { if (!ac || master.gain.value < .5) return; const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880 + Math.random() * 440;
  g.gain.setValueAtTime(.08, ac.currentTime); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + 1.5); o.connect(g).connect(master); o.start(); o.stop(ac.currentTime + 1.6); }
})();
