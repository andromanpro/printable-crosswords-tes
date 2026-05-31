/* Светящаяся руна на пустой клетке при наведении.
 *
 * При hover на заполняемую ПУСТУЮ клетку (.cell не .block, без user-letter)
 * в ней проступает случайная руна Старшего Футарка (шрифт Noto Sans Runic,
 * локальный woff2) с магика-голубым свечением.
 * Исчезает при уходе курсора или когда клетку заполнили.
 *
 * Шрифт бандлится локально (offline), поэтому руны всегда рендерятся.
 * Делегирование на document — клетки пересоздаются при каждой генерации.
 */
(function () {
  'use strict';

  // Настоящие руны Старшего Футарка (шрифт Noto Sans Runic, локальный woff2).
  // Берём ясно читаемые глифы блока U+16A0–16F8.
  const RUNES = [
    'ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ',
    'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ', 'ᛚ', 'ᛜ', 'ᛞ', 'ᛟ'
  ];

  // Пока идёт заставка загрузки сцены или горение — руны не показываем
  // (заставка pointer-events:none пропускает наведение на сетку под ней).
  function sceneBusy() {
    // Тач-устройства: hover-руна не нужна и «залипает» (mouseout не приходит).
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) return true;
    return document.body.classList.contains('dragon-cinematic-loading') ||
           window.__cwBurnActive === true;
  }

  function isFillableEmpty(cell) {
    if (!cell || cell.classList.contains('block')) return false;
    const ul = cell.querySelector('.user-letter');
    // Пусто если нет user-letter ИЛИ он без текста. Ответ (.ans) на главной скрыт.
    if (ul && ul.textContent.trim()) return false;
    return true;
  }

  const FADE_MS = 750;   // задержка плавного затухания руны после ухода курсора

  function addRune(cell) {
    const existing = cell.querySelector('.rune-ghost');
    if (existing) {
      // Руна уже есть (возможно затухает) — отменяем затухание, оставляем
      existing.classList.remove('rune-fading');
      if (existing.__fadeTimer) { clearTimeout(existing.__fadeTimer); existing.__fadeTimer = 0; }
      return;
    }
    const r = document.createElement('span');
    r.className = 'rune-ghost';
    r.textContent = RUNES[(Math.random() * RUNES.length) | 0];
    r.setAttribute('aria-hidden', 'true');
    cell.appendChild(r);
  }

  function removeRune(cell) {
    const r = cell.querySelector('.rune-ghost');
    if (!r || r.__fadeTimer) return;     // нет руны или уже затухает
    // Не удаляем сразу — запускаем плавное затухание, удаляем после FADE_MS
    r.classList.add('rune-fading');
    r.__fadeTimer = window.setTimeout(() => {
      if (r.parentNode) r.parentNode.removeChild(r);
    }, FADE_MS);
  }

  function init() {
    document.addEventListener('mouseover', (e) => {
      if (sceneBusy()) return;               // не показывать поверх заставки/горения
      const t = e.target;
      if (!t || !t.closest) return;
      const cell = t.closest('.cell');
      if (!cell) return;
      if (!cell.closest('#grid-container')) return;   // только основная сетка
      if (isFillableEmpty(cell)) addRune(cell);
    });
    document.addEventListener('mouseout', (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      const cell = t.closest('.cell');
      if (cell) removeRune(cell);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
