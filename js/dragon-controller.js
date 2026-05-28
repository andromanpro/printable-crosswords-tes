/* Dragon controller — выбор режима дракона:
 *  - fly       : дизайнерский dragon-flight (Nordic Tomes by Claude.ai)
 *  - cursor    : скелетный за курсором (DRAGON-FOLLOWS-YOU by NABORAJ SARKAR, MIT)
 *  - cinematic : Three.js-сцена с локальной GLB/glTF-моделью и огнем
 *  - none      : без дракона
 * Состояние сохраняется в localStorage 'cw_dragon_mode_v1'.
 * Body получает класс dragon-mode-{fly|cursor|cinematic|none}.
 */
(function () {
  'use strict';

  const KEY = 'cw_dragon_mode_v1';
  const VALID = ['fly', 'cursor', 'cinematic', 'none'];

  function apply(mode) {
    if (!VALID.includes(mode)) mode = 'fly';
    document.body.classList.remove('dragon-mode-fly', 'dragon-mode-cursor', 'dragon-mode-cinematic', 'dragon-mode-none');
    document.body.classList.add('dragon-mode-' + mode);
    try { localStorage.setItem(KEY, mode); } catch (e) { /* ignore */ }

    if (window.CWDragonCinematic && typeof window.CWDragonCinematic.setEnabled === 'function') {
      window.CWDragonCinematic.setEnabled(mode === 'cinematic');
    }
    try {
      window.dispatchEvent(new CustomEvent('cw-dragon-mode-change', { detail: { mode } }));
    } catch (e) { /* ignore */ }
  }

  function init() {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    let requested = null;
    try { requested = new URLSearchParams(window.location.search).get('dragon'); } catch (e) {}
    const initial = VALID.includes(requested) ? requested : saved;
    const radio = document.querySelector('input[name="dragon"][value="' + initial + '"]');
    if (initial && radio) {
      radio.checked = true;
    }
    const checked = document.querySelector('input[name="dragon"]:checked');
    apply(checked ? checked.value : 'fly');

    document.querySelectorAll('input[name="dragon"]').forEach(r => {
      r.addEventListener('change', e => apply(e.target.value));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
