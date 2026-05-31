/* The Glens Residential Home — main.js */

(function () {
    'use strict';

    /* === Site theme (chosen by staff in the portal) === */
    (function applyTheme() {
        var theme = localStorage.getItem('glens-theme');
        if (theme === 'navy') {
            document.documentElement.setAttribute('data-theme', 'navy');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }());

    /* === Mobile Navigation === */
    const hamburger = document.getElementById('hamburger');
    const mainNav   = document.getElementById('mainNav');
    const overlay   = document.getElementById('navOverlay');

    function openNav() {
        mainNav.classList.add('open');
        overlay.classList.add('active');
        hamburger.classList.add('open');
        hamburger.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
    }

    function closeNav() {
        mainNav.classList.remove('open');
        overlay.classList.remove('active');
        hamburger.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
    }

    if (hamburger) {
        hamburger.addEventListener('click', function () {
            mainNav.classList.contains('open') ? closeNav() : openNav();
        });
    }
    if (overlay) overlay.addEventListener('click', closeNav);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeNav();
    });

    /* === Sticky header shadow === */
    var header = document.querySelector('.site-header');
    if (header) {
        window.addEventListener('scroll', function () {
            header.classList.toggle('scrolled', window.scrollY > 50);
        }, { passive: true });
    }

    /* === Scroll-in animations === */
    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.fade-in').forEach(function (el) {
        observer.observe(el);
    });

    /* === Accordion === */
    document.querySelectorAll('.acc-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var isOpen = btn.classList.contains('open');

            document.querySelectorAll('.acc-btn').forEach(function (b) {
                b.classList.remove('open');
                b.setAttribute('aria-expanded', 'false');
            });
            document.querySelectorAll('.acc-body').forEach(function (b) {
                b.classList.remove('open');
            });

            if (!isOpen) {
                btn.classList.add('open');
                btn.setAttribute('aria-expanded', 'true');
                btn.nextElementSibling.classList.add('open');
            }
        });
    });

    /* === Smooth anchor scroll offset for sticky header === */
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
        link.addEventListener('click', function (e) {
            var target = document.querySelector(link.getAttribute('href'));
            if (!target) return;
            e.preventDefault();
            var offset = 90;
            var top = target.getBoundingClientRect().top + window.pageYOffset - offset;
            window.scrollTo({ top: top, behavior: 'smooth' });
        });
    });

    /* === Site content driven by the staff dashboard ===
       Data is loaded from the shared backend API (/api/state) so every visitor
       sees the same photos and contact details. If the API is unavailable
       (e.g. running the plain static files with no server), we fall back to
       this browser's localStorage so the demo still works locally. */

    // Replace the first non-empty text node of a link, preserving child SVG icons.
    function setLinkLabel(link, text) {
        for (var i = 0; i < link.childNodes.length; i++) {
            var node = link.childNodes[i];
            if (node.nodeType === 3 && node.nodeValue.trim() !== '') {
                node.nodeValue = text;
                return;
            }
        }
        link.appendChild(document.createTextNode(text));
    }

    function telHref(phone) {
        var digits = String(phone).replace(/\D/g, '').replace(/^0/, '');
        return 'tel:+44' + digits;
    }

    function localState() {
        var contact = null, photos = [];
        var rawC = localStorage.getItem('glens-contact');
        if (rawC) { try { contact = JSON.parse(rawC); } catch (e) {} }
        var rawP = localStorage.getItem('glens-photos');
        if (rawP) { try { photos = JSON.parse(rawP); } catch (e) { photos = []; } }
        var theme = localStorage.getItem('glens-theme') === 'navy' ? 'navy' : 'default';
        return { contact: contact, photos: photos, theme: theme };
    }

    function loadState() {
        return fetch('/api/state', { headers: { 'Accept': 'application/json' } })
            .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
            .then(function (s) {
                // Cache theme for a fast, flash-free paint next visit.
                try { localStorage.setItem('glens-theme', s.theme === 'navy' ? 'navy' : 'default'); } catch (e) {}
                return s;
            })
            .catch(function () { return localState(); });
    }

    function renderContact(c) {
        if (!c) return;

        if (c.phone) {
            document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
                a.setAttribute('href', telHref(c.phone));
                setLinkLabel(a, c.phone);
                if (a.hasAttribute('aria-label')) a.setAttribute('aria-label', 'Call us on ' + c.phone);
            });
        }
        if (c.email) {
            document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
                a.setAttribute('href', 'mailto:' + c.email);
                setLinkLabel(a, c.email);
            });
        }
        if (c.address) {
            document.querySelectorAll('[data-gd="address"]').forEach(function (el) {
                setLinkLabel(el, c.address);
            });
            document.querySelectorAll('[data-gd="address-text"]').forEach(function (el) {
                el.textContent = c.address;
            });
            document.querySelectorAll('[data-gd="copyright"]').forEach(function (el) {
                var year = new Date().getFullYear();
                el.textContent = '© ' + year + ' The Glens Residential Home. ' + c.address + '. Registered with RQIA.';
            });
        }
    }

    function renderGallery(photos) {
        photos = photos || [];

        ['home', 'life'].forEach(function (target) {
            var grid = document.getElementById(target + 'Gallery');
            if (!grid) return;
            var section = grid.closest('[data-gallery-section]') || grid;
            var items = photos.filter(function (p) { return p.target === target || p.target === 'both'; });

            if (!items.length) {
                if (section !== grid) section.style.display = 'none';
                grid.innerHTML = '';
                return;
            }
            if (section !== grid) section.style.display = '';
            grid.innerHTML = '';
            items.forEach(function (p) {
                var fig = document.createElement('figure');
                fig.className = 'gallery-item fade-in visible';
                var img = document.createElement('img');
                img.src = p.src;
                img.alt = p.caption || 'A moment of life at The Glens Residential Home';
                img.loading = 'lazy';
                fig.appendChild(img);
                if (p.caption) {
                    var cap = document.createElement('figcaption');
                    cap.textContent = p.caption;
                    fig.appendChild(cap);
                }
                grid.appendChild(fig);
            });
        });
    }

    function renderHero(photos) {
        var heroEl = document.querySelector('.hero-photo');
        if (!heroEl) return;
        photos = photos || [];
        var heroes = photos.filter(function (p) { return p.target === 'hero'; });
        if (!heroes.length) return;

        var p = heroes[heroes.length - 1];
        heroEl.style.backgroundImage = 'url("' + p.src + '")';
        heroEl.style.backgroundSize = 'cover';
        heroEl.style.backgroundPosition = 'center';
        var icon = heroEl.querySelector('svg');
        if (icon) icon.style.display = 'none';
        if (p.caption) heroEl.setAttribute('aria-label', p.caption);
    }

    function applyTheme(theme) {
        if (theme === 'navy') {
            document.documentElement.setAttribute('data-theme', 'navy');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }

    loadState().then(function (s) {
        applyTheme(s.theme);
        renderContact(s.contact);
        renderGallery(s.photos);
        renderHero(s.photos);
    });

}());
