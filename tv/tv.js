const ADVANCE_MS = 9000;
const POLL_MS = 30000;
const EMPTY_RECHECK_MS = 8000;

let photos = [];
let currentIndex = 0;
let activeCard = null;
let advanceTimer = null;
let consecutiveFailures = 0;

const carousel = document.getElementById('carousel');
const emptyEl = document.getElementById('empty');
const countEl = document.getElementById('count');
const countLabel = document.getElementById('count-label');
const connError = document.getElementById('connError');

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bumpCount(n) {
  const prev = parseInt(countEl.textContent, 10) || 0;
  countEl.textContent = n;
  countLabel.textContent = n === 1 ? 'memory so far' : 'memories so far';
  if (n > prev) {
    countEl.classList.add('bump');
    setTimeout(() => countEl.classList.remove('bump'), 500);
  }
}

async function fetchPhotos() {
  try {
    const r = await fetch('/api/photos', { cache: 'no-store' });
    if (r.status === 401) { showTvGate(); return; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    consecutiveFailures = 0;
    connError.classList.remove('show');

    const incoming = data.photos || [];
    const hadNoPhotos = photos.length === 0;
    const oldFirstId = photos[0] && photos[0].id;
    photos = incoming;
    bumpCount(photos.length);

    if (photos.length === 0) {
      emptyEl.style.display = 'block';
      if (activeCard) { activeCard.remove(); activeCard = null; }
      return;
    }

    emptyEl.style.display = 'none';
    const newPhotoArrived = photos[0] && photos[0].id !== oldFirstId;

    if (hadNoPhotos) {
      currentIndex = 0;
      showPhoto(0);
      restartAdvance();
    } else if (newPhotoArrived) {
      // Show the brand-new photo on the next advance cycle
      currentIndex = -1;
    }
  } catch (err) {
    console.warn('fetchPhotos failed:', err);
    consecutiveFailures++;
    if (consecutiveFailures >= 2) connError.classList.add('show');
  }
}

function showPhoto(index) {
  if (photos.length === 0) return;
  const p = photos[index % photos.length];
  if (!p) return;

  const card = document.createElement('div');
  card.className = 'polaroid';
  // Random tilt: ±2°, biased toward small angles
  const rot = (Math.random() * 4 - 2).toFixed(2);
  card.style.setProperty('--rot', rot + 'deg');
  card.innerHTML = `
    <div class="tape tl"></div>
    <div class="tape tr"></div>
    <div class="photo-frame">
      <img src="/uploads/${escapeHtml(p.filename)}" alt="" referrerpolicy="no-referrer">
    </div>
    <div class="pinfo">
      <div class="pnote">${escapeHtml(p.note || '♡')}</div>
      <div class="pname">— ${escapeHtml(p.guest_name)}</div>
    </div>
  `;
  carousel.appendChild(card);

  // Trigger entrance after layout
  requestAnimationFrame(() => {
    requestAnimationFrame(() => card.classList.add('active'));
  });

  // Fade out the previous card; remove after transition
  if (activeCard) {
    const old = activeCard;
    old.classList.remove('active');
    setTimeout(() => old.remove(), 1500);
  }
  activeCard = card;

  // Preload the next 2 images
  for (let i = 1; i <= 2; i++) {
    const next = photos[(index + i) % photos.length];
    if (next) new Image().src = '/uploads/' + next.filename;
  }
}

function advance() {
  if (photos.length === 0) return;
  currentIndex = (currentIndex + 1 + photos.length) % photos.length;
  showPhoto(currentIndex);
}

function restartAdvance() {
  if (advanceTimer) clearInterval(advanceTimer);
  advanceTimer = setInterval(advance, ADVANCE_MS);
}

function tickClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

async function keepAwake() {
  if ('wakeLock' in navigator) {
    try { await navigator.wakeLock.request('screen'); }
    catch (e) { console.warn('wake lock denied:', e); }
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepAwake();
});

// Hide cursor after inactivity (TV mode)
let cursorTimer;
function showCursor() {
  document.body.style.cursor = 'default';
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => { document.body.style.cursor = 'none'; }, 3000);
}
document.addEventListener('mousemove', showCursor);

// Init
keepAwake();
tickClock();
setInterval(tickClock, 30000);
fetchPhotos();
setInterval(fetchPhotos, POLL_MS);

// The wall is private: the TV signs in once with the event password and keeps a month-long session.
function showTvGate() {
  const gate = document.getElementById('tvGate');
  if (!gate.hidden) return;
  gate.hidden = false;
  document.getElementById('tvGatePw').focus();
}
document.getElementById('tvGateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('tvGateMsg');
  msg.textContent = '';
  const r = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: document.getElementById('tvGatePw').value }) });
  if (!r.ok) { const d = await r.json().catch(() => ({})); msg.textContent = d.error || 'Incorrect event password.'; return; }
  document.getElementById('tvGate').hidden = true;
  fetchPhotos();
});
