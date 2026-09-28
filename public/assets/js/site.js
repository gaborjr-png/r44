/* Steel Riders Kft. – site script */
(function () {
  'use strict';

  /* Mobile navigation */
  var btn = document.getElementById('menuBtn');
  var nav = document.getElementById('nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
        btn.focus();
      }
    });
  }

  /* Photo slots: show the placeholder label when a photo file is missing */
  function markEmpty(img) {
    var fig = img.closest('.photo');
    if (fig) fig.classList.add('is-empty');
    img.hidden = true;
  }
  document.querySelectorAll('.photo img, .hero__media img, .page-head__bg img').forEach(function (img) {
    if (img.complete && img.naturalWidth === 0) markEmpty(img);
    else img.addEventListener('error', function () { markEmpty(img); });
  });

  /* Request for quotation */
  var form = document.getElementById('rfq');
  if (!form) return;
  var status = document.getElementById('rfqStatus');
  var result = document.getElementById('rfqResult');
  var text = document.getElementById('rfqText');
  var mail = document.getElementById('rfqMail');
  var copy = document.getElementById('rfqCopy');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var valid = true;
    form.querySelectorAll('[required]').forEach(function (f) {
      var bad = !f.value.trim() || (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value.trim()));
      f.classList.toggle('is-invalid', bad);
      f.setAttribute('aria-invalid', String(bad));
      if (bad) valid = false;
    });
    if (!valid) {
      status.textContent = form.dataset.msgInvalid;
      result.hidden = true;
      return;
    }
    status.textContent = '';

    var lines = [];
    form.querySelectorAll('input, select, textarea').forEach(function (f) {
      var v = f.value.trim();
      if (!v || (f.tagName === 'SELECT' && f.selectedIndex === 0)) return;
      var label = form.querySelector('label[for="' + f.id + '"]');
      lines.push((label ? label.textContent.replace('*', '').trim() : f.name) + ': ' + v);
    });
    var company = form.elements.company.value.trim();
    var subject = form.dataset.msgSubject + ' – ' + company;
    var body = lines.join('\n');

    text.textContent = subject + '\n\n' + body;
    mail.href = 'mailto:' + form.dataset.to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    result.hidden = false;
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  copy.addEventListener('click', function () {
    var done = function () { copy.textContent = copy.dataset.done; };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text.textContent).then(done, selectText);
    } else {
      selectText();
    }
  });
  function selectText() {
    var r = document.createRange();
    r.selectNodeContents(text);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
})();
