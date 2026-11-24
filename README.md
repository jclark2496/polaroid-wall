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
- **Password-gated uploads** — shared event password keeps strangers out; stored in localStorage so guests only enter it once
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

In production, leave `SERVE_STATIC` unset and let Caddy or nginx serve the static files (see Deployment).

---

## Configuration

All event-specific text lives in the `CONFIG` block near the top of `index.html`:

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
cp admin.html /var/www/polaroid-wall/
cp -r img /var/www/polaroid-wall/
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
    file_server

    reverse_proxy /api/* 127.0.0.1:3300
}
```

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

Open `/admin.html` and sign in with `ADMIN_PASSWORD` (or the upload password if no admin password is set). The password is kept in `sessionStorage` only. The page lets you browse every photo, edit a guest's name or note, delete a photo, and download everything as a ZIP. `admin.html` is `noindex`, but it is not linked from the guest pages, so bookmark it. It uses the `X-Admin-Password` header against these endpoints:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/check` | Verify admin password |
| `GET` | `/api/photos` | List photos (public; used by the wall, TV and admin pages) |
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

Update the domain and password text in `tv/index.html` before deploying.

---

## Project Structure

```
polaroid-wall/
├── index.html              # Main guest-facing app (single file, no build step)
├── admin.html              # Admin panel (view, edit, delete, download ZIP)
├── tv/
│   └── index.html          # TV/slideshow mode
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

- Passwords are compared with `crypto.timingSafeEqual` to prevent timing attacks
- Upload rate limiting: 200 uploads per IP per 15 minutes
- Auth failure rate limiting: 8 failures per IP per 15 minutes (blocks brute force)
- Images are validated by magic bytes before processing, with pixel dimension limits
- `sharp` processes images with `limitInputPixels` as a decompression bomb guard
- Uploads are written to `.part` temp files then renamed atomically
- Server runs as a dedicated low-privilege user via systemd hardening

---

## License

[MIT](LICENSE) © 2026 Jason Clark
