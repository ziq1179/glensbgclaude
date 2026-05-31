/* The Glens Residential Home — server.js
 *
 * A small Express app that:
 *   1. Serves the existing static site (HTML/CSS/JS/images).
 *   2. Exposes a JSON API backed by Neon (serverless Postgres) so that
 *      photos, contact details and the active theme are SHARED across all
 *      visitors and devices — not just stored in one browser.
 *
 * Environment variables (set these on Render, never commit them):
 *   DATABASE_URL    Neon connection string (postgres://...). Required in prod.
 *   STAFF_PASSWORD  Password staff type on /staff to unlock the dashboard.
 *   PORT            Provided automatically by Render.
 *
 * The browser NEVER sees DATABASE_URL — only this server talks to Neon.
 */

'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || '';
const DATABASE_URL = process.env.DATABASE_URL || '';

// dataURLs for photos can be ~2MB; allow generous JSON bodies.
app.use(express.json({ limit: '6mb' }));

/* ===================== Database ===================== */

let pool = null;
if (DATABASE_URL) {
    pool = new Pool({
        connectionString: DATABASE_URL,
        // Neon requires SSL. This works for Neon's managed certs.
        ssl: { rejectUnauthorized: false }
    });
}

async function initDb() {
    if (!pool) {
        console.warn('[glens] DATABASE_URL not set — API persistence is DISABLED. ' +
            'The site will still serve, but the dashboard cannot save shared data.');
        return;
    }
    await pool.query(`
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value JSONB NOT NULL
        );
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS photos (
            id         TEXT PRIMARY KEY,
            caption    TEXT,
            target     TEXT NOT NULL,
            mime       TEXT NOT NULL,
            data       BYTEA NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    `);
    console.log('[glens] Database ready.');
}

const DEFAULT_CONTACT = {
    phone: '028 2177 1234',
    email: 'info@theglensresidentialhome.co.uk',
    address: '63 Middlepark Road, Cushendall, Co. Antrim, BT44'
};

async function getSetting(key, fallback) {
    if (!pool) return fallback;
    const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    return rows.length ? rows[0].value : fallback;
}

async function setSetting(key, value) {
    await pool.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value]
    );
}

/* ===================== Auth ===================== */
/* Login exchanges the staff password for a short-lived bearer token kept in
 * memory. Tokens are lost on restart (staff just log in again). The raw
 * password is never stored in the browser. */

const tokens = new Map(); // token -> expiry (ms epoch)
const TOKEN_TTL = 1000 * 60 * 60 * 8; // 8 hours

function issueToken() {
    const t = crypto.randomBytes(24).toString('hex');
    tokens.set(t, Date.now() + TOKEN_TTL);
    return t;
}

function timingSafeEqual(a, b) {
    const ab = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}

function requireAuth(req, res, next) {
    const header = req.headers['authorization'] || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    const expiry = tokens.get(token);
    if (!token || !expiry || expiry < Date.now()) {
        if (expiry && expiry < Date.now()) tokens.delete(token);
        return res.status(401).json({ error: 'Not authorised. Please log in again.' });
    }
    next();
}

/* ===================== API ===================== */

const api = express.Router();

// Public: full site state (no image bytes — photos reference /api/photos/:id).
api.get('/state', async (req, res) => {
    try {
        const contact = await getSetting('contact', DEFAULT_CONTACT);
        const theme = await getSetting('theme', 'default');
        let photos = [];
        if (pool) {
            const { rows } = await pool.query(
                'SELECT id, caption, target FROM photos ORDER BY created_at ASC'
            );
            photos = rows.map(r => ({
                id: r.id,
                caption: r.caption || '',
                target: r.target,
                src: '/api/photos/' + r.id
            }));
        }
        res.json({ contact, theme, photos, persistent: !!pool });
    } catch (err) {
        console.error('[glens] /state failed:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Public: serve a single photo's bytes.
api.get('/photos/:id', async (req, res) => {
    if (!pool) return res.status(404).end();
    try {
        const { rows } = await pool.query(
            'SELECT mime, data FROM photos WHERE id = $1', [req.params.id]
        );
        if (!rows.length) return res.status(404).end();
        res.setHeader('Content-Type', rows[0].mime);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(rows[0].data);
    } catch (err) {
        console.error('[glens] photo fetch failed:', err);
        res.status(500).end();
    }
});

// Login: exchange password for a bearer token.
api.post('/login', (req, res) => {
    const { password } = req.body || {};
    if (!STAFF_PASSWORD) {
        return res.status(503).json({ error: 'Staff login is not configured on the server.' });
    }
    if (!password || !timingSafeEqual(password, STAFF_PASSWORD)) {
        return res.status(401).json({ error: 'Incorrect password.' });
    }
    res.json({ token: issueToken() });
});

// Save contact details.
api.post('/contact', requireAuth, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database not configured.' });
    const { phone, email, address } = req.body || {};
    const contact = {
        phone: String(phone || '').trim(),
        email: String(email || '').trim(),
        address: String(address || '').trim()
    };
    try {
        await setSetting('contact', contact);
        res.json({ ok: true, contact });
    } catch (err) {
        console.error('[glens] save contact failed:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Save active theme.
api.post('/theme', requireAuth, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database not configured.' });
    const theme = (req.body && req.body.theme) === 'navy' ? 'navy' : 'default';
    try {
        await setSetting('theme', theme);
        res.json({ ok: true, theme });
    } catch (err) {
        console.error('[glens] save theme failed:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add a photo (src is a data URL: data:image/png;base64,....).
api.post('/photos', requireAuth, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database not configured.' });
    const { src, caption, target } = req.body || {};
    const allowedTargets = ['hero', 'home', 'life', 'both'];
    const tgt = allowedTargets.indexOf(target) >= 0 ? target : 'home';

    const m = /^data:([^;,]+);base64,(.+)$/i.exec(String(src || ''));
    if (!m) return res.status(400).json({ error: 'Image must be a base64 data URL.' });
    const mime = m[1];
    if (mime.indexOf('image/') !== 0) {
        return res.status(400).json({ error: 'File is not an image.' });
    }
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 2 * 1024 * 1024) {
        return res.status(413).json({ error: 'Image is larger than 2MB.' });
    }

    const id = 'p' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
    try {
        await pool.query(
            'INSERT INTO photos (id, caption, target, mime, data) VALUES ($1, $2, $3, $4, $5)',
            [id, String(caption || '').trim(), tgt, mime, buf]
        );
        res.json({ ok: true, id, src: '/api/photos/' + id, caption: caption || '', target: tgt });
    } catch (err) {
        console.error('[glens] add photo failed:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete a photo.
api.delete('/photos/:id', requireAuth, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database not configured.' });
    try {
        await pool.query('DELETE FROM photos WHERE id = $1', [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        console.error('[glens] delete photo failed:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.use('/api', api);

/* ===================== Static site ===================== */

app.use(express.static(__dirname, {
    extensions: ['html'],
    setHeaders(res, filePath) {
        // Let the browser cache hashed/versioned assets, but always revalidate HTML.
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

/* ===================== Boot ===================== */

initDb()
    .catch(err => console.error('[glens] DB init failed:', err))
    .finally(() => {
        app.listen(PORT, () => console.log(`[glens] Listening on port ${PORT}`));
    });
