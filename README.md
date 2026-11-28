# Polaroid Wall

A guest photo-sharing app for weddings, celebrations, and multi-day events. Guests scan a QR code, enter a shared password, snap a photo, and write a short note — it appears on a live Polaroid-style photo wall that everyone can see in real time.

No cloud dependencies: one small Node process, a SQLite file, and a folder of photos.

![TV slideshow mode](docs/tv-mode.jpg)

| Photo wall | Admin panel |
|---|---|
| ![Photo wall](docs/wall-desktop.jpg) | ![Admin dashboard](docs/admin-dashboard.jpg) |

*Screenshots use generated demo photos and made-up guests (see [`demo/`](demo)).*

---

## Features

- **Polaroid photo wall** — responsive grid of tilted Polaroid cards with guest notes in handwritten script
- **Private by default** — the shared event password gates uploads *and* viewing; guests enter it once and get a month-long signed session (set `PRIVATE_WALL=0` for a public wall)
- **Live updates** — wall polls every 30 seconds; new photos appear without a page refresh
- **Day/event filter chips** — sticky pill nav lets guests browse photos by event day (Welcome, Rehearsal, Wedding Day, etc.)
- **"New since your last visit" strip** — returning guests see what they missed at the top
- **Lightbox + Save Polaroid** — tap any card to open fullscreen; download a shareable Polaroid PNG via Canvas API
- **TV/slideshow mode** — fullscreen display designed for a venue screen; cycles through photos with Ken Burns effect and wake lock
- **Confetti burst** — canvas confetti fires on every successful upload
- **Admin panel** (`/admin.html`) — password-protected photo grid with edit, delete, and bulk ZIP download
- **Hourly backups** — SQLite hot backup + uploads tarball, 48-snapshot rolling retention
- **Zero external dependencies** — no S3, no auth service, no database server; just Node + SQLite + a VPS

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Single static HTML file — no framework, no build step |
| Backend | Node.js 20 + Express 4 |
| ZIP export | `archiver` |
| Image processing | `sharp` (resize, JPEG re-encode, EXIF auto-rotation) |
| Database | SQLite via `better-sqlite3` (WAL mode) |
| Reverse proxy | Caddy (handles SSL automatically) |
| Process manager | systemd |
| Fonts | Google Fonts: Cormorant Garamond, Dancing Script, Jost |

**Supported upload formats:** JPEG, PNG, HEIC/HEIF (iPhone), WebP, GIF

---

## Quick Start (local dev)

```bash
cd server
npm install

# SERVE_STATIC=1 makes the Node server also serve index.html, tv/, admin.html, img/ and /uploads
APP_DIR=/tmp/pw/app WEB_ROOT=/tmp/pw/web SERVE_STATIC=1 \
UPLOAD_PASSWORD=demo-password ADMIN_PASSWORD=admin-demo \
node server.js
```

Open <http://127.0.0.1:3300/> (wall), `/tv/` (slideshow) and `/admin.html` (admin).

Want something to look at? Seed it with the bundled demo photos:

```bash
node demo/seed.js http://127.0.0.1:3300 demo-password
```

In production, leave `SERVE_STATIC` unset and let Caddy or nginx serve the static files (see Deployment). Photos in `/uploads` are always served by the Node process so the viewing session protects them.

---

## Configuration

All event-specific text lives in the `CONFIG` block in `js/config.js`:

```js
const CONFIG = {
  names:         'Alex & Jordan',           // displayed in hero and header
  monogram:      'A♡J',                     // short monogram for header + footer
  eventDate:     '2026-06-21T17:00:00-05:00', // ISO datetime of main event (for countdown)
  eventLabel:    'The Big Day',             // shown in sticky header
  venue:         '[Your Venue]',            // short venue name
  location:      '[Your City]',             // city shown in header
  headerRight:   'Jun 21, 2026<br>[Venue]', // top-right header text (HTML ok)
  heroDate:      'Saturday, June 21, 2026 · 5:00 PM',
  heroVenue:     '[Your Venue Name · Your City]',
  countdownText: 'until the big day.',
  days: [
    { id:'2026-06-19', label:'Arrival' },
    { id:'2026-06-20', label:'Rehearsal' },
    { id:'2026-06-21', label:'The Big Day', wedding:true },
    { id:'2026-06-22', label:'Farewell' },
  ]
};
```

Also update the **Itinerary modal** in `index.html` (search for `<!-- ITINERARY MODAL -->`) with your actual schedule.

For the **TV page**, update the names, domain and password text in `tv/index.html`.

---

## Backend Environment Variables

| Variable | Default | Description |
|---|---|---|
| `UPLOAD_PASSWORD` | `changeme` | Shared password guests use to upload |
| `ADMIN_PASSWORD` | same as upload | Password for admin endpoints |
| `SESSION_SECRET` | random per start | Signs viewing sessions. Set it (`openssl rand -hex 32`) so guests stay signed in across restarts |
| `PRIVATE_WALL` | `1` | `1` requires the event password to see the wall and photos. `0` makes viewing public; uploads still need the password |
| `PORT` | `3300` | Port the server listens on |
| `SERVE_STATIC` | unset | Set to `1` (or a directory path) to serve the static site from Node — dev/demo only |
| `APP_DIR` | `/opt/polaroid-wall` | App directory (SQLite DB lives here) |
| `WEB_ROOT` | `/var/www/polaroid-wall` | Web root (uploaded photos served from here) |

Set these in your systemd unit or `.env` file — **never hardcode passwords in source**.

---

## Deployment (VPS + Caddy + systemd)

### 1. Create a system user

```bash
useradd --system --no-create-home --shell /usr/sbin/nologin polaroid-wall
```

### 2. Create directories and set permissions

```bash
mkdir -p /opt/polaroid-wall/data
mkdir -p /var/www/polaroid-wall/uploads/thumbs
chown -R polaroid-wall:polaroid-wall /opt/polaroid-wall /var/www/polaroid-wall
```

### 3. Deploy the app

```bash
# Copy server files
cp -r server/* /opt/polaroid-wall/
cd /opt/polaroid-wall && npm install --omit=dev

# Copy frontend files
cp index.html /var/www/polaroid-wall/
cp -r tv /var/www/polaroid-wall/
# Static pages and hero image
cp admin.html robots.txt /var/www/polaroid-wall/
cp -r js img /var/www/polaroid-wall/
```

### 4. Install and start the systemd service

```bash
# Edit the service file to set your passwords first
cp server/polaroid-wall.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now polaroid-wall
```

### 5. Configure Caddy

```
your-domain.com {
    root * /var/www/polaroid-wall

    # The app checks the viewing session before serving any photo
    reverse_proxy /api/* 127.0.0.1:3300
    reverse_proxy /uploads/* 127.0.0.1:3300
    file_server

    header {
        Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
        X-Content-Type-Options nosniff
        Referrer-Policy same-origin
        Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=()"
        Strict-Transport-Security "max-age=31536000"
        X-Robots-Tag "noindex, nofollow"
        -Server
    }
}
```

Upgrading from an earlier version? Caddy used to serve `/uploads` straight from disk. Route it to the app as above, or photos stay public.

```bash
systemctl reload caddy
```

### 6. Set up hourly backups (optional)

```bash
chmod +x /opt/polaroid-wall/backup.sh
echo "0 * * * * root /opt/polaroid-wall/backup.sh >> /var/log/polaroid-wall-backup.log 2>&1" \
  > /etc/cron.d/polaroid-wall-backup
```

---

## Admin Panel

Open `/admin.html` and sign in with `ADMIN_PASSWORD` (or the upload password if no admin password is set). The password is kept in `sessionStorage` only. The page lets you browse every photo, edit a guest's name or note, delete a photo, and download everything as a ZIP. It isn't linked from the guest pages, so bookmark it. It uses the `X-Admin-Password` header against these endpoints, and wrong passwords count toward the same lockout as the guest password:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/check` | Verify admin password |
| `GET` | `/api/photos` | List photos (needs a viewing session or the admin header when the wall is private) |
| `DELETE` | `/api/photos/:id` | Delete a photo and its files |
| `PATCH` | `/api/admin/photos/:id` | Edit guest name or note |
| `GET` | `/api/admin/download-all` | Download all photos as a ZIP |

---

## TV / Slideshow Mode

Navigate to `/tv/` on your event domain. Designed to run on a TV or monitor at the venue:

- Cycles through all uploaded photos every 9 seconds with a Ken Burns effect
- Polls for new photos every 30 seconds
- Shows live clock, photo count, and upload URL/password
- Uses Wake Lock API to prevent screen sleep
- Hides cursor after 3 seconds of inactivity

Update the domain and password text in `tv/index.html` before deploying. On a private wall the TV asks for the event password once and keeps a month-long session.

---

## Project Structure

```
polaroid-wall/
├── index.html              # Main guest-facing page (no build step)
├── admin.html              # Admin panel (view, edit, delete, download ZIP)
├── robots.txt              # Keeps the whole site out of search engines
├── js/
│   ├── config.js           # Your event: names, dates, days
│   ├── wall.js             # The wall, uploads, lightbox and sign-in gate
│   ├── itinerary.js        # Itinerary modal
│   └── admin.js            # Admin panel
├── tv/
│   ├── index.html          # TV/slideshow mode
│   └── tv.js
├── img/
│   └── hero.jpg            # Hero background (replace with your own)
├── server/
│   ├── server.js           # Express backend
│   ├── package.json
│   ├── backup.sh           # Hourly backup script
│   └── polaroid-wall.service  # systemd unit template
├── demo/
│   ├── seed.js             # Uploads the demo photos to a running server
│   └── photos/             # Generated demo images (no real people)
└── docs/                   # README screenshots
```

---

## Security Notes

- **Private wall:** viewing the wall, the photo list and every photo file needs a session. The session is an HMAC-SHA256-signed expiry in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` behind HTTPS), issued only after the event password.
- **Passwords** are compared with `crypto.timingSafeEqual`. Eight wrong guesses per IP in 15 minutes, on the guest *or* admin password, return HTTP 429 until the window passes.
- **Upload rate limiting:** 200 uploads per IP per 15 minutes.
- **Image validation:** formats are identified by their magic bytes (PNG, GIF, JPEG, WebP, HEIC/AVIF) with dimension limits checked before decoding, and `sharp` runs with `limitInputPixels` as a decompression bomb guard.
- **Metadata:** every photo is re-encoded, which drops EXIF data including GPS location.
- **Files:** names are random and generated by the server, written to `.part` files and renamed atomically. Photos are served with `dotfiles: deny` and no directory listing.
- **Headers:** a Content-Security-Policy with `script-src 'self'` (no inline scripts or handlers anywhere), `frame-ancestors 'none'`, `nosniff`, a same-origin referrer policy, a Permissions-Policy, and `X-Robots-Tag: noindex`. Every page also carries `noindex`, and `robots.txt` disallows everything.
- **Host:** a dedicated `nologin` user under systemd hardening, write access to two folders only, listening on 127.0.0.1.

---

## License

[MIT](LICENSE) © 2026 Jason Clark
