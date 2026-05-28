/* Dragon controller — выбор режима дракона:
 *  - fly    : дизайнерский dragon-flight (Nordic Tomes by Claude.ai)
 *  - cursor : скелетный за курсором (DRAGON-FOLLOWS-YOU by NABORAJ SARKAR, MIT)
 *  - none   : без дракона
 * Состояние сохраняется в localStorage 'cw_dragon_mode_v1'.
 * Body получает класс dragon-mode-{fly|cursor|none}, CSS показывает соответствующий SVG.
 */
(function () {
  'use strict';

  const KEY = 'cw_dragon_mode_v1';
  const VALID = ['fly', 'cursor', 'none'];

  function apply(mode) {
    if (!VALID.includes(mode)) mode = 'fly';
    document.body.classList.remove('dragon-mode-fly', 'dragon-mode-cursor', 'dragon-mode-none');
    document.body.classList.add('dragon-mode-' + mode);
    try { localStorage.setItem(KEY, mode); } catch (e) { /* ignore */ }
  }

  function init() {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    const radio = document.querySelector('input[name="dragon"][value="' + saved + '"]');
    if (saved && radio) {
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
