/**
 * site.js — wires the public Thoddoo Ride page to the backend API:
 *   • live availability (hero snapshot, availability grid, booking dropdown)
 *   • currency toggle + live booking estimate
 *   • booking form submission (with passport / licence upload) and the
 *     "Send on WhatsApp" shortcut
 *   • assorted UI behaviour (nav, language menu, FAQ, modals, scroll reveal)
 */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const api = {
    async get(path) {
      const r = await fetch(path, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('GET ' + path + ' -> ' + r.status);
      return r.json();
    },
    async postForm(path, formData) {
      const r = await fetch(path, { method: 'POST', body: formData });
      const data = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, data };
    },
  };

  const state = {
    config: null,
    bikes: [],
    available: 0,
    total: 0,
    currency: loadCurrency(),
  };

  const STATUS_LABEL = {
    available: 'Available now',
    active: 'Out riding',
    booked: 'Booked',
    maintenance: 'In service',
  };

  /* ------------------------------- currency ------------------------------- */

  function loadCurrency() {
    try {
      return localStorage.getItem('tr_cur') || 'MVR';
    } catch (e) {
      return 'MVR';
    }
  }
  function saveCurrency(c) {
    try {
      localStorage.setItem('tr_cur', c);
    } catch (e) { /* ignore */ }
  }
  function rate() {
    return (state.config && state.config.rates && state.config.rates.dailyMvr) || 300;
  }
  function mvrPerUsd() {
    return (state.config && state.config.currency && state.config.currency.mvrPerUsd) || 15.42;
  }
  function toUsd(mvr) {
    return Math.round(mvr / mvrPerUsd());
  }
  function money(mvr, cur) {
    const c = cur || state.currency;
    return c === 'USD' ? 'USD ' + toUsd(mvr) : 'MVR ' + mvr;
  }

  /* ------------------------------ rendering ------------------------------- */

  function renderCounts() {
    const text = state.available + ' of ' + state.total + ' free';
    $$('[data-avail-count]').forEach((el) => (el.textContent = text));
    $$('[data-updated]').forEach((el) => (el.textContent = 'updated just now'));
  }

  function renderAvailGrid() {
    const grid = $('[data-avail]');
    if (!grid) return;
    grid.innerHTML = '';
    state.bikes.forEach((b) => {
      const card = document.createElement('div');
      card.className = 'avail-card is-' + b.status;
      const free = b.status === 'available';
      card.innerHTML =
        '<div class="ac-row">' +
        '<span class="ac-name"></span>' +
        '<span class="ac-badge"><span class="ac-dot"></span><span class="ac-st"></span></span>' +
        '</div>' +
        '<div class="ac-sub"><span class="ac-code"></span><span class="ac-batt"></span></div>' +
        '<div class="ac-bar"><i style="width:' + (b.battery || 0) + '%"></i></div>' +
        '<a class="ac-cta" href="#book">' + (free ? 'Reserve this bike' : 'Notify / hold') + '</a>';
      card.querySelector('.ac-name').textContent = b.name;
      card.querySelector('.ac-st').textContent = STATUS_LABEL[b.status] || b.status;
      card.querySelector('.ac-code').textContent = b.code;
      card.querySelector('.ac-batt').textContent = (b.battery || 0) + '% · ' + (b.range_km || 60) + ' km';
      grid.appendChild(card);
    });
  }

  function renderSnap() {
    const list = $('[data-snap-list]');
    if (list) {
      list.innerHTML = '';
      state.bikes.forEach((b) => {
        const row = document.createElement('div');
        row.className = 'snap-row is-' + b.status;
        row.innerHTML =
          '<span class="snap-dot"></span><span class="snap-name"></span>' +
          '<span class="snap-st"></span>';
        row.querySelector('.snap-name').textContent = b.name;
        row.querySelector('.snap-st').textContent = STATUS_LABEL[b.status] || b.status;
        list.appendChild(row);
      });
    }

    const chips = $('[data-chip-list]');
    if (chips) {
      const items = [
        state.available + ' of ' + state.total + ' bikes free',
        'MVR ' + rate() + ' / day',
        '60 km range',
        'No licence needed',
      ];
      chips.innerHTML = '';
      items.forEach((t) => {
        const c = document.createElement('span');
        c.className = 'chip';
        c.textContent = t;
        chips.appendChild(c);
      });
    }
  }

  function fillBikeSelect() {
    const sel = $('#f-bike');
    if (!sel) return;
    const first = sel.querySelector('option');
    const firstLabel = first ? first.textContent : 'Any available bike';
    sel.innerHTML = '';
    const any = document.createElement('option');
    any.value = 'any';
    any.textContent = firstLabel;
    sel.appendChild(any);
    state.bikes.forEach((b) => {
      const o = document.createElement('option');
      o.value = b.code;
      o.textContent = b.name + ' (' + b.code + ')' + (b.status === 'available' ? '' : ' — ' + (STATUS_LABEL[b.status] || b.status));
      if (b.status !== 'available') o.disabled = true;
      sel.appendChild(o);
    });
  }

  function renderRatesCard() {
    const mvr = rate();
    const sym = $('[data-cur-sym]');
    const amt = $('[data-cur-amt]');
    const alt = $('[data-cur-alt]');
    if (sym && amt) {
      if (state.currency === 'USD') {
        sym.textContent = 'USD';
        amt.textContent = toUsd(mvr);
        if (alt) alt.textContent = '≈ MVR ' + mvr + ' / day';
      } else {
        sym.textContent = 'MVR';
        amt.textContent = mvr;
        if (alt) alt.textContent = '≈ USD ' + toUsd(mvr) + ' / day';
      }
    }
    $$('#curToggle button').forEach((btn) =>
      btn.classList.toggle('on', btn.getAttribute('data-cur') === state.currency)
    );
  }

  function renderEstimate() {
    const days = Number(($('#f-days') || {}).value) || 1;
    const qty = Number(($('#f-bikes') || {}).value) || 1;
    const totalMvr = rate() * days * qty;
    const main = $('[data-total-main]');
    const altt = $('[data-total-alt]');
    if (main) main.textContent = money(totalMvr);
    if (altt) altt.textContent = state.currency === 'USD' ? '≈ MVR ' + totalMvr : '≈ USD ' + toUsd(totalMvr);
    return totalMvr;
  }

  /* ----------------------------- data loading ----------------------------- */

  async function loadConfig() {
    try {
      state.config = await api.get('/api/config');
      applyContactLinks();
    } catch (e) {
      console.warn('config load failed', e);
    }
    renderRatesCard();
    renderEstimate();
  }

  async function loadAvailability() {
    try {
      const data = await api.get('/api/availability');
      state.bikes = data.bikes || [];
      state.available = data.available || 0;
      state.total = data.total || state.bikes.length;
      renderCounts();
      renderAvailGrid();
      renderSnap();
      fillBikeSelect();
    } catch (e) {
      console.warn('availability load failed', e);
    }
  }

  // Point WhatsApp / phone links at the configured number.
  function applyContactLinks() {
    const c = state.config && state.config.contact;
    if (!c) return;
    if (c.whatsapp) {
      $$('a[href*="wa.me/"]').forEach((a) => {
        a.href = a.href.replace(/wa\.me\/\d+/, 'wa.me/' + c.whatsapp);
      });
    }
    if (c.phone) {
      const tel = 'tel:' + c.phone.replace(/\s+/g, '');
      $$('a[href^="tel:"]').forEach((a) => (a.href = tel));
    }
  }

  /* ------------------------------ booking form ---------------------------- */

  function bikeLabel() {
    const sel = $('#f-bike');
    if (!sel) return 'Any available bike';
    const opt = sel.options[sel.selectedIndex];
    return opt ? opt.textContent : 'Any available bike';
  }

  function buildWhatsAppText() {
    const total = renderEstimate();
    const lines = [
      "Hi Thoddoo Ride! I'd like to book an e-bike.",
      '',
      'Bike: ' + bikeLabel(),
      'Pick-up: ' + (($('#f-from') || {}).value || '—') + ' at ' + (($('#f-time') || {}).value || '—'),
      'Days: ' + (($('#f-days') || {}).value || '1') + ' · Bikes: ' + (($('#f-bikes') || {}).value || '1'),
      'Payment: ' + (selectedPay() || 'Cash'),
      'Name: ' + (($('#f-name') || {}).value || '—'),
      'Contact: ' + (($('#f-contact') || {}).value || '—'),
      'Estimated total: MVR ' + total,
    ];
    return encodeURIComponent(lines.join('\n'));
  }

  function selectedPay() {
    const r = $('input[name="pay"]:checked');
    return r ? r.value : 'Cash';
  }

  function waNumber() {
    return (state.config && state.config.contact && state.config.contact.whatsapp) || '9607770000';
  }

  function wireFileInput(inputId) {
    const input = $('#' + inputId);
    if (!input) return;
    input.addEventListener('change', () => {
      const label = input.closest('.upload');
      const us = label && label.querySelector('.us');
      if (!us) return;
      if (input.files && input.files[0]) {
        us.textContent = input.files[0].name;
        us.classList.add('has-file');
      } else {
        us.textContent = us.getAttribute('data-empty') || '';
        us.classList.remove('has-file');
      }
      if (inputId === 'f-passport') hideUploadError();
    });
  }

  function showUploadError() {
    const err = $('[data-upload-err]');
    if (err) {
      err.classList.add('show');
      err.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  function hideUploadError() {
    const err = $('[data-upload-err]');
    if (err) err.classList.remove('show');
  }

  async function submitBooking(e) {
    e.preventDefault();
    const form = $('#book-form');
    if (!form) return;

    const passport = $('#f-passport');
    if (!passport || !passport.files || !passport.files[0]) {
      showUploadError();
      return;
    }
    const agree = $('#f-agree');
    if (agree && !agree.checked) {
      const row = $('#agreeRow');
      if (row) {
        row.classList.add('shake');
        setTimeout(() => row.classList.remove('shake'), 600);
      }
      agree.focus();
      return;
    }

    const fd = new FormData();
    fd.append('bike', ($('#f-bike') || {}).value || 'any');
    fd.append('from', ($('#f-from') || {}).value || '');
    fd.append('time', ($('#f-time') || {}).value || '');
    fd.append('days', ($('#f-days') || {}).value || '1');
    fd.append('bikes', ($('#f-bikes') || {}).value || '1');
    fd.append('name', ($('#f-name') || {}).value || '');
    fd.append('contact', ($('#f-contact') || {}).value || '');
    fd.append('pay', selectedPay());
    fd.append('lang', (window.i18n && window.i18n.lang) || 'en');
    if (passport.files[0]) fd.append('passport', passport.files[0]);
    const licence = $('#f-licence');
    if (licence && licence.files && licence.files[0]) fd.append('licence', licence.files[0]);

    const btn = form.querySelector('button[type="submit"]');
    const prev = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending…';
    }

    const { ok, data } = await api.postForm('/api/bookings', fd);

    if (btn) {
      btn.disabled = false;
      btn.textContent = prev;
    }

    if (ok && data.ok) {
      const okBox = $('#formOk');
      if (okBox) {
        const span = okBox.querySelector('span') || okBox;
        span.textContent =
          'Thanks! Request ' + data.ref + ' received — we\'ll confirm by WhatsApp shortly.';
        okBox.classList.add('show');
        okBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      form.reset();
      $$('.us').forEach((u) => {
        u.textContent = u.getAttribute('data-empty') || '';
        u.classList.remove('has-file');
      });
      renderEstimate();
      loadAvailability();
    } else if (data && data.fields) {
      if (data.fields.passport) showUploadError();
      alert('Please check the form — some required details are missing.');
    } else {
      alert('Sorry, something went wrong sending your request. Please try WhatsApp.');
    }
  }

  /* ------------------------------ UI behaviour ---------------------------- */

  function wireUI() {
    // Mobile nav.
    const navToggle = $('#navToggle');
    const navLinks = $('#navLinks');
    if (navToggle && navLinks) {
      navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
      $$('#navLinks a').forEach((a) =>
        a.addEventListener('click', () => navLinks.classList.remove('open'))
      );
    }

    // Sticky nav shadow on scroll.
    const nav = $('#nav');
    if (nav) {
      const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 12);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // Language menu.
    const langBtn = $('#langBtn');
    const langMenu = $('#langMenu');
    if (langBtn && langMenu) {
      langBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        langMenu.classList.toggle('open');
      });
      $$('[data-lang]').forEach((b) =>
        b.addEventListener('click', () => {
          if (window.i18n) window.i18n.setLang(b.getAttribute('data-lang'));
          langMenu.classList.remove('open');
        })
      );
      document.addEventListener('click', () => langMenu.classList.remove('open'));
    }

    // Currency toggle.
    $$('#curToggle button').forEach((btn) =>
      btn.addEventListener('click', () => {
        state.currency = btn.getAttribute('data-cur') === 'USD' ? 'USD' : 'MVR';
        saveCurrency(state.currency);
        renderRatesCard();
        renderEstimate();
      })
    );

    // FAQ accordion.
    $$('.faq-q').forEach((q) =>
      q.addEventListener('click', () => {
        const item = q.closest('.faq-item');
        if (item) item.classList.toggle('open');
      })
    );

    // Modals (privacy / terms).
    wireModal('privacy');
    wireModal('terms');

    // Booking form.
    const form = $('#book-form');
    if (form) {
      form.addEventListener('submit', submitBooking);
      ['#f-days', '#f-bikes'].forEach((id) => {
        const el = $(id);
        if (el) el.addEventListener('change', renderEstimate);
      });
      wireFileInput('f-passport');
      wireFileInput('f-licence');

      const wa = $('#waSend');
      if (wa) {
        wa.addEventListener('click', () => {
          window.open('https://wa.me/' + waNumber() + '?text=' + buildWhatsAppText(), '_blank');
        });
      }

      // Pick-up date: no earlier than today.
      const from = $('#f-from');
      if (from) {
        const today = new Date().toISOString().slice(0, 10);
        from.min = today;
        if (!from.value) from.value = today;
      }
    }

    // Scroll reveal.
    const reveals = $$('.reveal');
    if ('IntersectionObserver' in window && reveals.length) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) {
              en.target.classList.add('in');
              io.unobserve(en.target);
            }
          });
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
      );
      reveals.forEach((el) => io.observe(el));
    } else {
      reveals.forEach((el) => el.classList.add('in'));
    }
  }

  function wireModal(name) {
    const modal = $('#' + name + 'Modal');
    if (!modal) return;
    const open = () => modal.classList.add('open');
    const close = () => modal.classList.remove('open');
    $$('[data-open-' + name + ']').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        open();
      })
    );
    $$('[data-close-' + name + ']').forEach((b) => b.addEventListener('click', close));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  /* --------------------------------- init --------------------------------- */

  function init() {
    wireUI();
    renderEstimate();
    loadConfig();
    loadAvailability();
    // Refresh availability periodically so the page stays live.
    setInterval(loadAvailability, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
