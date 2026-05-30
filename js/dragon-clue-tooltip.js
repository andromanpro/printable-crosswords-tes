/* Всплывающая подсказка-свиток при наведении на цифру в сетке.
 *
 * При hover на ячейку с номером (.cell > .num) показывает определение(я)
 * этого номера (По горизонтали / По вертикали) в стилизованном мини-свитке,
 * который «раскрывается» (scaleY 0→1 от верхнего валика).
 *
 * Карта номер→определения строится из .clues-container DOM (li с <b>N.</b>).
 */
(function () {
  'use strict';

  let tooltip = null;
  let clueMap = null;   // { num: [{dir, text}] }
  let hideTimer = 0;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, ch => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
    ));
  }

  function buildClueMap() {
    clueMap = {};
    const container = document.querySelector('.clues-container');
    if (!container) return;
    container.querySelectorAll(':scope > div').forEach(section => {
      const h3 = section.querySelector('h3');
      const dir = h3 ? h3.textContent.trim() : '';
      section.querySelectorAll('li').forEach(li => {
        const b = li.querySelector('b');
        let num = b ? parseInt(b.textContent, 10) : parseInt(li.value, 10);
        if (!num || isNaN(num)) return;
        const text = li.textContent.replace(/^\s*\d+\.\s*/, '').trim();
        if (!clueMap[num]) clueMap[num] = [];
        clueMap[num].push({ dir, text });
      });
    });
  }

  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.className = 'clue-scroll-tooltip';
    tooltip.innerHTML = '<div class="cst-rod cst-rod-top"></div>' +
                        '<div class="cst-body"></div>' +
                        '<div class="cst-rod cst-rod-bot"></div>';
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function showFor(cellEl) {
    const numSpan = cellEl.querySelector('.num');
    if (!numSpan) return;
    const num = parseInt(numSpan.textContent, 10);
    if (!num) return;
    if (!clueMap) buildClueMap();
    let entries = clueMap[num];
    if (!entries || !entries.length) {
      // карта могла устареть после rerender — пересобрать
      buildClueMap();
      entries = clueMap[num];
    }
    if (!entries || !entries.length) return;

    const tt = ensureTooltip();
    const body = tt.querySelector('.cst-body');
    body.innerHTML = entries.map(e =>
      '<div class="cst-row">' +
        (e.dir ? '<span class="cst-dir">' + escapeHtml(e.dir) + '</span>' : '') +
        '<span class="cst-text">' + escapeHtml(e.text) + '</span>' +
      '</div>'
    ).join('');

    // Позиционирование: под ячейкой, по центру; не вылезать за края
    tt.style.visibility = 'hidden';
    tt.classList.add('show');
    const rect = cellEl.getBoundingClientRect();
    const ttRect = tt.getBoundingClientRect();
    let left = rect.left + rect.width / 2;
    left = Math.max(ttRect.width / 2 + 8, Math.min(window.innerWidth - ttRect.width / 2 - 8, left));
    let top = rect.bottom + 10;
    if (top + ttRect.height > window.innerHeight - 8) {
      top = rect.top - ttRect.height - 10;   // показать сверху если не влезает снизу
    }
    tt.style.left = left + 'px';
    tt.style.top = Math.max(8, top) + 'px';
    tt.style.visibility = 'visible';
  }

  function hide() {
    if (tooltip) tooltip.classList.remove('show');
  }

  function init() {
    // Делегирование — ячейки пересоздаются при каждой генерации
    document.addEventListener('mouseover', (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      const cell = t.closest('.cell');
      if (!cell) return;
      const gc = cell.closest('#grid-container');
      if (!gc) return;                       // только основная сетка (не answer-key)
      if (!cell.querySelector('.num')) return;
      window.clearTimeout(hideTimer);
      showFor(cell);
    });
    document.addEventListener('mouseout', (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      const cell = t.closest('.cell');
      if (!cell) return;
      hideTimer = window.setTimeout(hide, 80);
    });
    // Сетка перерисована → сбросить карту (соберётся заново при следующем hover)
    window.addEventListener('cw-puzzle-generated', () => { clueMap = null; });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
