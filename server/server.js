'use strict';

const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT, 10) || 3300;
const HOST = '127.0.0.1';
const UPLOAD_PASSWORD = process.env.UPLOAD_PASSWORD || 'changeme';

const APP_DIR = process.env.APP_DIR || '/opt/polaroid-wall';
const WEB_ROOT = process.env.WEB_ROOT || '/var/www/polaroid-wall';
const UPLOAD_DIR = path.join(WEB_ROOT, 'uploads');
const THUMB_DIR = path.join(UPLOAD_DIR, 'thumbs');
const DATA_DIR = path.join(APP_DIR, 'data');
const DB_PATH = path.join(DATA_DIR, 'photos.db');

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;  // 25MB — covers large Android/iPhone ProRAW exports
const FULL_MAX_DIMENSION = 2048;
const THUMB_DIMENSION = 640;
const PHOTOS_QUERY_LIMIT = 1000;
const MAX_IMAGE_WIDTH = 8000;
const MAX_IMAGE_HEIGHT = 8000;
const MAX_IMAGE_PIXELS = 40 * 1000 * 1000;
const UPLOAD_WINDOW_MS = 15 * 60 * 1000;
const UPLOAD_LIMIT_PER_WINDOW = 200;  // per IP — generous for shared venue WiFi
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_FAILURE_LIMIT = 8;

for (const dir of [UPLOAD_DIR, THUMB_DIR, DATA_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    thumb_filename TEXT NOT NULL,
    guest_name TEXT NOT NULL DEFAULT 'A Guest',
    note TEXT NOT NULL DEFAULT '',
    width INTEGER,
    height INTEGER,
    file_size INTEGER,
    uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_photos_uploaded_at ON photos(uploaded_at DESC);
`);

const insertPhoto = db.prepare(`
  INSERT INTO photos (filename, thumb_filename, guest_name, note, width, height, file_size)
  VALUES (@filename, @thumb_filename, @guest_name, @note, @width, @height, @file_size)
`);
const insertPhotoTx = db.transaction((photo) => insertPhoto.run(photo));

const selectRecentPhotos = db.prepare(`
  SELECT id, filename, thumb_filename, guest_name, note, width, height, uploaded_at
  FROM photos
  ORDER BY uploaded_at DESC, id DESC
  LIMIT ?
`);

const selectCount = db.prepare('SELECT COUNT(*) AS n FROM photos');
const selectPhotoById = db.prepare('SELECT * FROM photos WHERE id = ?');
const deletePhotoById = db.prepare('DELETE FROM photos WHERE id = ?');
const updatePhoto = db.prepare(
  'UPDATE photos SET guest_name = @guest_name, note = @note WHERE id = @id'
);
const selectAllPhotos = db.prepare(
  'SELECT * FROM photos ORDER BY uploaded_at ASC'
);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || UPLOAD_PASSWORD;

function verifyAdmin(req, res) {
  const pw = req.headers['x-admin-password'] || '';
  if (!constantTimeEquals(pw, ADMIN_PASSWORD)) {
    res.status(403).json({ error: 'Forbidden.' });
    return false;
  }
  return true;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image uploads are allowed.'));
  },
});

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

const uploadAttemptsByIp = new Map();
const authFailuresByIp = new Map();

function sanitizeText(input, maxLen) {
  if (typeof input !== 'string') return '';
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maxLen);
}

function pruneWindow(bucket, now, windowMs) {
  while (bucket.length && now - bucket[0] >= windowMs) bucket.shift();
}

function recordAttempt(store, key, now, windowMs) {
  const bucket = store.get(key) || [];
  pruneWindow(bucket, now, windowMs);
  bucket.push(now);
  store.set(key, bucket);
  return bucket.length;
}

function currentAttemptCount(store, key, now, windowMs) {
  const bucket = store.get(key);
  if (!bucket) return 0;
  pruneWindow(bucket, now, windowMs);
  if (!bucket.length) {
    store.delete(key);
    return 0;
  }
  return bucket.length;
}

function getClientIp(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function constantTimeEquals(left, right) {
  const leftBuf = Buffer.from(String(left));
  const rightBuf = Buffer.from(String(right));
  if (leftBuf.length !== rightBuf.length) return false;
  return crypto.timingSafeEqual(leftBuf, rightBuf);
}

function enforceUploadRateLimit(req, res, next) {
  const now = Date.now();
  const ip = getClientIp(req);
  if (currentAttemptCount(uploadAttemptsByIp, ip, now, UPLOAD_WINDOW_MS) >= UPLOAD_LIMIT_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many upload attempts. Please wait a few minutes and try again.' });
  }
  if (currentAttemptCount(authFailuresByIp, ip, now, AUTH_WINDOW_MS) >= AUTH_FAILURE_LIMIT) {
    return res.status(429).json({ error: 'Too many incorrect password attempts. Please wait and try again.' });
  }
  recordAttempt(uploadAttemptsByIp, ip, now, UPLOAD_WINDOW_MS);
  next();
}

function parsePngDimensions(buffer) {
  if (buffer.length < 24) return null;
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { format: 'png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function parseGifDimensions(buffer) {
  if (buffer.length < 10) return null;
  const sig = buffer.toString('ascii', 0, 6);
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  return { format: 'gif', width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function parseJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) break;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      return {
        format: 'jpeg',
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function parseWebpDimensions(buffer) {
  if (buffer.length < 30) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunkType = buffer.toString('ascii', 12, 16);
  if (chunkType === 'VP8X') {
    return { format: 'webp', width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (chunkType === 'VP8 ') {
    return { format: 'webp', width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunkType === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

function collectBoxes(buffer, start, end) {
  const boxes = [];
  let offset = start;
  while (offset + 8 <= end && offset + 8 <= buffer.length) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > buffer.length) break;
      const largeSize = Number(buffer.readBigUInt64BE(offset + 8));
      if (!Number.isSafeInteger(largeSize) || largeSize < 16) break;
      size = largeSize;
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > buffer.length || offset + size > end) break;
    boxes.push({ type, contentStart: offset + headerSize, end: offset + size });
    offset += size;
  }
  return boxes;
}

function parseHeifDimensions(buffer) {
  const top = collectBoxes(buffer, 0, buffer.length);
  const ftyp = top.find((box) => box.type === 'ftyp');
  if (!ftyp || ftyp.contentStart + 8 > ftyp.end) return null;
  const brands = new Set();
  for (let pos = ftyp.contentStart; pos + 4 <= ftyp.end; pos += 4) {
    brands.add(buffer.toString('ascii', pos, pos + 4));
  }
  const supported = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis']);
  if (![...brands].some((brand) => supported.has(brand))) return null;

  const meta = top.find((box) => box.type === 'meta');
  if (!meta || meta.contentStart + 4 > meta.end) return null;
  const metaChildren = collectBoxes(buffer, meta.contentStart + 4, meta.end);
  const iprp = metaChildren.find((box) => box.type === 'iprp');
  if (!iprp) return null;
  const ipco = collectBoxes(buffer, iprp.contentStart, iprp.end).find((box) => box.type === 'ipco');
  if (!ipco) return null;
  const ispe = collectBoxes(buffer, ipco.contentStart, ipco.end).find((box) => box.type === 'ispe');
  if (!ispe || ispe.contentStart + 12 > ispe.end) return null;
  return {
    format: 'heif',
    width: buffer.readUInt32BE(ispe.contentStart + 4),
    height: buffer.readUInt32BE(ispe.contentStart + 8),
  };
}

function sniffImageDimensions(buffer) {
  return (
    parsePngDimensions(buffer) ||
    parseGifDimensions(buffer) ||
    parseJpegDimensions(buffer) ||
    parseWebpDimensions(buffer) ||
    parseHeifDimensions(buffer)
  );
}

function validateImageBuffer(buffer) {
  const info = sniffImageDimensions(buffer);
  if (!info) {
    // Unrecognised format — let sharp try it with limitInputPixels as the safety net.
    // This ensures unusual HEIC/AVIF variants from iPhones still work.
    return null;
  }
  if (!Number.isInteger(info.width) || !Number.isInteger(info.height) || info.width <= 0 || info.height <= 0) {
    const err = new Error('Invalid image dimensions.');
    err.statusCode = 400;
    throw err;
  }
  if (info.width > MAX_IMAGE_WIDTH || info.height > MAX_IMAGE_HEIGHT) {
    const err = new Error(`Image dimensions exceed the ${MAX_IMAGE_WIDTH}x${MAX_IMAGE_HEIGHT} limit.`);
    err.statusCode = 413;
    throw err;
  }
  if (info.width * info.height > MAX_IMAGE_PIXELS) {
    const err = new Error('Image resolution is too large to process safely.');
    err.statusCode = 413;
    throw err;
  }
  return info;
}

async function safeUnlink(targetPath) {
  try {
    await fs.promises.unlink(targetPath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

app.get('/api/health', (_req, res) => {
  const { n } = selectCount.get();
  res.json({ status: 'ok', photos: n, time: new Date().toISOString() });
});

app.get('/api/photos', (_req, res) => {
  const rows = selectRecentPhotos.all(PHOTOS_QUERY_LIMIT);
  res.json({ photos: rows, count: rows.length });
});

app.post('/api/upload', enforceUploadRateLimit, upload.single('photo'), async (req, res) => {
  let fullPath;
  let thumbPath;
  let tempFullPath;
  let tempThumbPath;
  try {
    const password = (req.body && req.body.password) || '';
    if (!constantTimeEquals(password, UPLOAD_PASSWORD)) {
      recordAttempt(authFailuresByIp, getClientIp(req), Date.now(), AUTH_WINDOW_MS);
      return res.status(401).json({ error: 'Incorrect event password.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No photo provided.' });
    }

    const guestName = sanitizeText(req.body.guest_name, 80) || 'A Guest';
    const note = sanitizeText(req.body.note, 200);

    const baseId = crypto.randomBytes(10).toString('hex');
    const filename = `${baseId}.jpg`;
    const thumbName = `${baseId}_t.jpg`;
    fullPath = path.join(UPLOAD_DIR, filename);
    thumbPath = path.join(THUMB_DIR, thumbName);
    tempFullPath = `${fullPath}.part`;
    tempThumbPath = `${thumbPath}.part`;

    const inspected = validateImageBuffer(req.file.buffer);
    const pipeline = sharp(req.file.buffer, {
      failOn: 'truncated',
      limitInputPixels: MAX_IMAGE_PIXELS,
    }).rotate();

    // If header sniffing didn't recognise the format, ask sharp for dimensions.
    const meta = inspected || await pipeline.metadata();
    const imgWidth = inspected ? inspected.width : (meta.width || null);
    const imgHeight = inspected ? inspected.height : (meta.height || null);

    await pipeline
      .clone()
      .resize(FULL_MAX_DIMENSION, FULL_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(tempFullPath);

    await pipeline
      .clone()
      .resize(THUMB_DIMENSION, THUMB_DIMENSION, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(tempThumbPath);

    await fs.promises.rename(tempFullPath, fullPath);
    tempFullPath = null;
    await fs.promises.rename(tempThumbPath, thumbPath);
    tempThumbPath = null;

    const stat = await fs.promises.stat(fullPath);
    const result = insertPhotoTx({
      filename,
      thumb_filename: `thumbs/${thumbName}`,
      guest_name: guestName,
      note,
      width: imgWidth,
      height: imgHeight,
      file_size: stat.size,
    });

    res.status(201).json({
      id: result.lastInsertRowid,
      filename,
      thumb_filename: `thumbs/${thumbName}`,
      guest_name: guestName,
      note,
      uploaded_at: new Date().toISOString(),
    });
  } catch (err) {
    for (const candidate of [tempFullPath, tempThumbPath, fullPath, thumbPath]) {
      if (!candidate) continue;
      try {
        await safeUnlink(candidate);
      } catch (unlinkErr) {
        console.error('[upload] cleanup error:', unlinkErr);
      }
    }
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('[upload] error:', err);
    res.status(500).json({ error: 'Failed to process photo.' });
  }
});

app.get('/api/admin/check', (req, res) => {
  if (!verifyAdmin(req, res)) return;
  res.json({ ok: true });
});

app.delete('/api/photos/:id', async (req, res) => {
  if (!verifyAdmin(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id.' });

  const photo = selectPhotoById.get(id);
  if (!photo) return res.status(404).json({ error: 'Not found.' });

  deletePhotoById.run(id);
  await safeUnlink(path.join(UPLOAD_DIR, photo.filename));
  await safeUnlink(path.join(UPLOAD_DIR, photo.thumb_filename));

  res.json({ ok: true });
});

app.patch('/api/admin/photos/:id', (req, res) => {
  if (!verifyAdmin(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id.' });

  const guestName = sanitizeText(req.body.guest_name, 80) || 'A Guest';
  const note = sanitizeText(req.body.note, 200);
  const result = updatePhoto.run({ guest_name: guestName, note, id });
  if (!result.changes) return res.status(404).json({ error: 'Not found.' });

  res.json({ ok: true, guest_name: guestName, note });
});

app.get('/api/admin/download-all', async (req, res) => {
  if (!verifyAdmin(req, res)) return;
  const archiver = require('archiver');
  const photos = selectAllPhotos.all();
  if (!photos.length) return res.status(404).json({ error: 'No photos to download.' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="event-photos.zip"');

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => {
    console.error('[download-all] archive error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Archive failed.' });
  });
  archive.pipe(res);

  for (const photo of photos) {
    const fullPath = path.join(UPLOAD_DIR, photo.filename);
    const label = `${photo.guest_name || 'guest'}_${photo.id}.jpg`
      .replace(/[^\w.\-]/g, '_');
    archive.file(fullPath, { name: label });
  }

  await archive.finalize();
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB).` });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err && /image uploads/.test(err.message || '')) {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error('[server] unhandled error:', err);
  res.status(500).json({ error: 'Server error.' });
});

// Optional: serve the static site (index.html, tv/, admin.html, img/, uploads/)
// from this process. Handy for local development and demos; in production let
// Caddy/nginx serve the files instead.
if (process.env.SERVE_STATIC) {
  const siteDir = path.resolve(process.env.SERVE_STATIC === '1' ? path.join(__dirname, '..') : process.env.SERVE_STATIC);
  app.use('/uploads', express.static(UPLOAD_DIR));
  app.use(express.static(siteDir, { index: 'index.html' }));
}

const server = app.listen(PORT, HOST, () => {
  console.log(`polaroid-wall listening on ${HOST}:${PORT} (db: ${DB_PATH})`);
});

function shutdown(signal) {
  console.log(`Received ${signal}, closing...`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
