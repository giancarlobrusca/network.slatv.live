const C=document.getElementById('sky'),X=C.getContext('2d');let W,H,D=devicePixelRatio||1;
const PAL={producto:'#9ad0ff',diseno:'#ffb3e6',dev:'#b8ffcf',hogar:'#ffd98a',null:'#d8d8ff'};
let data,stars=[],links=[],dust=[],hover=null,sel=null,t0=performance.now();
function resize(){W=innerWidth;H=innerHeight;C.width=W*D;C.height=H*D;X.setTransform(D,0,0,D,0,0)}
addEventListener('resize',resize);resize();
// deterministic hash -> position so the sky is stable across reloads
function h(s){let x=2166136261;for(const c of s)x=Math.imul(x^c.charCodeAt(0),16777619);return (x>>>0)/4294967296}
fetch('data/constellation.json').then(r=>r.json()).then(d=>{data=d;build();requestAnimationFrame(loop)});
function build(){
  const comp=Object.fromEntries(data.companies.map(c=>[c.id,c])),ep=Object.fromEntries(data.episodes.map(e=>[e.id,e]));
  const vs=[...data.verticals.map(v=>v.id),null];
  stars=data.people.map(p=>{const v=(p.companies.map(c=>comp[c]?.vertical).find(Boolean))??null,vi=vs.indexOf(v);
    const a=vi/vs.length*Math.PI*2+h(p.id)*1.1,r=.18+h(p.id+'r')*.17;
    const views=p.episodes.reduce((s,e)=>s+(ep[e]?.views||0),0);
    return{p,v,x:.5+Math.cos(a)*r*1.25,y:.52+Math.sin(a)*r,size:2.2+p.episodes.length*1.4+(views?Math.log10(views):0),ph:h(p.id+'t')*6.28,comp,ep}});
  const by=k=>{const m={};stars.forEach(s=>s.p[k].forEach(id=>(m[id]??=[]).push(s)));return m};
  for(const [k,kind] of [['companies','empresa'],['episodes','episodio'],['investors','inversor']])
    for(const g of Object.values(by(k)))for(let i=1;i<g.length;i++)links.push({a:g[i-1],b:g[i],kind});
  for(let i=0;i<500;i++)dust.push({x:Math.random(),y:Math.random(),z:Math.random(),ph:Math.random()*6.28});
  document.getElementById('legend').innerHTML=data.verticals.map(v=>`<span class="dot" style="background:${PAL[v.id]}"></span>${v.name}`).join('');
}
let cam={x:0,y:0};
function P(s,t){const sc=Math.min(W,H)*1.1;return[W/2+(s.x-.5)*sc+cam.x,H/2+(s.y-.52)*sc+cam.y]}
function loop(now){const t=(now-t0)/1000;cam.x=Math.sin(t*.05)*25;cam.y=Math.cos(t*.037)*18;
  const g=X.createRadialGradient(W/2,H*.6,0,W/2,H*.6,Math.max(W,H));g.addColorStop(0,'#0d0b26');g.addColorStop(1,'#020208');X.fillStyle=g;X.fillRect(0,0,W,H);
  for(const d of dust){const a=.25+.35*Math.sin(t*(.5+d.z)+d.ph);X.fillStyle=`rgba(255,255,255,${a*d.z})`;X.fillRect(((d.x*W+cam.x*d.z*.5)%W+W)%W,((d.y*H+cam.y*d.z*.5)%H+H)%H,d.z*1.6,d.z*1.6)}
  for(const l of links){const[a1,a2]=P(l.a),[b1,b2]=P(l.b),on=[l.a,l.b].includes(sel)||[l.a,l.b].includes(hover);
    X.strokeStyle=`rgba(200,210,255,${on?.7:.18+.06*Math.sin(t)})`;X.setLineDash(l.kind==='episodio'?[2,4]:[]);X.lineWidth=on?1.3:.7;X.beginPath();X.moveTo(a1,a2);X.lineTo(b1,b2);X.stroke()}
  X.setLineDash([]);
  for(const s of stars){const[x,y]=P(s),tw=.75+.25*Math.sin(t*1.7+s.ph),r=s.size*tw*(s===hover||s===sel?1.5:1),c=PAL[s.v];
    const gg=X.createRadialGradient(x,y,0,x,y,r*7);gg.addColorStop(0,c);gg.addColorStop(.15,c+'88');gg.addColorStop(1,'transparent');X.fillStyle=gg;X.beginPath();X.arc(x,y,r*7,0,7);X.fill();
    X.fillStyle='#fff';X.beginPath();X.arc(x,y,r*.6,0,7);X.fill();
    X.fillStyle=`rgba(232,230,255,${s===hover||s===sel?.95:.45})`;X.font='12px Georgia';X.textAlign='center';X.fillText(s.p.name,x,y+r*3+12)}
  requestAnimationFrame(loop)}
function pick(ex,ey){let b=null,bd=28;for(const s of stars){const[x,y]=P(s),d=Math.hypot(x-ex,y-ey);if(d<bd){bd=d;b=s}}return b}
C.addEventListener('pointermove',e=>{hover=pick(e.clientX,e.clientY);C.style.cursor=hover?'pointer':'crosshair'});
C.addEventListener('click',e=>{const s=pick(e.clientX,e.clientY);s?show(s):hide()});
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function show(s){sel=s;const p=s.p,cs=p.companies.map(c=>s.comp[c]?.name).filter(Boolean);
  document.getElementById('cardBody').innerHTML=`<h2>${esc(p.name)}</h2><div class="muted">${esc([p.role,cs.join(', ')].filter(Boolean).join(' · ')||'—')}</div>
  ${p.x?`<p><a href="${esc(p.x)}" target="_blank" rel="noopener">${esc(p.x.replace('https://',''))}</a></p>`:''}
  ${p.episodes.map(e=>s.ep[e]).filter(Boolean).map(e=>`<p><b>${e.number?'Ep. '+e.number:'Especial'}</b> · ${e.date}<br><span class="muted">${esc(e.title)}</span><br><a href="${esc(e.youtube)}" target="_blank" rel="noopener">▶ Ver en YouTube</a></p>`).join('')}`;
  document.getElementById('card').hidden=false;blip()}
function hide(){sel=null;document.getElementById('card').hidden=true}
document.getElementById('close').onclick=hide;
// ambient sound: WebAudio drone, no assets
let ac,master;const sb=document.getElementById('sound');
sb.onclick=()=>{if(!ac){ac=new AudioContext();master=ac.createGain();master.gain.value=0;master.connect(ac.destination);
  [110,164.8,220,329.6].forEach((f,i)=>{const o=ac.createOscillator(),g=ac.createGain(),l=ac.createOscillator(),lg=ac.createGain();o.type='sine';o.frequency.value=f;g.gain.value=.05/(i+1);l.frequency.value=.05+i*.03;lg.gain.value=.03/(i+1);l.connect(lg).connect(g.gain);o.connect(g).connect(master);o.start();l.start()})}
  const on=master.gain.value<.5;master.gain.setTargetAtTime(on?1:0,ac.currentTime,.8);sb.textContent='♪ Sonido: '+(on?'prendido':'apagado')};
function blip(){if(!ac||master.gain.value<.5)return;const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=880+Math.random()*440;g.gain.setValueAtTime(.08,ac.currentTime);g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+1.5);o.connect(g).connect(master);o.start();o.stop(ac.currentTime+1.6)}
