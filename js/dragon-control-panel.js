/* Dragon control panel — inline-настройки дракона на главной странице.
 *
 * Дублирует ключевые слайдеры из dragon-lab.html, но работает live:
 *   slider input → localStorage.cw_dragon_lab_settings_v1 → CWDragonCinematic.refreshLabSettings()
 * → дракон обновляется на текущем кадре. Никаких F5 + nav между tabs.
 *
 * Видим только когда выбран dragon-mode = cinematic
 * (CSS: body.dragon-mode-cinematic .dragon-tune-panel { display: block }).
 */
(function () {
  'use strict';

  const KEY = 'cw_dragon_lab_settings_v1';
  const DEFAULTS = {
    anchorX: 50, anchorY: 30,
    followScroll: false,
    dragonYaw: 0, dragonPitch: 0, dragonRoll: 0,
    dragonScale: 0.54,
    pedestalScale: 0.62,
    dragonOffsetX: 0, dragonOffsetY: 0, dragonOffsetZ: 0,
    fireX: 0.5, fireY: 0.1, fireZ: 0,
    fireYaw: 0, firePitch: 0,
    fireLength: 2, fireIntensity: 1,
    fireWindowStart: 3, fireWindowEnd: 5,
    mouthBone: null,
    trackCursor: false,
    showPedestal: true,
    burnOnGenerate: true,
    lightIntensity: 1.0,
    platformLight: 0.6,
    runeBeltOffset: 0
  };

  function loadSettings() {
    // Merge: DEFAULTS ← baked (window.CW_DRAGON_DEFAULTS) ← localStorage
    const merged = Object.assign({}, DEFAULTS);
    if (window.CW_DRAGON_DEFAULTS && typeof window.CW_DRAGON_DEFAULTS === 'object') {
      Object.assign(merged, window.CW_DRAGON_DEFAULTS);
    }
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(merged, JSON.parse(raw));
    } catch (_) { /* ignore */ }
    return merged;
  }

  function saveAndApply(patch, opts) {
    let s;
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
    catch (_) { s = {}; }
    Object.assign(s, patch);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
    if (window.CWDragonCinematic && window.CWDragonCinematic.refreshLabSettings) {
      window.CWDragonCinematic.refreshLabSettings(opts || {});
    }
  }

  /* Bind slider → settings key. Formatter — для отображения значения. */
  function bindRange(id, key, formatter) {
    const el = document.getElementById(id);
    if (!el) return;
    const out = document.getElementById(id + '-val');
    const s = loadSettings();
    el.value = String(s[key]);
    if (out) out.textContent = formatter ? formatter(s[key]) : s[key];
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      saveAndApply({ [key]: v });
      if (out) out.textContent = formatter ? formatter(v) : v;
    });
  }

  /* Bind checkbox → boolean settings key */
  function bindCheckbox(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    const s = loadSettings();
    el.checked = !!s[key];
    el.addEventListener('change', () => saveAndApply({ [key]: el.checked }));
  }

  /* Bone-dropdown — заполняется через CWDragonCinematic.getBoneNames()
   * после загрузки модели. Polling каждые 1500 ms пока bones не появятся. */
  function bindBoneSelect() {
    const sel = document.getElementById('dp-bone');
    if (!sel) return;
    let populated = false;
    function populate() {
      if (!window.CWDragonCinematic || !window.CWDragonCinematic.getBoneNames) return;
      const bones = window.CWDragonCinematic.getBoneNames();
      if (!bones.length) return;
      if (populated) return;
      populated = true;
      const s = loadSettings();
      sel.innerHTML = '<option value="">— model root (rest pose) —</option>';
      bones.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      });
      if (s.mouthBone) sel.value = s.mouthBone;
    }
    populate();
    const id = setInterval(() => {
      populate();
      if (populated) clearInterval(id);
    }, 1500);
    sel.addEventListener('change', () => {
      const sourceId = window.CWDragonCinematic && window.CWDragonCinematic.getActiveModelSourceId
        ? window.CWDragonCinematic.getActiveModelSourceId()
        : null;
      saveAndApply({
        mouthBone: sel.value || null,
        modelSourceId: sourceId       // важно: stamp current source чтобы пройти validation
      }, { bone: true });
    });
  }

  // Существующая печать Тёмного Братства на свитке (.wax-seal) = триггер
  // генерации. Делегирование на document — печать пересоздаётся при rerender.
  function bindWaxSealGenerate() {
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      const seal = t.closest('.wax-seal');
      if (!seal) return;
      const real = document.getElementById('btn-generate');
      if (real) real.click();   // → проходит через burn-интерсептор
    });
    // Делаем печать кликабельной + подсказка (делегированно метить нельзя —
    // ставим класс на body, CSS включает pointer-events/cursor для .wax-seal)
    document.body.classList.add('wax-seal-interactive');
  }

  function init() {
    bindWaxSealGenerate();
    // Position
    bindRange('dp-anchor-x', 'anchorX', v => v.toFixed(1) + '%');
    bindRange('dp-anchor-y', 'anchorY', v => v.toFixed(1) + '%');
    bindRange('dp-scale',    'dragonScale', v => v.toFixed(2));
    bindRange('dp-pedestal-scale', 'pedestalScale', v => v.toFixed(2));
    bindRange('dp-light', 'lightIntensity', v => v.toFixed(2));
    bindRange('dp-platform-light', 'platformLight', v => v.toFixed(2));
    bindRange('dp-rune-offset', 'runeBeltOffset', v => v.toFixed(2));
    bindRange('dp-offset-x', 'dragonOffsetX', v => v.toFixed(2));
    bindRange('dp-offset-y', 'dragonOffsetY', v => v.toFixed(2));
    bindRange('dp-offset-z', 'dragonOffsetZ', v => v.toFixed(2));
    bindCheckbox('dp-follow-scroll', 'followScroll');
    bindCheckbox('dp-show-pedestal', 'showPedestal');
    bindCheckbox('dp-burn-on-generate', 'burnOnGenerate');
    // Rotation
    bindRange('dp-yaw',   'dragonYaw',   v => v + '°');
    bindRange('dp-pitch', 'dragonPitch', v => v + '°');
    bindRange('dp-roll',  'dragonRoll',  v => v + '°');
    bindCheckbox('dp-track-cursor', 'trackCursor');
    // Fire
    bindRange('dp-mouth-x', 'fireX', v => v.toFixed(2));
    bindRange('dp-mouth-y', 'fireY', v => v.toFixed(2));
    bindRange('dp-mouth-z', 'fireZ', v => v.toFixed(2));
    bindRange('dp-fire-yaw',   'fireYaw',   v => v + '°');
    bindRange('dp-fire-pitch', 'firePitch', v => v + '°');
    bindRange('dp-fire-intensity', 'fireIntensity', v => v.toFixed(2));
    // Animation window
    bindRange('dp-fw-start', 'fireWindowStart', v => v.toFixed(2) + 's');
    bindRange('dp-fw-end',   'fireWindowEnd',   v => v.toFixed(2) + 's');
    // Bone (отдельно — нужен polling)
    bindBoneSelect();
    // Reset button
    const resetBtn = document.getElementById('dp-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      try { localStorage.removeItem(KEY); } catch (_) {}
      alert('Настройки сброшены к значениям по умолчанию. F5 для применения.');
    });
    // Export для бейка — показывает полный JSON текущих настроек (defaults+baked+localStorage)
    const exportBtn = document.getElementById('dp-export');
    if (exportBtn) exportBtn.addEventListener('click', () => {
      const s = loadSettings();
      const out = document.getElementById('dp-export-out');
      const json = JSON.stringify(s, null, 2);
      if (out) {
        out.style.display = 'block';
        out.value = json;                         // для textarea — именно .value, не textContent
        out.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        try { out.focus(); out.select(); } catch (_) {}
      }
      // Копируем в буфер обмена
      let copied = false;
      try {
        if (navigator.clipboard) { navigator.clipboard.writeText(json); copied = true; }
      } catch (_) { /* ignore */ }
      // Фолбэк-копирование, если Clipboard API недоступен
      if (!copied && out) { try { document.execCommand('copy'); } catch (_) {} }
      // Подсказка на кнопке
      const old = exportBtn.textContent;
      exportBtn.textContent = '✓ Скопировано в буфер';
      window.setTimeout(() => { exportBtn.textContent = old; }, 1600);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
