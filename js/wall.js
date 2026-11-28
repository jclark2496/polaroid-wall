// Apply CONFIG to static HTML elements
(function applyConfig(){
  document.getElementById('hdrMonogram').innerHTML = CONFIG.monogram;
  document.getElementById('hdrLive').textContent = CONFIG.eventLabel + ' · ' + CONFIG.location;
  document.getElementById('hdrRight').innerHTML = CONFIG.headerRight;
  document.getElementById('heroNames').innerHTML = CONFIG.names.replace('&', '<span class="hero-amp">&amp;</span>');
  document.getElementById('heroDate').textContent = CONFIG.heroDate;
  document.getElementById('heroLoc').textContent = CONFIG.heroVenue;
  document.getElementById('footerMonogram').textContent = CONFIG.monogram;
  document.getElementById('footerSub').innerHTML = CONFIG.heroDate.split('·')[0].trim().replace(/\//g,'-') + ' &nbsp;·&nbsp; ' + CONFIG.venue + ' &nbsp;·&nbsp; ' + CONFIG.location;
  document.querySelector('.cd-em').textContent = '— ' + CONFIG.countdownText;
})();
// ────────────────────────────────────────────────────────────────────────────

let lbp=null;
const SK=[{s:'♡',c:'s-rose'},{s:'☀',c:'s-gold'},{s:'❀',c:'s-coral'},{s:'∞',c:'s-sage'},{s:'✿',c:'s-rose'},{s:'❋',c:'s-gold'}];

function tick(){
  const cdp=document.getElementById('cdp');
  const diff=new Date(CONFIG.eventDate)-new Date();
  if(diff<=0){cdp.classList.add('is-today');cdp.innerHTML='today.';return;}
  document.getElementById('cdd').textContent=Math.floor(diff/86400000);
  document.getElementById('cdh').textContent=Math.floor((diff%86400000)/3600000);
  document.getElementById('cdm').textContent=Math.floor((diff%3600000)/60000);
}
tick();setInterval(tick,30000);

const fab=document.getElementById('fab'),ov=document.getElementById('ov'),
      sheet=document.getElementById('sheet'),shclose=document.getElementById('shclose');
function openS(){ov.classList.add('open');sheet.classList.add('open');document.body.style.overflow='hidden';}
function closeS(){ov.classList.remove('open');sheet.classList.remove('open');document.body.style.overflow='';}
fab.addEventListener('click',openS);ov.addEventListener('click',closeS);shclose.addEventListener('click',closeS);
// Drag-to-dismiss only on handle bar + header, so the body scrolls normally.
let ty=0,dragging=false;
const dragZones=[document.querySelector('.shdl'),document.querySelector('.shhdr')];
dragZones.forEach(el=>{
  el.addEventListener('touchstart',e=>{ty=e.touches[0].clientY;dragging=true;},{passive:true});
  el.addEventListener('touchmove',e=>{
    if(!dragging)return;
    if(e.touches[0].clientY-ty>90){closeS();dragging=false;}
  },{passive:true});
  el.addEventListener('touchend',()=>{dragging=false;},{passive:true});
  el.addEventListener('touchcancel',()=>{dragging=false;},{passive:true});
});

const nt=document.getElementById('nt'),nm=document.getElementById('nm'),
      cn=document.getElementById('cn'),fi=document.getElementById('fi'),
      ppick=document.getElementById('ppick'),shprev=document.getElementById('shprev'),
      spimg=document.getElementById('spimg'),sptext=document.getElementById('sptext'),spauth=document.getElementById('spauth');

nt.addEventListener('input',()=>{const n=nt.value.length;cn.textContent=`${n} / 60`;cn.classList.toggle('w',n>=55);sptext.textContent=nt.value||'Your note here…';});
nm.addEventListener('input',()=>{spauth.textContent=nm.value?`— ${nm.value}`:'— Your name';});
fi.addEventListener('change',()=>{if(fi.files[0]){const r=new FileReader();r.onload=e=>{spimg.src=e.target.result;shprev.classList.add('v');};r.readAsDataURL(fi.files[0]);ppick.classList.add('has');}});

if(localStorage.getItem('ep_pw'))document.getElementById('pw').value=localStorage.getItem('ep_pw');
if(localStorage.getItem('ep_nm')){nm.value=localStorage.getItem('ep_nm');spauth.textContent=`— ${nm.value}`;}

document.getElementById('sub').addEventListener('click',async()=>{
  const sst=document.getElementById('sst');
  const subBtn=document.getElementById('sub');
  if(!fi.files||!fi.files.length){sst.textContent='Please choose a photo first.';return;}
  const pw=document.getElementById('pw').value.trim();
  if(!pw){sst.textContent='Please enter the event password.';return;}
  const name=nm.value.trim()||'A Guest',note=nt.value.trim();
  const files=Array.from(fi.files).filter(f=>f.type.startsWith('image/')||/\.(heic|heif)$/i.test(f.name));
  if(!files.length){sst.textContent='Please pick a valid image.';return;}
  localStorage.setItem('ep_pw',pw);localStorage.setItem('ep_nm',name);
  subBtn.disabled=true;
  let uploaded=0,failed=0,lastErr=null;
  for(let i=0;i<files.length;i++){
    sst.textContent=files.length>1?`Uploading ${i+1} of ${files.length}…`:'Uploading your Polaroid…';
    const fd=new FormData();
    fd.append('photo',files[i]);
    fd.append('guest_name',name);
    fd.append('note',note);
    fd.append('password',pw);
    try{
      const r=await fetch('/api/upload',{method:'POST',body:fd});
      if(!r.ok){
        const err=await r.json().catch(()=>({}));
        lastErr=err.error||`HTTP ${r.status}`;
        failed++;
        if(r.status===401)break;
        continue;
      }
      const row=await r.json();
      seenIds.add(row.id);
      addPhotoToWall(photoFromApi(row), true);
      uploaded++;
    }catch(err){console.warn('upload failed:',err);lastErr='Network error — try again';failed++;}
  }
  subBtn.disabled=false;
  if(uploaded>0&&failed===0){
    sst.textContent=uploaded===1?'✓ Posted! They\'ll love it 💕':`✓ Posted ${uploaded} photos!`;
    fi.value='';nt.value='';cn.textContent='0 / 60';
    sptext.textContent='Your note here…';shprev.classList.remove('v');ppick.classList.remove('has');
    confetti();setTimeout(()=>{closeS();sst.textContent='';},1800);
  }else if(uploaded>0){
    sst.textContent=`Posted ${uploaded}, ${failed} failed. ${lastErr||''}`;
  }else{
    sst.textContent=lastErr||'Upload failed.';
  }
});

function ago(d){const s=Math.round((Date.now()-d)/1000);if(s<60)return'just now';if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;return`${Math.floor(s/86400)}d ago`;}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function openLb(p){lbp=p;document.getElementById('lbimg').src=p.src;document.getElementById('lbnt').textContent=p.note;document.getElementById('lbau').textContent=`— ${p.name}`;document.getElementById('lbtm').textContent=ago(p.time);document.getElementById('lb').classList.add('open');}
document.getElementById('lbcl').addEventListener('click',()=>document.getElementById('lb').classList.remove('open'));
document.getElementById('lb').addEventListener('click',e=>{if(e.target===document.getElementById('lb'))document.getElementById('lb').classList.remove('open');});
document.getElementById('lbdl').addEventListener('click',()=>{
  if(!lbp)return;
  const cv=document.createElement('canvas'),W=400,B=80;cv.width=W;cv.height=W+B;
  const ctx=cv.getContext('2d');ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,W,W+B);
  const img=new Image();img.onload=()=>{
    ctx.drawImage(img,10,10,W-20,W-20);ctx.fillStyle='#3A2A1A';ctx.font='italic 22px Georgia,serif';ctx.textAlign='center';
    ctx.fillText(lbp.note.slice(0,35),W/2,W+32);ctx.fillStyle='#E07060';ctx.font='italic 16px Georgia,serif';ctx.fillText(`— ${lbp.name}`,W/2,W+54);
    const a=document.createElement('a');a.download='event-polaroid.png';a.href=cv.toDataURL('image/png');a.click();
  };img.src=lbp.src;
});

function confetti(){
  const cv=document.getElementById('cc'),ctx=cv.getContext('2d');
  cv.width=window.innerWidth;cv.height=window.innerHeight;
  const cols=['#F0A898','#C8A060','#7A9E7E','#E8713A','#4A7A50','#FAFAF5'];
  let ps=Array.from({length:90},()=>({x:Math.random()*cv.width,y:-10-Math.random()*70,w:5+Math.random()*7,h:3+Math.random()*4,color:cols[Math.floor(Math.random()*cols.length)],angle:Math.random()*Math.PI*2,spin:(Math.random()-.5)*.13,vx:(Math.random()-.5)*3,vy:2+Math.random()*2.5,alpha:1}));
  function anim(){ctx.clearRect(0,0,cv.width,cv.height);ps=ps.filter(p=>p.alpha>.05);ps.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.angle+=p.spin;if(p.y>cv.height*.65)p.alpha-=.022;ctx.save();ctx.globalAlpha=p.alpha;ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.fillStyle=p.color;ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);ctx.restore();});if(ps.length)requestAnimationFrame(anim);else ctx.clearRect(0,0,cv.width,cv.height);}
  anim();
}

// === SINGLE WALL + DAY FILTER CHIPS ===
const seenIds = new Set();
const allPhotos = []; // master list, sorted newest-first

// Event days — driven by CONFIG.days above
const WEDDING_DAYS = CONFIG.days;
let currentFilter = 'all';
const PAGE_SIZE = 24;
let visibleLimit = PAGE_SIZE;

// "New since visit" — read prev, write current. First visit = no badge.
const PREV_VISIT = parseInt(localStorage.getItem('ep_prev_visit') || '0', 10);
localStorage.setItem('ep_prev_visit', String(Date.now()));

// Set timeZone to match your event location (IANA tz name, e.g. 'America/New_York')
const cancunDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit' });
function dayIdFor(uploadedAt){
  return cancunDateFmt.format(new Date(uploadedAt));
}

function photoFromApi(row){
  return {
    id: row.id,
    src: '/uploads/' + row.filename,
    thumb: '/uploads/' + row.thumb_filename,
    name: row.guest_name,
    note: row.note,
    time: new Date(row.uploaded_at),
    uploadedAt: row.uploaded_at
  };
}

function buildCardEl(p){
  const sk = SK[Math.floor(Math.random() * SK.length)];
  const c = document.createElement('div');
  c.className = 'pc';
  if(p.id != null) c.dataset.id = p.id;
  c.dataset.dayId = dayIdFor(p.uploadedAt);
  const imgSrc = esc(p.thumb || p.src);
  c.innerHTML = `<div class="tape"></div><div class="stk ${sk.c}">${sk.s}</div><img src="${imgSrc}" alt="${esc(p.name)}" loading="lazy" draggable="false"><div class="pn"><div class="pnt">${esc(p.note)}</div><div class="pna">— ${esc(p.name)}</div><div class="ptm">${ago(p.time)}</div></div>`;
  c.addEventListener('click', () => openLb(p));
  return c;
}

function buildFilterChips(){
  const nav = document.getElementById('filterNav');
  const chips = [{ id:'all', label:'All' }, ...WEDDING_DAYS];
  chips.forEach(d => {
    const c = document.createElement('a');
    c.className = 'filter-chip' + (d.wedding ? ' wedding' : '') + (d.id === currentFilter ? ' active' : '');
    c.href = '#';
    c.dataset.filter = d.id;
    if(d.wedding){
      c.innerHTML = esc(d.label) + ' <span class="filter-chip-ring">💍</span>';
    } else {
      c.textContent = d.label;
    }
    c.addEventListener('click', e => {
      e.preventDefault();
      setFilter(d.id);
    });
    nav.appendChild(c);
  });
}

function setFilter(filter){
  currentFilter = filter;
  visibleLimit = PAGE_SIZE; // reset pagination on filter change
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.filter === filter);
  });
  applyFilter();
  // Smooth-scroll the wall into view (nice UX when picking a filter)
  const grid = document.getElementById('wallGrid');
  const top = grid.getBoundingClientRect().top + window.scrollY - 120;
  window.scrollTo({ top, behavior: 'smooth' });
}

function applyFilter(){
  const grid = document.getElementById('wallGrid');
  let matchingCount = 0;
  let visibleCount = 0;
  grid.querySelectorAll('.pc').forEach(card => {
    const matches = currentFilter === 'all' || card.dataset.dayId === currentFilter;
    if(matches){
      matchingCount++;
      if(matchingCount <= visibleLimit){
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    } else {
      card.style.display = 'none';
    }
  });
  // Empty state
  let empty = grid.querySelector('.wall-empty');
  if(matchingCount === 0){
    if(!empty){
      empty = document.createElement('div');
      empty.className = 'wall-empty';
      grid.appendChild(empty);
    }
    if(currentFilter === 'all'){
      empty.innerHTML = 'Be the first to share a memory <span class="wall-empty-heart">♡</span>';
    } else {
      const day = WEDDING_DAYS.find(d => d.id === currentFilter);
      empty.textContent = day ? `No photos from ${day.label} yet — check back soon` : 'No photos yet';
    }
  } else if(empty){
    empty.remove();
  }
  // Load More button
  const loadMore = document.getElementById('loadMore');
  const remaining = matchingCount - visibleCount;
  if(remaining > 0){
    loadMore.style.display = '';
    loadMore.textContent = `Show ${Math.min(PAGE_SIZE, remaining)} more ${remaining === 1 ? 'memory' : 'memories'}`;
  } else {
    loadMore.style.display = 'none';
  }
}

function loadMoreMemories(){
  visibleLimit += PAGE_SIZE;
  applyFilter();
}
document.getElementById('loadMore').addEventListener('click', loadMoreMemories);

function addPhotoToWall(p, prepend){
  const grid = document.getElementById('wallGrid');
  if(p.id != null && grid.querySelector('.pc[data-id="' + p.id + '"]')) return;
  const empty = grid.querySelector('.wall-empty');
  if(empty) empty.remove();
  const card = buildCardEl(p);
  if(prepend && grid.firstChild) grid.insertBefore(card, grid.firstChild);
  else grid.appendChild(card);
  if(prepend) allPhotos.unshift(p); else allPhotos.push(p);
  // If the new photo matches the current filter, bump visibleLimit so it shows
  // without requiring a "load more" click. Re-run applyFilter to update visibility + button.
  const matches = currentFilter === 'all' || card.dataset.dayId === currentFilter;
  if(prepend && matches) visibleLimit++;
  applyFilter();
}

function renderNewSinceHero(){
  const hero = document.getElementById('newHero');
  const strip = document.getElementById('newHeroStrip');
  if(PREV_VISIT === 0){ hero.style.display = 'none'; return; }
  const newOnes = allPhotos.filter(p => Date.parse(p.uploadedAt) > PREV_VISIT);
  newOnes.sort((a,b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt));
  if(newOnes.length === 0){ hero.style.display = 'none'; return; }
  hero.style.display = '';
  hero.dataset.count = newOnes.length;
  document.getElementById('newCount').textContent = newOnes.length;
  strip.innerHTML = '';
  newOnes.slice(0, 12).forEach(p => strip.appendChild(buildCardEl(p)));
}

async function loadPhotos(){
  try {
    const r = await fetch('/api/photos', { cache: 'no-store' });
    if(r.status === 401){ await openWallGate(); return; }
    if(!r.ok) return;
    const { photos } = await r.json();
    // API returns newest-first; iterate oldest→newest so prepends land newest on top
    for(let i = photos.length - 1; i >= 0; i--){
      const row = photos[i];
      if(seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      addPhotoToWall(photoFromApi(row), true);
    }
    renderNewSinceHero();
  } catch(err){
    console.warn('loadPhotos failed:', err);
  }
}


// ─── PRIVATE WALL ───────────────────────────────────────────────────────────
// The wall and its photos need the event password. A guest who has posted
// before is signed in with the password they saved; anyone else sees the gate.
let gateOpen = false;
async function startViewSession(password){
  const r = await fetch('/api/session', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ password }) });
  if(r.ok) return true;
  const data = await r.json().catch(() => ({}));
  throw new Error(data.error || 'Incorrect event password.');
}
async function openWallGate(){
  const saved = localStorage.getItem('ep_pw');
  if(saved){ try { if(await startViewSession(saved)){ loadPhotos(); return; } } catch(_){} }
  if(gateOpen) return;
  gateOpen = true;
  const gate = document.getElementById('gate');
  gate.hidden = false;
  document.getElementById('gatepw').focus();
}
document.getElementById('gateForm').addEventListener('submit', async e => {
  e.preventDefault();
  const pw = document.getElementById('gatepw').value;
  const msg = document.getElementById('gatemsg');
  msg.textContent = '';
  try {
    await startViewSession(pw);
    localStorage.setItem('ep_pw', pw);
    document.getElementById('pw').value = pw;
    document.getElementById('gate').hidden = true;
    gateOpen = false;
    loadPhotos();
  } catch(err){ msg.textContent = err.message; }
});

buildFilterChips();
applyFilter();
loadPhotos();
setInterval(loadPhotos, 30000);
