/* Dragon position editor — refactor v2 (full-viewport canvas архитектура).
 *
 * Включается чекбоксом #dragon-edit-pos в фрагменте «Дракон» на главной.
 * Когда активен:
 *   - .dragon-cinematic-stage получает класс .dragon-stage-editing →
 *     CSS делает canvas pointer-events:auto + cursor:move + информер;
 *   - Любой drag на canvas'е → live обновление lab.anchorX / lab.anchorY
 *     в localStorage. dragon-cinematic.getBottomAnchor() в render-loop
 *     подхватывает мгновенно (читает settings каждый кадр).
 *
 * Главное отличие от v1: НЕ двигает stage.style.left/top (это был DOM-rect),
 * а перетягивает PROJECTED-position дракона в 3D-сцене через anchorX/Y.
 * Никаких clipping'ов, никакой DOM-математики.
 */
(function () {
  'use strict';

  const KEY = 'cw_dragon_lab_settings_v1';
  const STAGE_ID = 'dragon-cinematic-stage';
  const CHECKBOX_ID = 'dragon-edit-pos';

  let editing = false;
  let dragging = false;

  function getStage() { return document.getElementById(STAGE_ID); }

  function getSettings() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) || {}) : {};
    } catch (_) { return {}; }
  }

  function saveSettings(patch) {
    const s = getSettings();
    Object.assign(s, patch);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
  }

  function ensureDoneButton() {
    let b = document.getElementById('dragon-edit-done');
    if (b) return b;
    b = document.createElement('button');
    b.id = 'dragon-edit-done';
    b.type = 'button';
    b.textContent = '✓ Закончить перемещение (Esc)';
    document.body.appendChild(b);
    b.addEventListener('click', exitEditing);
    return b;
  }

  function setEditing(on) {
    editing = on;
    const stage = getStage();
    if (stage) stage.classList.toggle('dragon-stage-editing', on);
    document.body.classList.toggle('dragon-editing-position', on);
    // Кнопка выхода (z-index выше канваса) — единственный гарантированный способ
    // выйти, т.к. canvas в edit-mode перекрывает чекбокс в панели.
    ensureDoneButton();
  }

  // Чистый выход: снять чекбокс + выключить режим
  function exitEditing() {
    const cb = document.getElementById(CHECKBOX_ID);
    if (cb) cb.checked = false;
    dragging = false;
    setEditing(false);
  }

  function clientToAnchorPercent(clientX, clientY) {
    return {
      anchorX: Math.max(0, Math.min(100, (clientX / window.innerWidth)  * 100)),
      anchorY: Math.max(0, Math.min(100, (clientY / window.innerHeight) * 100))
    };
  }

  function onPointerDown(e) {
    if (!editing) return;
    const stage = getStage();
    if (!stage) return;
    // В edit-mode canvas принимает события. Если pointer на canvas — начинаем drag.
    const path = e.composedPath ? e.composedPath() : [];
    const onCanvas = path.includes(stage) ||
                     (e.target && (e.target.tagName === 'CANVAS' || e.target === stage));
    if (!onCanvas) return;
    dragging = true;
    // Сразу позиционируем по клику — feedback моментальный
    applyDragTo(e.clientX, e.clientY);
    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerMove(e) {
    if (!dragging) return;
    applyDragTo(e.clientX, e.clientY);
    e.preventDefault();
  }

  function applyDragTo(clientX, clientY) {
    const a = clientToAnchorPercent(clientX, clientY);
    saveSettings({
      anchorX: Math.round(a.anchorX * 10) / 10,
      anchorY: Math.round(a.anchorY * 10) / 10,
      followScroll: false   // drag-режим — viewport-anchored
    });
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    e.preventDefault();
  }

  function init() {
    const cb = document.getElementById(CHECKBOX_ID);
    if (!cb) return;
    cb.addEventListener('change', () => setEditing(cb.checked));
    // Capture phase — чтобы перехватить событие ДО orbit-controls dragon-cinematic'а
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup',   onPointerUp);
    // Если режим переключили на не-cinematic — снять edit-mode
    window.addEventListener('cw-dragon-mode-change', (event) => {
      if (event.detail && event.detail.mode !== 'cinematic' && cb.checked) {
        exitEditing();
      }
    });
    // Escape — аварийный выход из режима перетаскивания
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && editing) exitEditing();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
