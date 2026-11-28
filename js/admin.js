const KEY = 'pw_admin_pw';           // kept in sessionStorage only (cleared when the tab closes)
const $ = id => document.getElementById(id);
let adminPw = sessionStorage.getItem(KEY) || '';
let photos = [];
let editId = null, delId = null;

function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(msg, bad){ const t=$('toast'); t.textContent=msg; t.className='toast show'+(bad?' bad':''); clearTimeout(toast.t); toast.t=setTimeout(()=>t.className='toast',2600); }

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'X-Admin-Password': adminPw, ...(opts.headers || {}) } });
  if (r.status === 403) { signOut('Session expired — please sign in again.'); throw new Error('Forbidden'); }
  return r;
}

/* ---- auth ---- */
async function signIn(pw) {
  const r = await fetch('/api/admin/check', { headers: { 'X-Admin-Password': pw } });
  if (r.status === 429) throw new Error('Too many attempts. Please wait a few minutes.');
  if (!r.ok) throw new Error('Incorrect password.');
  adminPw = pw; sessionStorage.setItem(KEY, pw);
  $('loginView').hidden = true; $('appView').hidden = false;
  await load();
}
function signOut(msg) {
  adminPw = ''; sessionStorage.removeItem(KEY);
  $('appView').hidden = true; $('loginView').hidden = false;
  $('pw').value = ''; $('loginErr').textContent = msg || '';
}
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('loginErr').textContent = '';
  try { await signIn($('pw').value); } catch (err) { $('loginErr').textContent = err.message; }
});
$('logoutBtn').onclick = () => signOut();

/* ---- list ---- */
async function load() {
  const r = await api('/api/photos', { cache: 'no-store' });
  const data = await r.json();
  photos = data.photos || [];
  render();
}
function render() {
  $('count').textContent = photos.length + (photos.length === 1 ? ' photo' : ' photos');
  $('empty').hidden = photos.length > 0;
  $('grid').innerHTML = photos.map(p => `
    <div class="pc" data-id="${p.id}">
      <img src="/uploads/${esc(p.thumb_filename)}" data-full="/uploads/${esc(p.filename)}" alt="Photo by ${esc(p.guest_name)}" loading="lazy">
      <div class="nm">${esc(p.guest_name)}</div>
      <div class="nt">${esc(p.note)}</div>
      <div class="meta">#${p.id} · ${esc(new Date(p.uploaded_at).toLocaleString())}</div>
      <div class="row">
        <button class="btn" data-act="edit">Edit</button>
        <button class="btn danger" data-act="del">Delete</button>
      </div>
    </div>`).join('');
}
$('grid').addEventListener('click', e => {
  const card = e.target.closest('.pc'); if (!card) return;
  const id = Number(card.dataset.id), p = photos.find(x => x.id === id);
  if (e.target.matches('img')) { $('lbImg').src = e.target.dataset.full; $('lbOv').classList.add('open'); }
  else if (e.target.dataset.act === 'edit') openEdit(p);
  else if (e.target.dataset.act === 'del') openDel(p);
});
$('lbOv').onclick = () => $('lbOv').classList.remove('open');
$('refreshBtn').onclick = () => load().then(() => toast('Refreshed'));

/* ---- edit (PATCH /api/admin/photos/:id) ---- */
function openEdit(p) { editId = p.id; $('eName').value = p.guest_name; $('eNote').value = p.note; $('editOv').classList.add('open'); $('eName').focus(); }
$('eCancel').onclick = () => $('editOv').classList.remove('open');
$('editForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const r = await api('/api/admin/photos/' + editId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest_name: $('eName').value, note: $('eNote').value }) });
    if (!r.ok) throw new Error((await r.json()).error || 'Save failed');
    const j = await r.json(), p = photos.find(x => x.id === editId);
    p.guest_name = j.guest_name; p.note = j.note;
    $('editOv').classList.remove('open'); render(); toast('Saved');
  } catch (err) { if (err.message !== 'Forbidden') toast(err.message, true); }
});

/* ---- delete (DELETE /api/photos/:id) ---- */
function openDel(p) { delId = p.id; $('delMsg').textContent = `Permanently delete the photo by “${p.guest_name}”? This cannot be undone.`; $('delOv').classList.add('open'); }
$('dCancel').onclick = () => $('delOv').classList.remove('open');
$('dOk').onclick = async () => {
  try {
    const r = await api('/api/photos/' + delId, { method: 'DELETE' });
    if (!r.ok) throw new Error((await r.json()).error || 'Delete failed');
    photos = photos.filter(x => x.id !== delId);
    $('delOv').classList.remove('open'); render(); toast('Deleted');
  } catch (err) { if (err.message !== 'Forbidden') toast(err.message, true); }
};

/* ---- download all (GET /api/admin/download-all) ---- */
$('zipBtn').onclick = async () => {
  const b = $('zipBtn'); b.disabled = true; b.textContent = 'Preparing…';
  try {
    const r = await api('/api/admin/download-all');
    if (!r.ok) throw new Error((await r.json()).error || 'Download failed');
    const url = URL.createObjectURL(await r.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: 'event-photos.zip' });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast('Download started');
  } catch (err) { if (err.message !== 'Forbidden') toast(err.message, true); }
  b.disabled = false; b.textContent = 'Download all (ZIP)';
};

document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open')); });

/* ---- resume session ---- */
if (adminPw) signIn(adminPw).catch(() => signOut());
