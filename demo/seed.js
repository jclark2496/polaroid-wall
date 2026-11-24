// Seeds a running Polaroid Wall with generated demo photos and made-up guests.
// Usage: node demo/seed.js [baseUrl] [uploadPassword]
// Requires Node 18+ (global fetch/FormData/Blob).
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:3300';
const PASSWORD = process.argv[3] || process.env.UPLOAD_PASSWORD || 'demo-password';

const GUESTS = [
  ['Aunt Rosa', 'The table settings are gorgeous!'],
  ['Sam & Priya', 'Best cake we have ever seen 🍰'],
  ['Cousin Theo', 'Golden hour at the lake. Perfect.'],
  ['Marisol', 'Peonies for days'],
  ['The Okafor Family', 'Cheers to the happy couple!'],
  ['Biscuit the Dog', 'Dressed to impress.'],
  ['Uncle Dev', 'Getaway car is ready 🚗'],
  ['Hannah', 'Welcome sign by the garden'],
  ['Late-night crew', 'Sparkler send-off ✨'],
  ['Grandma June', 'What a beautiful day'],
  ['Chef Luis', 'Taco bar was a hit'],
  ['Ceremony team', 'Ready for the big moment'],
];

(async () => {
  const dir = path.join(__dirname, 'photos');
  const files = fs.readdirSync(dir).filter(f => /\.jpe?g$/i.test(f)).sort();
  for (let i = 0; i < files.length; i++) {
    const [guest, note] = GUESTS[i % GUESTS.length];
    const fd = new FormData();
    fd.append('password', PASSWORD);
    fd.append('guest_name', guest);
    fd.append('note', note);
    fd.append('photo', new Blob([fs.readFileSync(path.join(dir, files[i]))], { type: 'image/jpeg' }), files[i]);
    const r = await fetch(BASE + '/api/upload', { method: 'POST', body: fd });
    console.log(files[i], r.status, r.ok ? 'ok' : await r.text());
  }
})();
