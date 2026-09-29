/* Steel Riders Kft. – site interactions */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var io = 'IntersectionObserver' in window;

  /* ---------- Header state + scroll progress ---------- */
  var header = $('#header');
  var bar = $('#scrollProgress'), fab = $('.fab');
  function onScroll() {
    var y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 24);
    var h = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.transform = 'scaleX(' + (h > 0 ? y / h : 0) + ')';
    if (fab) fab.classList.toggle('is-shown', y > 500);
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Menu (overlay on small screens) ---------- */
  var btn = $('#menuBtn'), nav = $('#nav');
  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('menu-open', open);
  }
  if (btn) {
    btn.addEventListener('click', function () { setMenu(!nav.classList.contains('is-open')); });
    addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); btn.focus(); } });
    $$('a', nav).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  }

  /* ---------- Photo slots: real photo, else live 3D studio render ---------- */
  var renderQueue = [];
  function renderInto(img) {
    if (!window.SR3D || img.dataset.rendered) return;
    var spec = (img.dataset.render || 'turned:brass').split(':');
    var box = img.parentElement.getBoundingClientRect();
    var w = Math.max(320, Math.min(1400, Math.round(box.width * Math.min(devicePixelRatio || 1, 2))));
    var h = Math.max(240, Math.round(w * (box.height / Math.max(1, box.width) || 0.75)));
    try {
      img.src = SR3D.still(spec[0], spec[1], w, h);
      img.dataset.rendered = '1';
      img.hidden = false;
      img.closest('.photo, .page-head__visual, .console__fallback') && img.closest('.photo, .page-head__visual, .console__fallback').classList.add('is-render');
    } catch (e) { img.hidden = true; }
  }
  function missing(img) {
    if (!img.dataset.render) { img.hidden = true; return; }
    img.removeAttribute('srcset');
    img.hidden = true;
    renderQueue.push(img);
    scheduleRenders();
  }
  function scheduleRenders() {
    while (renderQueue.length) {
      var img = renderQueue.shift();
      // the hidden <img> has no box, so watch its container instead
      if (parentIO) { img.parentElement.__img = img; parentIO.observe(img.parentElement); }
      else renderInto(img);
    }
  }
  var parentIO = io ? new IntersectionObserver(function (en) {
    en.forEach(function (e) { if (e.isIntersecting && e.target.__img) { parentIO.unobserve(e.target); renderInto(e.target.__img); } });
  }, { rootMargin: '400px 0px' }) : null;

  $$('img[data-render]').forEach(function (img) {
    if (img.complete && img.naturalWidth === 0) missing(img);
    else if (!img.complete) img.addEventListener('error', function () { missing(img); }, { once: true });
  });

  /* ---------- Hero: CNC simulation + control panel ---------- */
  var sim = $('#sim');
  if (sim && window.SR3D) {
    var ops = $$('#simOps li'), fill = $('#simBar'), list = $('#ncList'), nc = $('#nc');
    SR3D.program.forEach(function (l, i) {
      var li = document.createElement('li');
      var m = l[1].match(/^(N\d+\s*)?(.*?)(\s*\(.*\))?$/);
      li.innerHTML = '<span class="nc__n">' + String(i + 1).padStart(3, '0') + '</span>' +
        (m && m[1] ? '<b>' + m[1] + '</b>' : '') +
        (m ? m[2].replace(/([A-Z])(-?[\d.]+)/g, '<i>$1</i>$2') : l[1]) +
        (m && m[3] ? '<em>' + m[3] + '</em>' : '');
      list.appendChild(li);
    });
    var rows = $$('li', list), dro = {};
    $$('#dro dd').forEach(function (d) { dro[d.dataset.k] = d; });
    var hud = {
      op: function (key) {
        var cur = ops.findIndex(function (l) { return l.dataset.op === key; });
        ops.forEach(function (li, i) { li.classList.toggle('is-done', i < cur); li.classList.toggle('is-active', i === cur); });
      },
      line: function (i) {
        rows.forEach(function (r, k) { r.classList.toggle('is-cur', k === i); r.classList.toggle('is-run', k < i); });
        var r = rows[i];
        if (r) nc.scrollTop = Math.max(0, r.offsetTop - nc.clientHeight / 2 + r.offsetHeight / 2);
      },
      dro: function (d) {
        dro.x.textContent = d.x.toFixed(3); dro.z.textContent = d.z.toFixed(3);
        dro.s.textContent = d.s; dro.f.textContent = d.f.toFixed(3);
        dro.t.textContent = d.t; dro.m.textContent = d.m;
        if (fill) fill.style.transform = 'scaleX(' + d.p + ')';
        meters(d);
        plot(d);
      }
    };

    /* 3D callouts: tool tag that follows the tool tip, inspection dimensions */
    var tagEl = $('#simTag'), dimsEl = $('#simDims'), qcEl = $('#simQc');
    var toolNames = tagEl ? JSON.parse(tagEl.dataset.tools) : [];
    var tk = {}; if (tagEl) $$('[data-k]', tagEl).forEach(function (e) { tk[e.dataset.k] = e; });
    hud.overlay = function (tag, dims) {
      if (tagEl) {
        tagEl.hidden = !tag;
        if (tag) {
          tagEl.style.transform = 'translate(' + Math.round(tag.x + 26) + 'px,' + Math.round(tag.y - 70) + 'px)';
          tk.t.textContent = tag.t; tk.tool.textContent = toolNames[+tag.t.slice(-1) - 1] || tag.tool;
          tk.vc.textContent = (tag.vc.indexOf('m/min') > 0 ? 'Vc ' : 'n ') + tag.vc; tk.f.textContent = tag.f;
        }
      }
      if (dimsEl) {
        if (!dims) { if (dimsEl.childNodes.length) dimsEl.innerHTML = ''; if (qcEl) qcEl.hidden = true; return; }
        var html = '';
        dims.forEach(function (d) {
          var mx = (d.a.x + d.b.x) / 2, my = (d.a.y + d.b.y) / 2;
          html += '<line x1="' + d.a.x + '" y1="' + d.a.y + '" x2="' + d.b.x + '" y2="' + d.b.y + '" marker-start="url(#ar)" marker-end="url(#ar)"/>' +
            '<g transform="translate(' + mx + ',' + my + ')"><rect x="-38" y="-12" width="76" height="22" rx="4"/><text y="4" text-anchor="middle">' + d.label + '</text></g>';
        });
        dimsEl.innerHTML = '<defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9z"/></marker></defs>' + html;
        if (qcEl) qcEl.hidden = false;
      }
    };

    /* meters: cycle time, part counter, modal group, spindle load */
    var mCycle = $('#mCycle'), mParts = $('#mParts'), mModal = $('#mModal'), mLoad = $('#mLoad'), load = 0;
    function meters(d) {
      var t = d.time || 0, mm = Math.floor(t / 60), ss = (t - mm * 60).toFixed(1);
      if (mCycle) mCycle.textContent = String(mm).padStart(2, '0') + ':' + ss.padStart(4, '0');
      if (mParts) mParts.textContent = String(d.cycle || 1).padStart(4, '0');
      var target = d.cut ? (d.op === 'rough' ? 72 : d.op === 'drill' ? 58 : d.op === 'cutoff' ? 64 : 38) + Math.random() * 8 : (d.s > 50 ? 6 : 0);
      load += (target - load) * 0.08;
      if (mLoad) { mLoad.style.width = load.toFixed(1) + '%'; mLoad.classList.toggle('is-high', load > 60); }
    }
    var lastModal = 'G00';
    var origLine = hud.line;
    hud.line = function (i) {
      origLine(i);
      var src = SR3D.program[i] ? SR3D.program[i][1].replace(/\(.*?\)/g, '') : '';
      var g = src.match(/G(0[0-4]|7[0-6]|96|97)\b/g);
      if (g) lastModal = g[g.length - 1];
      if (mModal) mModal.textContent = lastModal;
    };

    /* tool path plot: X/Z half-section with finished contour and live trail */
    var pc = $('#plot'), px = pc && pc.getContext('2d'), trail = [], lastCycle = 0, contourPath = null;
    function plot(d) {
      if (!px) return;
      var W = pc.clientWidth, H = pc.clientHeight, r = Math.min(devicePixelRatio || 1, 2);
      if (pc.width !== Math.round(W * r)) { pc.width = Math.round(W * r); pc.height = Math.round(H * r); contourPath = null; }
      px.setTransform(r, 0, 0, r, 0, 0);
      var z0 = 6, z1 = -58, xmax = 19;
      var sx = function (z) { return 10 + (z0 - z) / (z0 - z1) * (W - 20); };
      var sy = function (rad) { return H - 12 - rad / xmax * (H - 24); };
      if (d.cycle !== lastCycle) { trail = []; lastCycle = d.cycle; }
      if (!d.index && d.x < 60) { trail.push([d.z, d.x / 2]); if (trail.length > 900) trail.shift(); }
      px.clearRect(0, 0, W, H);
      // grid
      px.strokeStyle = 'rgba(255,255,255,.05)'; px.lineWidth = 1; px.beginPath();
      for (var gz = 0; gz >= -55; gz -= 5) { px.moveTo(sx(gz), 6); px.lineTo(sx(gz), H - 6); }
      px.stroke();
      // axis (centre line)
      px.setLineDash([6, 3, 1, 3]); px.strokeStyle = 'rgba(159,196,232,.45)'; px.beginPath(); px.moveTo(6, sy(0)); px.lineTo(W - 6, sy(0)); px.stroke(); px.setLineDash([]);
      // stock outline
      px.strokeStyle = 'rgba(255,255,255,.14)'; px.strokeRect(sx(0), sy(16), sx(-56) - sx(0), sy(0) - sy(16));
      // finished contour
      px.strokeStyle = 'rgba(209,171,98,.9)'; px.lineWidth = 1.2; px.beginPath();
      for (var z = 0; z >= -50; z -= 0.1) { var yy = sy(SR3D.profile(z)); if (z === 0) px.moveTo(sx(z), yy); else px.lineTo(sx(z), yy); }
      px.stroke();
      // bore
      px.setLineDash([3, 3]); px.strokeStyle = 'rgba(209,171,98,.5)'; px.beginPath(); px.moveTo(sx(0), sy(5)); px.lineTo(sx(-53), sy(5)); px.stroke(); px.setLineDash([]);
      // trail
      if (trail.length > 1) {
        px.strokeStyle = 'rgba(91,208,143,.85)'; px.lineWidth = 1; px.beginPath();
        trail.forEach(function (p, i) { var X = sx(p[0]), Y = sy(Math.min(p[1], 18)); if (i) px.lineTo(X, Y); else px.moveTo(X, Y); });
        px.stroke();
        var lp = trail[trail.length - 1];
        px.fillStyle = '#9ff0c0'; px.beginPath(); px.arc(sx(lp[0]), sy(Math.min(lp[1], 18)), 3, 0, 6.3); px.fill();
      }
    }

    var api = null;
    var startSim = function () {
    try { api = SR3D.hero($('#simCanvas'), hud, { lite: innerWidth < 900 }); } catch (e) { api = null; }
    if (api) {
      window.SR_SIM = api;
      sim.classList.add('is-live');
      $$('.console__mats button').forEach(function (b) {
        b.addEventListener('click', function () {
          $$('.console__mats button').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
          api.setMaterial(b.dataset.mat);
        });
      });
      var tg = $('#simToggle');
      tg.addEventListener('click', function () { var on = api.toggle(); tg.textContent = on ? tg.dataset.pause : tg.dataset.play; tg.classList.toggle('is-held', !on); });
      ops.forEach(function (li) { $('button', li).addEventListener('click', function () { api.seek(li.dataset.op); tg.textContent = tg.dataset.pause; tg.classList.remove('is-held'); }); });
    }
    };
    // start the WebGL scene only when the demo scrolls near the viewport
    if (io) new IntersectionObserver(function (en, obs) { if (en[0].isIntersecting) { obs.disconnect(); startSim(); } }, { rootMargin: '400px 0px' }).observe(sim);
    else startSim();
  }

  /* ---------- Photo showcase with hotspots ---------- */
  // stand-alone hotspot photos (e.g. aerial view)
  $$('.aerial__photo').forEach(function (f) { bindSpots(f); });
  function bindSpots(f) {
    var spots = $$('.spot', f), cards = $$('.spot__card', f);
    function open(i) {
      spots.forEach(function (s, k) { s.classList.toggle('is-open', k === i); s.setAttribute('aria-expanded', String(k === i)); });
      cards.forEach(function (c, k) { c.classList.toggle('is-open', k === i); });
    }
    spots.forEach(function (s, i) {
      s.addEventListener('click', function (e) { e.stopPropagation(); open(s.classList.contains('is-open') ? -1 : i); });
      s.addEventListener('mouseenter', function () { if (matchMedia('(hover: hover)').matches) open(i); });
    });
    f.addEventListener('click', function () { open(-1); });
    open(0);
  }
  $$('[data-showcase]').forEach(function (sc) {
    var tabs = $$('.showcase__tabs [role="tab"]', sc), scenes = $$('.showcase__scene', sc);
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        tabs.forEach(function (x) { x.setAttribute('aria-selected', String(x === t)); });
        scenes.forEach(function (f) { var on = f.dataset.scene === t.dataset.scene; f.hidden = !on; f.classList.toggle('is-active', on); });
      });
    });
    scenes.forEach(function (f) {
      var spots = $$('.spot', f), cards = $$('.spot__card', f);
      function open(i) {
        spots.forEach(function (s, k) { s.classList.toggle('is-open', k === i); s.setAttribute('aria-expanded', String(k === i)); });
        cards.forEach(function (c, k) { c.classList.toggle('is-open', k === i); });
      }
      spots.forEach(function (s, i) {
        s.addEventListener('click', function (e) { e.stopPropagation(); open(s.classList.contains('is-open') ? -1 : i); });
        s.addEventListener('mouseenter', function () { if (matchMedia('(hover: hover)').matches) open(i); });
      });
      f.addEventListener('click', function () { open(-1); });
      open(0);
    });
  });

  /* ---------- Parts viewer ---------- */
  var viewer = $('#viewer');
  if (viewer && window.SR3D) {
    var gal = null;
    var startViewer = function () {
      if (gal) return;
      try { gal = SR3D.gallery($('#viewerCanvas')); } catch (e) { viewer.classList.add('is-off'); return; }
      var sel = $('[aria-selected="true"]', viewer);
      gal.show(sel ? sel.dataset.part : 'bushing');
    };
    $$('.viewer__list [role="tab"]', viewer).forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.viewer__list [role="tab"]', viewer).forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
        startViewer(); gal && gal.show(b.dataset.part);
      });
    });
    if (io) new IntersectionObserver(function (en, obs) { if (en[0].isIntersecting) { obs.disconnect(); startViewer(); } }, { rootMargin: '300px 0px' }).observe(viewer);
    else startViewer();
  }

  /* ---------- Reveal on scroll ---------- */
  if (io && !reduce) {
    var revealIO = new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach(function (el, i) {
      var r = el.getBoundingClientRect();
      if (r.top < innerHeight) { el.classList.add('is-in'); return; }
      el.style.transitionDelay = ((i % 4) * 70) + 'ms';
      el.classList.add('is-pending');
      revealIO.observe(el);
    });
  }

  /* ---------- Counters ---------- */
  function fmt(n, sep) { var s = String(n); return sep ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : s; }
  if (io && !reduce) {
    var countIO = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (!e.isIntersecting) return;
        countIO.unobserve(e.target);
        var el = e.target, to = +el.dataset.count, sep = !!el.dataset.sep, t0 = performance.now(), dur = 1400;
        (function tick(t) {
          var p = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - p, 4)));
          el.textContent = fmt(v, sep);
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
      });
    }, { threshold: 0.6 });
    $$('[data-count]').forEach(function (el) { countIO.observe(el); });
  }

  /* ---------- Tabs ---------- */
  $$('[data-tabs]').forEach(function (root) {
    var tabs = $$('[role="tab"]', root);
    function select(t, focus) {
      tabs.forEach(function (x) {
        var on = x === t;
        x.setAttribute('aria-selected', String(on));
        x.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(x.getAttribute('aria-controls'));
        panel.hidden = !on;
        if (on) {
          panel.classList.remove('is-shown'); void panel.offsetWidth; panel.classList.add('is-shown');
          $$('img[data-render]', panel).forEach(function (img) { if (img.hidden && !img.dataset.rendered) renderInto(img); });
        }
      });
      if (focus) t.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true); }
      });
    });
  });

  /* ---------- Process flow: active step follows scroll ---------- */
  $$('[data-flow]').forEach(function (flow) {
    var steps = $$('.flow__step', flow), fillEl = $('.flow__fill', flow);
    function update() {
      var mid = innerHeight * 0.55, active = -1;
      steps.forEach(function (s, i) { if (s.getBoundingClientRect().top < mid) active = i; });
      steps.forEach(function (s, i) { s.classList.toggle('is-active', i === active); s.classList.toggle('is-past', i < active); });
      var r = flow.getBoundingClientRect();
      var p = Math.max(0, Math.min(1, (mid - r.top) / r.height));
      fillEl.style.transform = 'scaleY(' + p + ')';
    }
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    update();
  });

  /* ---------- Machine park filter ---------- */
  var mp = $('[data-mpark]');
  if (mp) {
    var rows = $$('#mTable tbody tr[data-qty]'), groups = $$('#mTable tbody'), search = $('#mSearch');
    var count = $('#mCount'), empty = $('#mEmpty'), reset = $('#mReset');
    var state = { group: '', brand: '', ctrl: '', q: '' };
    var apply = function () {
      var n = 0, q = state.q.toLowerCase();
      rows.forEach(function (tr) {
        var show = (!state.group || tr.dataset.group === state.group) &&
                   (!state.brand || tr.dataset.brand === state.brand) &&
                   (!state.ctrl || tr.dataset.ctrl === state.ctrl) &&
                   (!q || tr.textContent.toLowerCase().indexOf(q) !== -1);
        tr.hidden = !show;
        if (show) n += +tr.dataset.qty;
      });
      groups.forEach(function (tb) { tb.hidden = !$$('tr[data-qty]', tb).some(function (tr) { return !tr.hidden; }); });
      count.textContent = n;
      empty.hidden = n > 0;
      reset.hidden = !(state.group || state.brand || state.ctrl || state.q);
      $$('.chip', mp).forEach(function (c) { c.setAttribute('aria-pressed', String(c.dataset.group === state.group)); });
      $$('.brandbars [data-brand]', mp).forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.brand === state.brand)); });
      $$('.brandbars [data-ctrl]', mp).forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.ctrl === state.ctrl)); });
    };
    $$('.chip', mp).forEach(function (c) { c.addEventListener('click', function () { state.group = c.dataset.group; apply(); }); });
    $$('.brandbars [data-brand]', mp).forEach(function (x) {
      x.addEventListener('click', function () { state.brand = state.brand === x.dataset.brand ? '' : x.dataset.brand; apply(); });
    });
    $$('.brandbars [data-ctrl]', mp).forEach(function (x) {
      x.addEventListener('click', function () { state.ctrl = state.ctrl === x.dataset.ctrl ? '' : x.dataset.ctrl; apply(); });
    });
    search.addEventListener('input', function () { state.q = search.value.trim(); apply(); });
    reset.addEventListener('click', function () { state = { group: '', brand: '', ctrl: '', q: '' }; search.value = ''; apply(); });
  }

  /* ---------- Request for quotation wizard ---------- */
  var form = $('#rfq');
  if (form) {
    var steps = $$('.rfq__step', form), marks = $$('.stepper li', form);
    var status = $('#rfqStatus'), text = $('#rfqText'), mail = $('#rfqMail'), copy = $('#rfqCopy');
    var send = $('#rfqSend'), done = $('#rfqDone'), fallback = $('#rfqFallback'), actions = $('#rfqActions');
    var fileInput = $('#f-files'), drop = $('#rfqDrop'), list = $('#rfqList');
    var ds = form.dataset, files = [], opened = Date.now(), current = 1;
    var EXT = /\.(pdf|step|stp|igs|iges|dxf|dwg|x_t|sldprt|zip|png|jpe?g)$/i, MAX_FILES = 5, MAX_BYTES = 20 * 1048576;

    function show(n, scroll) {
      current = n;
      steps.forEach(function (s) { s.hidden = +s.dataset.step !== n; });
      marks.forEach(function (m, i) { m.classList.toggle('is-active', i + 1 === n); m.classList.toggle('is-done', i + 1 < n); });
      status.textContent = '';
      var first = $('.rfq__step:not([hidden]) input, .rfq__step:not([hidden]) a, .rfq__step:not([hidden]) button', form);
      if (first && n > 1) first.focus({ preventScroll: true });
      if (scroll) form.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
    function valid(step) {
      var okAll = true;
      $$('[required]', step).forEach(function (f) {
        var bad = f.type === 'checkbox' ? !f.checked
          : !f.value.trim() || (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value.trim()));
        f.classList.toggle('is-invalid', bad);
        f.setAttribute('aria-invalid', String(bad));
        if (bad && okAll) { f.focus(); okAll = false; }
      });
      if (!okAll) status.textContent = ds.msgInvalid;
      return okAll;
    }
    function size(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' kB'; }
    function renderFiles() {
      list.innerHTML = '';
      files.forEach(function (f, i) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="drop__ext"></span><span class="drop__name"></span><span class="drop__size"></span><button type="button" class="drop__rm">×</button>';
        li.children[0].textContent = (f.name.split('.').pop() || '').toUpperCase();
        li.children[1].textContent = f.name;
        li.children[2].textContent = size(f.size);
        li.children[3].setAttribute('aria-label', ds.msgRemove + ': ' + f.name);
        li.children[3].addEventListener('click', function () { files.splice(i, 1); renderFiles(); });
        list.appendChild(li);
      });
    }
    function addFiles(fl) {
      var msg = '';
      Array.prototype.forEach.call(fl, function (f) {
        var total = files.reduce(function (a, x) { return a + x.size; }, 0);
        if (!EXT.test(f.name)) msg = ds.msgType + ': ' + f.name;
        else if (files.length >= MAX_FILES || total + f.size > MAX_BYTES) msg = ds.msgSize;
        else if (!files.some(function (x) { return x.name === f.name && x.size === f.size; })) files.push(f);
      });
      status.textContent = msg;
      renderFiles();
    }
    if (fileInput) {
      fileInput.addEventListener('change', function () { addFiles(fileInput.files); fileInput.value = ''; });
      ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.add('is-over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove('is-over'); }); });
    }
    $$('input, select, textarea', form).forEach(function (f) {
      f.addEventListener(f.type === 'checkbox' ? 'change' : 'input', function () {
        if (f.classList.contains('is-invalid')) { f.classList.remove('is-invalid'); f.removeAttribute('aria-invalid'); status.textContent = ''; }
      });
    });
    show(1);

    $$('[data-next]', form).forEach(function (b) { b.addEventListener('click', function () { if (valid(steps[current - 1])) show(current + 1, true); }); });
    $$('[data-prev]', form).forEach(function (b) { b.addEventListener('click', function () { show(current - 1, true); }); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!valid(steps[1])) return;
      var lines = [];
      $$('input, select, textarea', form).forEach(function (f) {
        if (f.type === 'checkbox' || f.type === 'file' || f.name === 'website') return;
        var v = f.value.trim();
        if (!v || (f.tagName === 'SELECT' && f.selectedIndex === 0)) return;
        var label = $('label[for="' + f.id + '"]', form);
        lines.push((label ? label.textContent.replace('*', '').trim() : f.name) + ': ' + v);
      });
      if (files.length) lines.push(ds.msgFiles + ': ' + files.map(function (f) { return f.name; }).join(', '));
      var subject = ds.msgSubject + ' – ' + form.elements.company.value.trim();
      var body = lines.join('\n');
      text.textContent = subject + '\n\n' + body;
      mail.href = 'mailto:' + ds.to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      fallback.hidden = true; actions.hidden = false;
      show(3, true);
    });

    send.addEventListener('click', function () {
      var fd = new FormData(form);
      fd.delete('files[]');
      files.forEach(function (f) { fd.append('files[]', f, f.name); });
      fd.append('lang', ds.lang);
      fd.append('elapsed', String(Math.round((Date.now() - opened) / 1000)));
      var label = send.innerHTML;
      send.disabled = true; send.textContent = ds.msgSending;
      fetch(ds.endpoint, { method: 'POST', body: fd, headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok && res.j.ok) {
            $('#rfqRef').textContent = res.j.ref;
            steps.forEach(function (s) { s.hidden = true; });
            $('.stepper', form).hidden = true;
            done.hidden = false; done.focus();
            if (window.gtag) window.gtag('event', 'generate_lead', { method: 'rfq_form' });
          } else if (res.j && res.j.message) {
            status.textContent = res.j.message;
          } else throw new Error('rfq');
        })
        .catch(function () { actions.hidden = true; fallback.hidden = false; })
        .then(function () { send.disabled = false; send.innerHTML = label; });
    });

    copy.addEventListener('click', function () {
      var ok = function () { copy.textContent = copy.dataset.done; };
      var sel = function () { var r = document.createRange(); r.selectNodeContents(text); var s = getSelection(); s.removeAllRanges(); s.addRange(r); };
      if (navigator.clipboard) navigator.clipboard.writeText(text.textContent).then(ok, sel); else sel();
    });
  }

  /* ---------- Cookie consent, analytics, map ---------- */
  var KEY = 'sr-consent';
  function getConsent() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function setConsent(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
  function loadAnalytics() {
    var id = document.body.dataset.ga;
    if (!id || /X{4}/.test(id) || window.gtag) return;
    var s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id, { anonymize_ip: true });
  }
  function loadMap() {
    var box = $('#mapbox');
    if (!box || $('iframe', box)) return;
    var f = document.createElement('iframe');
    f.src = box.dataset.src; f.loading = 'lazy'; f.title = 'Google Maps'; f.referrerPolicy = 'no-referrer-when-downgrade';
    box.innerHTML = ''; box.appendChild(f); box.classList.add('is-loaded');
  }
  function applyConsent(c) {
    if (c && c.stats) loadAnalytics();
    if (c && c.maps) loadMap();
  }
  var cb = $('#cookie');
  if (cb) {
    var boxes = { stats: $('#ckStats'), maps: $('#ckMaps') };
    var openCookie = function (detail) {
      var c = getConsent() || {};
      boxes.stats.checked = !!c.stats; boxes.maps.checked = !!c.maps;
      cb.classList.toggle('is-detail', !!detail);
      cb.hidden = false;
    };
    var save = function (c) { c.t = Date.now(); setConsent(c); cb.hidden = true; applyConsent(c); };
    $('#ckAll').addEventListener('click', function () { save({ stats: true, maps: true }); });
    $('#ckNone').addEventListener('click', function () { save({ stats: false, maps: false }); });
    $('#ckMore').addEventListener('click', function () { cb.classList.add('is-detail'); });
    $('#ckSave').addEventListener('click', function () { save({ stats: boxes.stats.checked, maps: boxes.maps.checked }); });
    $$('[data-cookie-settings]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); openCookie(true); }); });
    var c0 = getConsent();
    if (c0) applyConsent(c0); else openCookie(false);
  }
  var ml = $('#mapLoad');
  if (ml) ml.addEventListener('click', function () {
    var c = getConsent() || { stats: false };
    c.maps = true; c.t = Date.now(); setConsent(c); loadMap();
  });
})();
