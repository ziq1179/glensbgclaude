/* The Glens Residential Home — staff.js
 *
 * Admin dashboard. In production it talks to the shared backend API so that
 * photos, contact details and the theme are saved in Neon Postgres and seen
 * by every visitor. If no API is present (e.g. opening the static files with
 * no Node server), it falls back to this browser's localStorage so the demo
 * still works locally. */

(function () {
    'use strict';

    var SESSION_KEY = 'glens-staff-session';
    var TOKEN_KEY   = 'glens-staff-token';
    var CONTACT_KEY = 'glens-contact';
    var PHOTOS_KEY  = 'glens-photos';
    var THEME_KEY   = 'glens-theme';

    /* Demo credentials used ONLY in the localStorage fallback (no server). */
    var DEMO_USER = 'staff';
    var DEMO_PASS = 'glens2024';

    var DEFAULT_CONTACT = {
        phone: '028 2177 1234',
        email: 'info@theglensresidentialhome.co.uk',
        address: '63 Middlepark Road, Cushendall, Co. Antrim, BT44'
    };

    var MAX_BYTES = 2 * 1024 * 1024; // 2MB per image

    var loginView = document.getElementById('loginView');
    var dashView  = document.getElementById('dashView');

    /* Whether the shared backend is available. Detected on first load. */
    var apiOn = false;

    /* ===================== Small helpers ===================== */

    function token() { return sessionStorage.getItem(TOKEN_KEY) || ''; }

    function apiGetState() {
        return fetch('/api/state', { headers: { 'Accept': 'application/json' } })
            .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); });
    }

    function apiSend(method, url, body) {
        return fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token()
            },
            body: body ? JSON.stringify(body) : undefined
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (data) {
                if (!r.ok) throw new Error(data.error || ('Request failed (' + r.status + ')'));
                return data;
            });
        });
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function flash(el, msg, ok) {
        if (!el) return;
        if (typeof msg === 'string') el.textContent = msg;
        if (el.classList && el.classList.contains('form-msg')) {
            el.className = 'form-msg ' + (ok ? 'success' : 'error');
        }
        el.hidden = false;
        if (ok !== false) {
            setTimeout(function () { el.hidden = true; }, 3500);
        }
    }

    function readFile(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /* ===================== View switching ===================== */

    function isLoggedIn() {
        if (apiOn) return !!token();
        return sessionStorage.getItem(SESSION_KEY) === 'true';
    }

    function showDashboard() {
        loginView.hidden = true;
        dashView.hidden = false;
        loadTheme();
        loadContact();
        renderPhotoList();
    }

    function showLogin() {
        dashView.hidden = true;
        loginView.hidden = false;
    }

    /* ===================== Login ===================== */

    var loginForm = document.getElementById('loginForm');
    var loginError = document.getElementById('loginError');

    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var u = document.getElementById('username').value.trim();
        var p = document.getElementById('password').value;
        loginError.hidden = true;

        if (apiOn) {
            apiSend('POST', '/api/login', { password: p }).then(function (data) {
                sessionStorage.setItem(TOKEN_KEY, data.token);
                loginForm.reset();
                showDashboard();
            }).catch(function (err) {
                loginError.textContent = err.message || 'Incorrect password.';
                loginError.hidden = false;
            });
        } else {
            if (u === DEMO_USER && p === DEMO_PASS) {
                sessionStorage.setItem(SESSION_KEY, 'true');
                loginForm.reset();
                showDashboard();
            } else {
                loginError.hidden = false;
            }
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', function () {
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
        showLogin();
    });

    /* ===================== Theme switcher ===================== */

    var themeSaved = document.getElementById('themeSaved');

    function applyThemeToPage(theme) {
        if (theme === 'navy') {
            document.documentElement.setAttribute('data-theme', 'navy');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }

    function loadTheme() {
        var apply = function (theme) {
            theme = theme === 'navy' ? 'navy' : 'default';
            var radio = document.querySelector('input[name="theme"][value="' + theme + '"]');
            if (radio) radio.checked = true;
            applyThemeToPage(theme);
        };
        if (apiOn) {
            apiGetState().then(function (s) { apply(s.theme); }).catch(function () {
                apply(localStorage.getItem(THEME_KEY));
            });
        } else {
            apply(localStorage.getItem(THEME_KEY));
        }
    }

    Array.prototype.forEach.call(document.querySelectorAll('input[name="theme"]'), function (radio) {
        radio.addEventListener('change', function () {
            if (!radio.checked) return;
            var theme = radio.value === 'navy' ? 'navy' : 'default';
            applyThemeToPage(theme);
            try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
            if (apiOn) {
                apiSend('POST', '/api/theme', { theme: theme }).then(function () {
                    flash(themeSaved, null, true);
                }).catch(function (err) { flash(themeSaved, err.message, false); });
            } else {
                flash(themeSaved, null, true);
            }
        });
    });

    /* ===================== Contact editor ===================== */

    var contactForm = document.getElementById('contactForm');
    var contactSaved = document.getElementById('contactSaved');

    function fillContact(c) {
        c = c || DEFAULT_CONTACT;
        document.getElementById('cPhone').value = c.phone || '';
        document.getElementById('cEmail').value = c.email || '';
        document.getElementById('cAddress').value = c.address || '';
    }

    function loadContact() {
        if (apiOn) {
            apiGetState().then(function (s) { fillContact(s.contact); })
                .catch(function () { fillContact(DEFAULT_CONTACT); });
        } else {
            var raw = localStorage.getItem(CONTACT_KEY);
            var c = DEFAULT_CONTACT;
            if (raw) { try { c = JSON.parse(raw); } catch (e) {} }
            fillContact(c);
        }
    }

    contactForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var c = {
            phone: document.getElementById('cPhone').value.trim(),
            email: document.getElementById('cEmail').value.trim(),
            address: document.getElementById('cAddress').value.trim()
        };
        if (apiOn) {
            apiSend('POST', '/api/contact', c).then(function () {
                flash(contactSaved, null, true);
            }).catch(function (err) { flash(contactSaved, err.message, false); });
        } else {
            localStorage.setItem(CONTACT_KEY, JSON.stringify(c));
            flash(contactSaved, null, true);
        }
    });

    document.getElementById('contactReset').addEventListener('click', function () {
        fillContact(DEFAULT_CONTACT);
        if (apiOn) {
            apiSend('POST', '/api/contact', DEFAULT_CONTACT).then(function () {
                flash(contactSaved, null, true);
            }).catch(function (err) { flash(contactSaved, err.message, false); });
        } else {
            localStorage.setItem(CONTACT_KEY, JSON.stringify(DEFAULT_CONTACT));
            flash(contactSaved, null, true);
        }
    });

    /* ===================== Photo manager ===================== */

    var photoForm = document.getElementById('photoForm');
    var photoInput = document.getElementById('photoFiles');
    var photoList = document.getElementById('photoList');
    var photoMsg = document.getElementById('photoMsg');
    var photoLabels = { hero: 'Home hero banner', home: 'Home page', life: 'Life page', both: 'Home + Life' };

    /* localStorage helpers (fallback mode only) */
    function lsGetPhotos() {
        var raw = localStorage.getItem(PHOTOS_KEY);
        if (raw) { try { return JSON.parse(raw); } catch (e) {} }
        return [];
    }
    function lsSavePhotos(arr) {
        try { localStorage.setItem(PHOTOS_KEY, JSON.stringify(arr)); return true; }
        catch (e) {
            flash(photoMsg, 'Storage full — remove some photos and try again.', false);
            return false;
        }
    }

    photoForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var files = Array.prototype.slice.call(photoInput.files);
        if (!files.length) {
            flash(photoMsg, 'Please choose at least one image.', false);
            return;
        }
        var target = document.getElementById('photoTarget').value;
        var caption = document.getElementById('photoCaption').value.trim();

        var tooBig = files.filter(function (f) { return f.size > MAX_BYTES; });
        if (tooBig.length) {
            flash(photoMsg, 'Some images are larger than 2MB and were skipped.', false);
        }
        var valid = files.filter(function (f) {
            return f.type.indexOf('image/') === 0 && f.size <= MAX_BYTES;
        });
        if (!valid.length) return;

        Promise.all(valid.map(readFile)).then(function (dataUrls) {
            if (apiOn) {
                return Promise.all(dataUrls.map(function (src) {
                    return apiSend('POST', '/api/photos', { src: src, caption: caption, target: target });
                }));
            }
            var photos = lsGetPhotos();
            dataUrls.forEach(function (src) {
                photos.push({
                    id: 'p' + Date.now() + Math.random().toString(36).slice(2, 7),
                    src: src, caption: caption, target: target
                });
            });
            lsSavePhotos(photos);
            return null;
        }).then(function () {
            photoForm.reset();
            renderPhotoList();
            flash(photoMsg, valid.length + ' photo(s) published.', true);
        }).catch(function (err) {
            flash(photoMsg, err.message || 'Upload failed.', false);
        });
    });

    function renderPhotoList() {
        var done = function (photos) {
            photoList.innerHTML = '';
            if (!photos.length) {
                photoList.innerHTML = '<p class="muted">No photos published yet.</p>';
                return;
            }
            photos.forEach(function (p) {
                var card = document.createElement('div');
                card.className = 'photo-admin-item';

                var img = document.createElement('img');
                img.src = p.src;
                img.alt = p.caption || 'Uploaded photo';
                card.appendChild(img);

                var meta = document.createElement('div');
                meta.className = 'photo-admin-meta';
                meta.innerHTML = '<span class="photo-target">' + (photoLabels[p.target] || p.target) + '</span>' +
                    '<span class="photo-cap">' + (p.caption ? escapeHtml(p.caption) : '<em>No caption</em>') + '</span>';
                card.appendChild(meta);

                var del = document.createElement('button');
                del.type = 'button';
                del.className = 'btn-del';
                del.textContent = 'Remove';
                del.addEventListener('click', function () { removePhoto(p.id); });
                card.appendChild(del);

                photoList.appendChild(card);
            });
        };

        if (apiOn) {
            apiGetState().then(function (s) { done(s.photos || []); })
                .catch(function () { done([]); });
        } else {
            done(lsGetPhotos());
        }
    }

    function removePhoto(id) {
        if (apiOn) {
            apiSend('DELETE', '/api/photos/' + encodeURIComponent(id)).then(function () {
                renderPhotoList();
            }).catch(function (err) { flash(photoMsg, err.message, false); });
        } else {
            lsSavePhotos(lsGetPhotos().filter(function (x) { return x.id !== id; }));
            renderPhotoList();
        }
    }

    /* ===================== Init ===================== */

    var usernameField = document.getElementById('username');
    var usernameRow = usernameField ? usernameField.closest('.field') : null;

    apiGetState().then(function (s) {
        apiOn = !!(s && s.persistent);
    }).catch(function () {
        apiOn = false;
    }).finally(function () {
        // With the real backend, only a password is needed — hide the username field.
        if (apiOn && usernameRow) {
            usernameRow.hidden = true;
            if (usernameField) usernameField.removeAttribute('required');
        }
        if (isLoggedIn()) { showDashboard(); } else { showLogin(); }
    });

}());
