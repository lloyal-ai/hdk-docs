/* The site's one script. Everything it does is an enhancement: with it off,
   the theme stays dark and every link is a plain anchor. */
(function () {
  var root = document.documentElement;

  /* Theme. Dark unless this reader chose light; the choice is remembered per
     browser, and the <head> applies it before first paint. */
  var toggle = document.querySelector('.theme-toggle');
  var meta = document.querySelector('meta[name="theme-color"]');
  function applied() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  function sync() {
    var t = applied();
    if (meta) meta.setAttribute('content', t === 'light' ? '#ffffff' : '#080808');
    if (toggle) toggle.setAttribute('aria-label', t === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
  }
  if (toggle) toggle.addEventListener('click', function () {
    var next = applied() === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('lloyal-docs-theme', next); } catch (e) {}
    sync();
  });
  sync();

  /* Menu. Below the breakpoint the tabs and sidebar are one drawer. */
  var btn = document.querySelector('.menu-button');
  var drawer = document.getElementById('drawer');
  function setOpen(open) {
    if (!btn || !drawer) return;
    drawer.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    root.classList.toggle('drawer-open', open);
  }
  if (btn && drawer) {
    btn.addEventListener('click', function () { setOpen(drawer.hidden); });
    drawer.addEventListener('click', function (e) { if (e.target.tagName === 'A') setOpen(false); });
    addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !drawer.hidden) { setOpen(false); btn.focus(); }
    });
    addEventListener('resize', function () { if (innerWidth > 820 && !drawer.hidden) setOpen(false); });
  }

  /* Copy buttons on code frames. */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.code-copy');
    if (!b) return;
    var code = b.closest('.code-frame').querySelector('pre code');
    var text = code ? code.innerText : '';
    function done(label) { b.textContent = label; setTimeout(function () { b.textContent = 'Copy'; }, 1400); }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { done('Copied'); }, function () { done('Press ⌘C'); });
    else done('Press ⌘C');
  });

  /* The contents rail follows the section you are reading.

     The current section is the last heading whose top has passed the read line
     — a plain geometric test rather than IntersectionObserver, which only fires
     for headings crossing a thin band and so never settles after a jump. */
  var toc = document.querySelector('.toc-rail .toc');
  if (toc) {
    var items = [].slice.call(toc.querySelectorAll('a[href^="#"]')).map(function (a) {
      return { a: a, el: document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))) };
    }).filter(function (i) { return i.el; });
    var current = null;
    var track = function () {
      if (!items.length) return;
      var line = innerHeight * 0.25, found = items[0];
      for (var i = 0; i < items.length; i++) {
        if (items[i].el.getBoundingClientRect().top <= line) found = items[i];
        else break;
      }
      if (found === current) return;
      if (current) current.a.classList.remove('active');
      current = found;
      found.a.classList.add('active');
      // Keep the active entry inside the rail's own scroll box; scrollIntoView would move the page too.
      var box = toc.getBoundingClientRect(), row = found.a.getBoundingClientRect();
      if (row.top < box.top + 40) toc.scrollTop -= (box.top + 40 - row.top);
      else if (row.bottom > box.bottom - 40) toc.scrollTop += (row.bottom - box.bottom + 40);
    };
    var queued = false;
    var onScroll = function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; track(); });
    };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    addEventListener('hashchange', onScroll);
    track();
  }

  /* Back to top, once there is somewhere to go back from. */
  var top = document.querySelector('.back-to-top');
  if (top) {
    var show = function () { top.classList.toggle('show', scrollY > 900); };
    addEventListener('scroll', show, { passive: true });
    show();
  }
})();
