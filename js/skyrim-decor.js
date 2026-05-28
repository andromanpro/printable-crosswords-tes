/* Skyrim decor — обёртывает заголовок per-letter спанами с ornament-ромбами
 * и оборачивает #grid-container в .scroll-rod-top / .scroll-paper / .scroll-rod-bottom + .wax-seal.
 *
 * Активируется когда:
 *   1. body имеет класс theme-skyrim
 *   2. На <h1 class="app-title"> есть data-skyrim-decor с JSON массивом двух строк
 *      ИЛИ #grid-container существует (тогда decor свитка применяется).
 *
 * Wax-seal SVG-разметка от Claude.ai designer (Nordic Tomes), скопирована inline.
 * Logic per-letter заголовка — авторская from designer demo.
 */
(function () {
  'use strict';

  const WAX_SEAL_SVG = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
      '<radialGradient id="waxFill" cx="38%" cy="30%" r="68%">' +
        '<stop offset="0%" stop-color="#b22a1a"/>' +
        '<stop offset="38%" stop-color="#761814"/>' +
        '<stop offset="78%" stop-color="#3a0c08"/>' +
        '<stop offset="100%" stop-color="#1a0402"/>' +
      '</radialGradient>' +
      '<radialGradient id="waxHi" cx="38%" cy="28%" r="30%">' +
        '<stop offset="0%" stop-color="rgba(255,200,150,0.5)"/>' +
        '<stop offset="100%" stop-color="rgba(0,0,0,0)"/>' +
      '</radialGradient>' +
    '</defs>' +
    '<path fill="url(#waxFill)" d="M 50 3 C 70 4, 88 12, 95 30 C 100 48, 96 68, 84 82 C 74 94, 56 99, 40 96 C 22 92, 8 80, 4 62 C 1 44, 7 26, 18 12 C 28 4, 38 2, 50 3 Z"/>' +
    '<circle cx="50" cy="50" r="42" fill="none" stroke="rgba(15,4,2,0.6)" stroke-width="1.4"/>' +
    '<circle cx="50" cy="50" r="39" fill="none" stroke="rgba(255,180,120,0.18)" stroke-width="0.5"/>' +
    '<g fill="#0a0301">' +
      '<path d="M 45 35 C 35 30, 22 26, 12 30 C 8 32, 6 36, 10 38 C 14 38, 18 36, 22 36 C 17 38, 12 42, 10 46 C 9 48, 12 50, 15 49 C 22 47, 28 44, 33 41 C 30 44, 27 48, 26 52 C 26 54, 28 54, 30 53 C 35 50, 40 46, 44 42 L 45 40 Z"/>' +
      '<path d="M 10 30 L 8 28 L 12 30 Z"/><path d="M 10 38 L 7 38 L 10 40 Z"/><path d="M 10 46 L 7 47 L 10 48 Z"/>' +
      '<path d="M 55 35 C 65 30, 78 26, 88 30 C 92 32, 94 36, 90 38 C 86 38, 82 36, 78 36 C 83 38, 88 42, 90 46 C 91 48, 88 50, 85 49 C 78 47, 72 44, 67 41 C 70 44, 73 48, 74 52 C 74 54, 72 54, 70 53 C 65 50, 60 46, 56 42 L 55 40 Z"/>' +
      '<path d="M 90 30 L 92 28 L 88 30 Z"/><path d="M 90 38 L 93 38 L 90 40 Z"/><path d="M 90 46 L 93 47 L 90 48 Z"/>' +
      '<path d="M 44 18 C 42 12, 38 8, 36 5 C 39 11, 41 16, 43 20 Z"/>' +
      '<path d="M 56 18 C 58 12, 62 8, 64 5 C 61 11, 59 16, 57 20 Z"/>' +
      '<path d="M 44 20 C 44 16, 48 14, 50 14 C 52 14, 56 16, 56 20 L 57 24 C 57 27, 54 29, 50 29 C 46 29, 43 27, 43 24 Z"/>' +
      '<path d="M 45 27 L 50 34 L 55 27 L 53 28 L 52 30 L 51 28 L 49 30 L 48 28 L 47 29 Z" fill="#3a0c08"/>' +
      '<path d="M 47 30 C 46 36, 45 42, 47 46 C 44 48, 42 52, 44 56 L 46 58 C 47 54, 48 52, 50 50 C 52 52, 53 54, 54 58 L 56 56 C 58 52, 56 48, 53 46 C 55 42, 54 36, 53 30 Z"/>' +
      '<path d="M 44 56 C 40 60, 36 64, 36 68 L 38 68 L 36 70 L 39 70 L 37 72 L 41 72 L 40 74 L 43 72 C 44 68, 46 64, 47 60 Z"/>' +
      '<path d="M 56 56 C 60 60, 64 64, 64 68 L 62 68 L 64 70 L 61 70 L 63 72 L 59 72 L 60 74 L 57 72 C 56 68, 54 64, 53 60 Z"/>' +
      '<path d="M 50 58 C 50 64, 48 70, 44 74 C 40 78, 36 80, 32 78 C 28 76, 28 70, 32 68 C 35 67, 38 70, 36 72 C 35 73, 33 72, 33 71 C 33 74, 36 76, 38 74 C 42 70, 44 64, 48 60 L 50 58 Z"/>' +
      '<path d="M 33 71 L 30 73 L 31 70 Z"/>' +
    '</g>' +
    '<ellipse cx="36" cy="30" rx="15" ry="9" fill="url(#waxHi)"/>' +
  '</svg>';

  function buildTitle() {
    const h = document.getElementById('app-title') || document.querySelector('.app-title');
    if (!h) return;
    let linesAttr = h.getAttribute('data-skyrim-lines');
    let lines;
    if (linesAttr) {
      try { lines = JSON.parse(linesAttr); } catch (e) {}
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      // Авто-разбивка: ищем "по " или "·" как разделитель
      const txt = h.textContent.trim();
      const m = txt.match(/^(.+?\s+по)\s+(.+)$/);
      if (m) lines = [m[1], m[2]];
      else lines = [txt];
    }
    h.textContent = '';
    let i = 0;
    lines.forEach((line, lineIdx) => {
      const lineEl = document.createElement('span');
      lineEl.className = 'title-line line-' + (lineIdx + 1);
      const addOrn = lineIdx === lines.length - 1 && lines.length > 1;
      if (addOrn) {
        const o = document.createElement('span');
        o.className = 'ornament';
        o.textContent = '◆';
        lineEl.appendChild(o);
      }
      [...line].forEach(ch => {
        const s = document.createElement('span');
        if (ch === ' ') {
          s.className = 'letter space';
          s.innerHTML = '&nbsp;';
        } else {
          s.className = 'letter';
          s.textContent = ch;
        }
        s.style.setProperty('--i', i++);
        lineEl.appendChild(s);
      });
      if (addOrn) {
        const o2 = document.createElement('span');
        o2.className = 'ornament';
        o2.textContent = '◆';
        lineEl.appendChild(o2);
      }
      h.appendChild(lineEl);
    });
    h.setAttribute('data-skyrim-decorated', '1');
  }

  // Обёртываем содержимое #grid-container — каждый раз когда оно меняется
  function wrapScrollWhenReady() {
    const gc = document.getElementById('grid-container');
    if (!gc) return;
    // Если уже обёрнуто — не трогаем
    if (gc.querySelector(':scope > .scroll-paper')) return;
    // Берём всё текущее содержимое
    const inner = document.createElement('div');
    inner.className = 'scroll-paper';
    while (gc.firstChild) inner.appendChild(gc.firstChild);
    const rodTop = document.createElement('div');
    rodTop.className = 'scroll-rod-top';
    rodTop.setAttribute('aria-hidden', 'true');
    const rodBot = document.createElement('div');
    rodBot.className = 'scroll-rod-bottom';
    rodBot.setAttribute('aria-hidden', 'true');
    const seal = document.createElement('div');
    seal.className = 'wax-seal';
    seal.setAttribute('aria-hidden', 'true');
    gc.appendChild(rodTop);
    gc.appendChild(inner);
    gc.appendChild(rodBot);
    gc.appendChild(seal);

    // Intro-play на первом раскрытии
    requestAnimationFrame(() => gc.classList.add('intro-play'));
    setTimeout(() => gc.classList.remove('intro-play'), 3000);
  }

  function ensureWrapped() {
    const gc = document.getElementById('grid-container');
    if (!gc) return;
    const hasContent = gc.children.length > 0;
    if (!hasContent) return;
    // Если рендерер только что переписал innerHTML — wrapper исчез, переоборачиваем
    if (!gc.querySelector(':scope > .scroll-paper')) {
      wrapScrollWhenReady();
      // Эффект regen — короткая анимация раскрытия
      gc.classList.remove('regen-active');
      requestAnimationFrame(() => gc.classList.add('regen-active'));
      setTimeout(() => gc.classList.remove('regen-active'), 1400);
    }
  }

  function init() {
    if (!document.body.classList.contains('theme-skyrim')) {
      // Слушаем смену темы
      const obs = new MutationObserver(() => {
        if (document.body.classList.contains('theme-skyrim')) {
          obs.disconnect();
          buildTitle();
          wrapScrollWhenReady();
          watchGrid();
        }
      });
      obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      return;
    }
    buildTitle();
    wrapScrollWhenReady();
    watchGrid();
  }

  function watchGrid() {
    const gc = document.getElementById('grid-container');
    if (!gc) return;
    const mo = new MutationObserver(() => ensureWrapped());
    mo.observe(gc, { childList: true, subtree: false });
    // Backup polling — MutationObserver не всегда ловит batch-update от рендерера
    setInterval(() => ensureWrapped(), 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
