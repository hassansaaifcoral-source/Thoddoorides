/**
 * admin.js — the Thoddoo Ride operations portal.
 *   • sign-in gate backed by /api/auth
 *   • live fleet: status board + GPS markers on the island map
 *   • booking-requests inbox with confirm / decline / document viewing
 *   • sales & refunds dashboard with a 7-day chart and one-tap refunds
 * All data comes from the authenticated /api/admin endpoints.
 */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const SVGNS = 'http://www.w3.org/2000/svg';

  const COLORS = {
    available: '#1f9d57',
    active: '#e0892a',
    booked: '#7c5cd6',
    maintenance: '#9aa0a6',
  };
  const STATUS_LABEL = {
    available: 'Available',
    active: 'In use',
    booked: 'Booked',
    maintenance: 'Service',
  };
  const BOOKING_LABEL = {
    new: 'New',
    confirmed: 'Confirmed',
    declined: 'Declined',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  let salesPeriod = 'week';
  let pollTimer = null;

  /* -------------------------------- api ----------------------------------- */

  async function apiJson(method, path, body) {
    const opts = { method, headers: { Accept: 'application/json' } };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(path, opts);
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  }
  const apiGet = (p) => apiJson('GET', p);

  /* ------------------------------- helpers -------------------------------- */

  function fmt(n) {
    return Number(n || 0).toLocaleString('en-US');
  }
  function mvr(n) {
    return 'MVR ' + fmt(n);
  }
  function batteryColor(pct) {
    if (pct <= 20) return '#d23f3f';
    if (pct <= 50) return '#e0892a';
    return '#1f9d57';
  }
  function timeAgo(iso) {
    const d = new Date((iso || '').replace(' ', 'T') + (iso && iso.endsWith('Z') ? '' : 'Z'));
    const secs = Math.max(0, (Date.now() - d.getTime()) / 1000);
    if (secs < 60) return 'just now';
    if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
    if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
    return Math.floor(secs / 86400) + 'd ago';
  }
  function setSync() {
    $$('[data-sync]').forEach((el) => (el.textContent = 'synced · just now'));
  }

  /* --------------------------------- auth --------------------------------- */

  function showLock(show) {
    const lock = $('#lock');
    if (lock) lock.classList.toggle('hidden', !show);
  }

  async function checkAuth() {
    const { ok } = await apiGet('/api/auth/me');
    if (ok) {
      showLock(false);
      startDashboard();
    } else {
      showLock(true);
    }
  }

  function wireAuth() {
    const form = $('#lockForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = ($('#lockUser') || {}).value || '';
        const password = ($('#lockInput') || {}).value || '';
        const err = $('#lockError');
        if (err) err.classList.remove('show');
        const btn = $('#lockBtn');
        if (btn) btn.disabled = true;
        const { ok } = await apiJson('POST', '/api/auth/login', { username, password });
        if (btn) btn.disabled = false;
        if (ok) {
          const pw = $('#lockInput');
          if (pw) pw.value = '';
          showLock(false);
          startDashboard();
        } else if (err) {
          err.classList.add('show');
        }
      });
    }

    const out = $('#signOut');
    if (out) {
      out.addEventListener('click', async () => {
        await apiJson('POST', '/api/auth/logout');
        if (pollTimer) clearInterval(pollTimer);
        showLock(true);
      });
    }
  }

  /* --------------------------------- tabs --------------------------------- */

  function wireTabs() {
    $$('.adm-tab').forEach((tab) =>
      tab.addEventListener('click', () => {
        const name = tab.getAttribute('data-tab');
        $$('.adm-tab').forEach((t) => t.classList.toggle('is-on', t === tab));
        $$('.adm-view').forEach((v) =>
          (v.hidden = v.getAttribute('data-view') !== name)
        );
        if (name === 'sales') loadSales();
      })
    );

    $$('.period-btn').forEach((btn) =>
      btn.addEventListener('click', () => {
        $$('.period-btn').forEach((b) => b.classList.toggle('is-on', b === btn));
        salesPeriod = /month/i.test(btn.textContent) ? 'month' : 'week';
        loadSales();
      })
    );
  }

  /* --------------------------------- stats -------------------------------- */

  async function loadStats() {
    const { ok, data } = await apiGet('/api/admin/stats');
    if (!ok) return;
    ['available', 'active', 'booked', 'requests'].forEach((k) => {
      const el = $('[data-stat="' + k + '"]');
      if (el) el.textContent = data[k] != null ? data[k] : 0;
    });
  }

  /* --------------------------------- fleet -------------------------------- */

  async function loadFleet() {
    const { ok, data } = await apiGet('/api/admin/fleet');
    if (!ok) return;
    const bikes = data.bikes || [];
    renderBoard(bikes);
    renderMap(bikes);
    setSync();
  }

  function renderBoard(bikes) {
    const board = $('[data-board]');
    if (!board) return;
    board.innerHTML = '';
    bikes.forEach((b) => {
      const row = document.createElement('div');
      row.className = 'fleet-row';
      row.innerHTML =
        '<div class="fr-main">' +
        '<span class="fr-dot"></span>' +
        '<div class="fr-id"><b></b><small></small></div>' +
        '</div>' +
        '<div class="fr-batt"><div class="fr-bar"><i></i></div><span class="fr-pct"></span></div>' +
        '<select class="fr-status"></select>';
      row.querySelector('.fr-dot').style.background = COLORS[b.status] || '#999';
      row.querySelector('.fr-id b').textContent = b.name;
      row.querySelector('.fr-id small').textContent =
        b.code + (b.place ? ' · ' + b.place : '');
      const bar = row.querySelector('.fr-bar i');
      bar.style.width = (b.battery || 0) + '%';
      bar.style.background = batteryColor(b.battery || 0);
      row.querySelector('.fr-pct').textContent = (b.battery || 0) + '%';

      const sel = row.querySelector('.fr-status');
      Object.keys(STATUS_LABEL).forEach((s) => {
        const o = document.createElement('option');
        o.value = s;
        o.textContent = STATUS_LABEL[s];
        if (s === b.status) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', async () => {
        await apiJson('PATCH', '/api/admin/bikes/' + b.id, { status: sel.value });
        refreshOverview();
      });
      board.appendChild(row);
    });
  }

  function renderMap(bikes) {
    const g = $('#bikes');
    if (!g) return;
    while (g.firstChild) g.removeChild(g.firstChild);
    bikes.forEach((b) => {
      if (b.pos_x == null || b.pos_y == null) return;
      const color = COLORS[b.status] || '#999';
      const marker = document.createElementNS(SVGNS, 'g');
      marker.setAttribute('transform', 'translate(' + b.pos_x + ',' + b.pos_y + ')');
      marker.setAttribute('class', 'bike-marker' + (b.status === 'active' ? ' is-active' : ''));

      const title = document.createElementNS(SVGNS, 'title');
      title.textContent =
        b.name + ' · ' + (STATUS_LABEL[b.status] || b.status) + ' · ' + (b.battery || 0) + '%';
      marker.appendChild(title);

      if (b.status === 'active') {
        const pulse = document.createElementNS(SVGNS, 'circle');
        pulse.setAttribute('r', '15');
        pulse.setAttribute('fill', color);
        pulse.setAttribute('opacity', '0.25');
        pulse.setAttribute('class', 'marker-pulse');
        marker.appendChild(pulse);
      }
      const halo = document.createElementNS(SVGNS, 'circle');
      halo.setAttribute('r', '13');
      halo.setAttribute('fill', '#ffffff');
      halo.setAttribute('opacity', '0.95');
      marker.appendChild(halo);

      const dot = document.createElementNS(SVGNS, 'circle');
      dot.setAttribute('r', '9.5');
      dot.setAttribute('fill', color);
      marker.appendChild(dot);

      const label = document.createElementNS(SVGNS, 'text');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('y', '3.4');
      label.setAttribute('font-size', '9');
      label.setAttribute('font-family', 'IBM Plex Mono, monospace');
      label.setAttribute('fill', '#ffffff');
      label.textContent = (b.code.match(/\d+/) || [b.code])[0];
      marker.appendChild(label);

      g.appendChild(marker);
    });
  }

  /* ------------------------------- bookings ------------------------------- */

  async function loadBookings() {
    const { ok, data } = await apiGet('/api/admin/bookings');
    if (!ok) return;
    renderRequests(data.bookings || []);
  }

  function renderRequests(bookings) {
    const wrap = $('[data-requests]');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!bookings.length) {
      wrap.innerHTML = '<div class="req-empty">No booking requests yet. Submissions from the site form appear here.</div>';
      return;
    }
    bookings.forEach((b) => {
      const card = document.createElement('div');
      card.className = 'req-card is-' + b.status;
      const docs = [];
      if (b.has_passport)
        docs.push('<a class="req-doc" target="_blank" href="/api/admin/bookings/' + b.id + '/document/passport">Passport</a>');
      if (b.has_licence)
        docs.push('<a class="req-doc" target="_blank" href="/api/admin/bookings/' + b.id + '/document/licence">Licence</a>');

      const actions = [];
      if (b.status === 'new') {
        actions.push('<button class="req-btn ok" data-act="confirmed">Confirm</button>');
        actions.push('<button class="req-btn no" data-act="declined">Decline</button>');
      } else if (b.status === 'confirmed') {
        actions.push('<button class="req-btn ok" data-act="completed">Mark completed</button>');
        actions.push('<button class="req-btn no" data-act="cancelled">Cancel</button>');
      }

      card.innerHTML =
        '<div class="req-top">' +
        '<div><span class="req-ref"></span><span class="req-badge"></span></div>' +
        '<span class="req-when"></span>' +
        '</div>' +
        '<div class="req-name"></div>' +
        '<div class="req-grid">' +
        '<span>Pick-up</span><b class="req-pick"></b>' +
        '<span>Duration</span><b class="req-dur"></b>' +
        '<span>Bike</span><b class="req-bike"></b>' +
        '<span>Payment</span><b class="req-pay"></b>' +
        '<span>Estimate</span><b class="req-total"></b>' +
        '<span>Contact</span><b class="req-contact"></b>' +
        '</div>' +
        '<div class="req-docs">' + docs.join('') + '</div>' +
        '<div class="req-actions"></div>';

      card.querySelector('.req-ref').textContent = b.ref;
      const badge = card.querySelector('.req-badge');
      badge.textContent = BOOKING_LABEL[b.status] || b.status;
      badge.classList.add('badge-' + b.status);
      card.querySelector('.req-when').textContent = timeAgo(b.created_at);
      card.querySelector('.req-name').textContent = b.customer_name;
      card.querySelector('.req-pick').textContent =
        b.pickup_date + (b.pickup_time ? ' · ' + b.pickup_time : '');
      card.querySelector('.req-dur').textContent =
        b.days + ' day' + (b.days > 1 ? 's' : '') + ' · ' + b.quantity + ' bike' + (b.quantity > 1 ? 's' : '');
      card.querySelector('.req-bike').textContent = b.bike ? b.bike.name : 'Any available';
      card.querySelector('.req-pay').textContent = b.pay_method || '—';
      card.querySelector('.req-total').textContent =
        b.total_mvr != null ? mvr(b.total_mvr) : '—';
      const contact = card.querySelector('.req-contact');
      contact.textContent = b.contact;

      const actWrap = card.querySelector('.req-actions');
      actWrap.innerHTML = actions.join('');
      $$('.req-btn', actWrap).forEach((btn) =>
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          await apiJson('PATCH', '/api/admin/bookings/' + b.id, {
            status: btn.getAttribute('data-act'),
          });
          refreshOverview();
        })
      );

      wrap.appendChild(card);
    });
  }

  /* ----------------------------- sales & refunds -------------------------- */

  async function loadSales() {
    const [summary, txns] = await Promise.all([
      apiGet('/api/admin/sales?period=' + salesPeriod),
      apiGet('/api/admin/transactions'),
    ]);
    if (summary.ok) renderSales(summary.data);
    if (txns.ok) renderTxns(txns.data.transactions || []);
  }

  function renderSales(s) {
    const set = (k, v) => {
      const el = $('[data-sales="' + k + '"]');
      if (el) el.textContent = v;
    };
    set('net', fmt(s.net));
    set('rentals', s.rentals);
    set('refunds', s.refunds);
    set('refundAmt', mvr(s.refundAmt));
    set('weektotal', mvr(s.net) + ' net');

    const chart = $('[data-chart]');
    if (chart) {
      chart.innerHTML = '';
      const max = Math.max(1, ...s.chart.map((d) => d.amount));
      s.chart.forEach((d) => {
        const col = document.createElement('div');
        col.className = 'chart-col';
        const h = Math.round((d.amount / max) * 100);
        col.innerHTML =
          '<div class="chart-bar" style="height:' + Math.max(2, h) + '%" title="' +
          mvr(d.amount) + '"></div><span class="chart-lbl">' + d.label + '</span>';
        chart.appendChild(col);
      });
    }
  }

  function renderTxns(txns) {
    const wrap = $('[data-txns]');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!txns.length) {
      wrap.innerHTML = '<div class="req-empty">No transactions yet. Confirming a booking records a payment here.</div>';
      return;
    }
    txns.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'txn-row';
      const refunded = t.status === 'refunded';
      row.innerHTML =
        '<span class="txn-c" data-c="cust"></span>' +
        '<span class="txn-c" data-c="bike"></span>' +
        '<span class="txn-c" data-c="date"></span>' +
        '<span class="txn-c" data-c="method"></span>' +
        '<span class="txn-c txn-amt"></span>' +
        '<span class="txn-c txn-status"></span>';
      row.querySelector('[data-c="cust"]').textContent = t.customer_name || '—';
      row.querySelector('[data-c="bike"]').textContent = t.bike_name || '—';
      row.querySelector('[data-c="date"]').textContent = (t.created_at || '').slice(0, 10);
      row.querySelector('[data-c="method"]').textContent = t.method || '—';
      const amt = row.querySelector('.txn-amt');
      amt.textContent = mvr(t.amount_mvr);
      if (refunded) amt.classList.add('is-refunded');

      const st = row.querySelector('.txn-status');
      if (refunded) {
        st.innerHTML = '<span class="txn-tag refunded">Refunded</span>';
      } else {
        const btn = document.createElement('button');
        btn.className = 'txn-refund';
        btn.textContent = 'Refund';
        btn.addEventListener('click', async () => {
          if (!confirm('Refund ' + mvr(t.amount_mvr) + ' to ' + (t.customer_name || 'customer') + '?')) return;
          btn.disabled = true;
          await apiJson('POST', '/api/admin/transactions/' + t.id + '/refund');
          loadSales();
        });
        st.appendChild(btn);
      }
      wrap.appendChild(row);
    });
  }

  /* --------------------------------- boot --------------------------------- */

  function refreshOverview() {
    loadStats();
    loadFleet();
    loadBookings();
  }

  function startDashboard() {
    refreshOverview();
    setSync();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      const salesActive = $('.adm-view[data-view="sales"]') && !$('.adm-view[data-view="sales"]').hidden;
      refreshOverview();
      if (salesActive) loadSales();
    }, 30000);
  }

  function init() {
    wireAuth();
    wireTabs();
    checkAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
