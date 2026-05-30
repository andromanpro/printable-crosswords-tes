/* Dragon burn-on-generate overlay.
 *
 * Перехватывает клики по «Сгенерировать» и «Показать ответы» в cinematic
 * режиме. Запускает 1.6s анимацию:
 *   1) triggerFire() — дракон делает burst-of-fire (все 100 partile reset)
 *   2) grid-container получает CSS-класс .dragon-burning — overlay-огонь
 *      + filter sepia/blur/darken прогрессивно "сжигает" содержимое
 *   3) Через BURN_MS вызывается оригинальный handler (re-dispatch click
 *      с __dragonBypass=true чтобы не зациклиться)
 *
 * Если cinematic режим выключен — событие проходит без задержки.
 */
(function () {
  'use strict';

  const DRAGON_DELAY = 600;  // пауза «дракон пыхает» ДО возгорания бумаги
  const BURN_MS = 1450;      // длительность dissolve-burn (canvas)
  const UNROLL_MS = 760;     // разворачивание нового свитка
  const BUTTONS = ['btn-generate', 'btn-toggle-answers'];
  let burnRunning = false;

  function isCinematic() {
    return document.body.classList.contains('dragon-mode-cinematic');
  }

  function prefersReducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (_) { return false; }
  }

  function burnEnabled() {
    // Settings: lab.burnOnGenerate (default true). Если выключено в панели —
    // пропускаем burn и пропускаем клик до оригинального handler'а.
    try {
      const s = JSON.parse(localStorage.getItem('cw_dragon_lab_settings_v1') || '{}');
      return s.burnOnGenerate !== false;
    } catch (_) { return true; }
  }

  function gridEl() { return document.getElementById('grid-container'); }

  /* Хореография:
   *   0ms      — дракон делает burst-of-fire (пыхает)
   *   +600ms   — бумага ЗАГОРАЕТСЯ (canvas dissolve-burn) + старый контент гаснет
   *   +1450ms  — прогорело: рендерим новый кроссворд СВЁРНУТЫМ (скрыт)
   *   +rAF     — РАЗВОРАЧИВАЕМ свиток (clip-path inset 100%→0)
   */
  function runBurnSequence(continueFn) {
    const grid = gridEl();
    if (!grid) { burnRunning = false; continueFn(); return; }

    // Флаг для skyrim-decor: не добавлять свой regen-unroll (иначе двойная анимация)
    window.__cwBurnActive = true;
    grid.classList.remove('is-revealing', 'is-rolled', 'is-burn-swapping');

    // 1. Дракон пыхает (огонь из пасти)
    if (window.CWDragonCinematic && typeof window.CWDragonCinematic.triggerFire === 'function') {
      window.CWDragonCinematic.triggerFire();
    }

    // 2. Пауза → бумага загорается (даём дракону «пыхнуть» сначала)
    window.setTimeout(() => {
      grid.classList.add('is-burning');   // гасит старый контент (CSS) + готовит сцену
      if (window.CWScrollFire && typeof window.CWScrollFire.start === 'function') {
        grid.__stopFire = window.CWScrollFire.start(grid, { duration: BURN_MS });
      }

      // 3. Прогорело → новый контент, свёрнутый
      window.setTimeout(() => {
        // Hide the old paper before removing the burn canvas/mask. This keeps
        // the old crossword from flashing during DOM replacement.
        grid.classList.add('is-rolled', 'is-burn-swapping');
        if (grid.__stopFire) { grid.__stopFire(); grid.__stopFire = null; }
        grid.classList.remove('is-burning');
        try {
          continueFn();                        // app.js renders new content while the scroll is hidden/rolled.
        } catch (err) {
          // Перегенерация упала — НЕ пробрасываем дальше (иначе оборвётся
          // асинхронная цепочка и UI «зависнет» в свёрнутом виде). Чисто
          // откатываем классы и флаги, чтобы кнопка снова работала.
          console.error('[burn] continueFn failed — откат сцены:', err);
          grid.classList.remove('is-burn-swapping', 'is-rolled', 'is-revealing');
          window.__cwBurnActive = false;
          burnRunning = false;
          return;
        }

        // 4. Развернуть свиток (после пересборки .scroll-paper в skyrim-decor)
        window.setTimeout(() => {
          grid.classList.remove('is-burn-swapping');
          grid.classList.remove('is-rolled');
          grid.classList.add('is-revealing');
          window.setTimeout(() => {
            grid.classList.remove('is-revealing');
            window.__cwBurnActive = false;   // снимаем флаг — regen снова разрешён
            burnRunning = false;
          }, UNROLL_MS + 80);
        }, 70);
      }, BURN_MS);
    }, DRAGON_DELAY);
  }

  function interceptButton(id) {
    const btn = document.getElementById(id);
    if (!btn) return;

    btn.addEventListener('click', function (e) {
      if (!isCinematic()) {
        console.info('[burn] skip: dragon-mode != cinematic');
        return;
      }
      if (!burnEnabled()) {
        console.info('[burn] skip: burnOnGenerate=false в lab-настройках');
        return;
      }
      if (prefersReducedMotion()) {
        // Доступность: при prefers-reduced-motion НЕ перехватываем клик —
        // обычная мгновенная генерация без огня/частиц/задержки.
        console.info('[burn] skip: prefers-reduced-motion → без анимации');
        return;
      }
      if (e.__dragonBypass) {
        console.info('[burn] bypass click — re-dispatch проходит к app.js');
        return;
      }
      console.info('[burn] intercept click on', id, '→ запускаем burn 1.6s');
      if (burnRunning) {
        e.preventDefault();
        e.stopImmediatePropagation();
        console.info('[burn] ignored click: sequence already running');
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();

      burnRunning = true;
      runBurnSequence(() => {
        console.info('[burn] sequence finished → re-dispatch click');
        const fake = new MouseEvent('click', { bubbles: true, cancelable: true });
        fake.__dragonBypass = true;
        btn.dispatchEvent(fake);
      });
    }, true);  // CAPTURE phase — раньше bubble-listener'ов app.js
  }

  function init() {
    console.info('[burn] init — intercepting:', BUTTONS.join(', '));
    BUTTONS.forEach(interceptButton);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
