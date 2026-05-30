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

  // v2: дефолт сменён на cinematic (3D). Бамп ключа — чтобы старое авто-сохранённое
  // значение v1 ('fly') не перебивало новый дефолт у тех, кто уже открывал страницу.
  const KEY = 'cw_dragon_mode_v2';
  const VALID = ['fly', 'cursor', 'cinematic', 'none'];
  const DEFAULT_MODE = 'cinematic';

  function apply(mode, persist) {
    if (!VALID.includes(mode)) mode = DEFAULT_MODE;
    document.body.classList.remove('dragon-mode-fly', 'dragon-mode-cursor', 'dragon-mode-cinematic', 'dragon-mode-none');
    document.body.classList.add('dragon-mode-' + mode);
    // Сохраняем ТОЛЬКО явный выбор пользователя. Дефолт и file://-даунгрейд не
    // персистим — иначе открытие через file:// «зашьёт» fly и cinematic больше
    // не станет дефолтом на сервере.
    if (persist) { try { localStorage.setItem(KEY, mode); } catch (e) { /* ignore */ } }

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
    // Приоритет: ?dragon= (явный) → сохранённый выбор → ДЕФОЛТ (cinematic, 3D).
    let initial = VALID.includes(requested) ? requested
                : VALID.includes(saved) ? saved
                : DEFAULT_MODE;
    let userChoice = VALID.includes(requested) || VALID.includes(saved);
    // file:// CORS блокирует fetch к локальным GLB. Cinematic там не грузится —
    // откатываем на fly (но НЕ персистим даунгрейд).
    if (initial === 'cinematic' && window.location.protocol === 'file:') {
      initial = 'fly';
      userChoice = false;
    }
    const radio = document.querySelector('input[name="dragon"][value="' + initial + '"]');
    if (radio) radio.checked = true;
    apply(initial, userChoice);   // персистим только если это явный выбор пользователя

    document.querySelectorAll('input[name="dragon"]').forEach(r => {
      r.addEventListener('change', e => apply(e.target.value, true));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
