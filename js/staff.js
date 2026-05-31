/* The Glens Residential Home — staff.js
   Browser-only demo admin. NOTE: this is a front-end prototype.
   "Authentication" here is NOT secure and provides no real protection —
   it only gates the demo UI. Real staff access requires a backend. */

(function () {
    'use strict';

    /* Demo credentials — prototype only, not a real security boundary. */
    var DEMO_USER = 'staff';
    var DEMO_PASS = 'glens2024';

    var SESSION_KEY = 'glens-staff-session';
    var CONTACT_KEY = 'glens-contact';
    var PHOTOS_KEY  = 'glens-photos';
    var THEME_KEY   = 'glens-theme';

    var DEFAULT_CONTACT = {
        phone: '028 2177 1234',
        email: 'info@theglensresidentialhome.co.uk',
        address: '63 Middlepark Road, Cushendall, Co. Antrim, BT44'
    };

    var loginView = document.getElementById('loginView');
    var dashView  = document.getElementById('dashView');

    function isLoggedIn() {
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

    /* ===== Login ===== */
    var loginForm = document.getElementById('loginForm');
    var loginError = document.getElementById('loginError');

    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var u = document.getElementById('username').value.trim();
        var p = document.getElementById('password').value;
        if (u === DEMO_USER && p === DEMO_PASS) {
            sessionStorage.setItem(SESSION_KEY, 'true');
            loginError.hidden = true;
            loginForm.reset();
            showDashboard();
        } else {
            loginError.hidden = false;
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', function () {
        sessionStorage.removeItem(SESSION_KEY);
        showLogin();
    });

    /* ===== Theme switcher ===== */
    var themeSaved = document.getElementById('themeSaved');

    function applyThemeToPage(theme) {
        if (theme === 'navy') {
            document.documentElement.setAttribute('data-theme', 'navy');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }

    function loadTheme() {
        var theme = localStorage.getItem(THEME_KEY) === 'navy' ? 'navy' : 'default';
        var radio = document.querySelector('input[name="theme"][value="' + theme + '"]');
        if (radio) radio.checked = true;
        applyThemeToPage(theme);
    }

    Array.prototype.forEach.call(document.querySelectorAll('input[name="theme"]'), function (radio) {
        radio.addEventListener('change', function () {
            if (!radio.checked) return;
            var theme = radio.value === 'navy' ? 'navy' : 'default';
            localStorage.setItem(THEME_KEY, theme);
            applyThemeToPage(theme);
            themeSaved.hidden = false;
            setTimeout(function () { themeSaved.hidden = true; }, 3000);
        });
    });

    /* ===== Contact editor ===== */
    var contactForm = document.getElementById('contactForm');
    var contactSaved = document.getElementById('contactSaved');

    function getContact() {
        var raw = localStorage.getItem(CONTACT_KEY);
        if (raw) { try { return JSON.parse(raw); } catch (e) {} }
        return Object.assign({}, DEFAULT_CONTACT);
    }

    function loadContact() {
        var c = getContact();
        document.getElementById('cPhone').value = c.phone || '';
        document.getElementById('cEmail').value = c.email || '';
        document.getElementById('cAddress').value = c.address || '';
    }

    contactForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var c = {
            phone: document.getElementById('cPhone').value.trim(),
            email: document.getElementById('cEmail').value.trim(),
            address: document.getElementById('cAddress').value.trim()
        };
        localStorage.setItem(CONTACT_KEY, JSON.stringify(c));
        contactSaved.hidden = false;
        setTimeout(function () { contactSaved.hidden = true; }, 3000);
    });

    document.getElementById('contactReset').addEventListener('click', function () {
        localStorage.setItem(CONTACT_KEY, JSON.stringify(DEFAULT_CONTACT));
        loadContact();
        contactSaved.hidden = false;
        setTimeout(function () { contactSaved.hidden = true; }, 3000);
    });

    /* ===== Photo manager ===== */
    var photoForm = document.getElementById('photoForm');
    var photoInput = document.getElementById('photoFiles');
    var photoList = document.getElementById('photoList');
    var photoMsg = document.getElementById('photoMsg');
    var MAX_BYTES = 1.5 * 1024 * 1024; // ~1.5MB per image to stay within localStorage limits

    function getPhotos() {
        var raw = localStorage.getItem(PHOTOS_KEY);
        if (raw) { try { return JSON.parse(raw); } catch (e) {} }
        return [];
    }

    function savePhotos(arr) {
        try {
            localStorage.setItem(PHOTOS_KEY, JSON.stringify(arr));
            return true;
        } catch (e) {
            photoMsg.textContent = 'Storage full — remove some photos and try again. (Browser storage is limited in this demo.)';
            photoMsg.className = 'form-msg error';
            photoMsg.hidden = false;
            return false;
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

    photoForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var files = Array.prototype.slice.call(photoInput.files);
        if (!files.length) {
            photoMsg.textContent = 'Please choose at least one image.';
            photoMsg.className = 'form-msg error';
            photoMsg.hidden = false;
            return;
        }
        var target = document.getElementById('photoTarget').value;
        var caption = document.getElementById('photoCaption').value.trim();

        var tooBig = files.filter(function (f) { return f.size > MAX_BYTES; });
        if (tooBig.length) {
            photoMsg.textContent = 'Some images are larger than 1.5MB and were skipped. Please use smaller images in this demo.';
            photoMsg.className = 'form-msg error';
            photoMsg.hidden = false;
        }
        var valid = files.filter(function (f) {
            return f.type.indexOf('image/') === 0 && f.size <= MAX_BYTES;
        });
        if (!valid.length) return;

        Promise.all(valid.map(readFile)).then(function (dataUrls) {
            var photos = getPhotos();
            dataUrls.forEach(function (src) {
                photos.push({
                    id: 'p' + Date.now() + Math.random().toString(36).slice(2, 7),
                    src: src,
                    caption: caption,
                    target: target
                });
            });
            if (savePhotos(photos)) {
                photoForm.reset();
                renderPhotoList();
                photoMsg.textContent = valid.length + ' photo(s) published.';
                photoMsg.className = 'form-msg success';
                photoMsg.hidden = false;
                setTimeout(function () { photoMsg.hidden = true; }, 3500);
            }
        });
    });

    function renderPhotoList() {
        var photos = getPhotos();
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
            var labels = { hero: 'Home hero banner', home: 'Home page', life: 'Life page', both: 'Home + Life' };
            meta.innerHTML = '<span class="photo-target">' + (labels[p.target] || p.target) + '</span>' +
                '<span class="photo-cap">' + (p.caption ? escapeHtml(p.caption) : '<em>No caption</em>') + '</span>';
            card.appendChild(meta);

            var del = document.createElement('button');
            del.type = 'button';
            del.className = 'btn-del';
            del.textContent = 'Remove';
            del.addEventListener('click', function () {
                var remaining = getPhotos().filter(function (x) { return x.id !== p.id; });
                savePhotos(remaining);
                renderPhotoList();
            });
            card.appendChild(del);

            photoList.appendChild(card);
        });
    }

    function escapeHtml(s) {
        return s.replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /* ===== Init ===== */
    if (isLoggedIn()) { showDashboard(); } else { showLogin(); }

}());
