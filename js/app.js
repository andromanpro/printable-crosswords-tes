// Bootstrap: связывает UI-элементы с движком генерации.

(function () {
  'use strict';

  let currentGrid = null;
  let currentPuzzleId = null;   // id записи в истории, если показываем из истории
  let currentPuzzleFromHistory = false;
  let serial = 1;
  let initialAutoGenerateTimer = null;

  function init() {
    if (!window.CW || !CW.WORDS) {
      showError('Ошибка инициализации движка.');
      return;
    }
    // Пустой корпус — допускается (например, чистая версия index-empty.html).
    // UI остаётся рабочим, пользователь сможет загрузить пак через редактор/upload.
    serial = parseInt(localStorage.getItem('cw_serial') || '1', 10) || 1;

    // Восстанавливаем сохранённую тему оформления, если есть
    try {
      const savedTheme = localStorage.getItem('cw_theme_ui_v1');
      if (savedTheme === 'dark' || savedTheme === 'light' || savedTheme === 'skyrim') {
        const r = document.querySelector('input[name="theme-ui"][value="' + savedTheme + '"]');
        if (r) r.checked = true;
      }
    } catch (e) { /* ignore */ }

    document.getElementById('btn-generate').addEventListener('click', onGenerate);
    // Skyrim cast-ring: при клике по btn-primary анимация ring pulse (только в theme-skyrim)
    document.querySelectorAll('button.btn-primary').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!document.body.classList.contains('theme-skyrim')) return;
        btn.classList.remove('is-casting');
        void btn.offsetWidth;
        btn.classList.add('is-casting');
        setTimeout(() => btn.classList.remove('is-casting'), 700);
      });
    });
    document.getElementById('btn-toggle-answers').addEventListener('click', onToggleAnswers);
    document.getElementById('btn-print').addEventListener('click', onPrint);
    document.getElementById('btn-print-grid').addEventListener('click', onPrintGridOnly);
    document.getElementById('btn-print-clues').addEventListener('click', onPrintCluesOnly);
    document.getElementById('btn-reset-history').addEventListener('click', onResetHistory);

    // Радио «Размер шрифта» — мгновенное применение
    document.querySelectorAll('input[name=fontsize]').forEach(r => {
      r.addEventListener('change', applyFontSize);
    });
    // Чекбокс «Уместить на 1 лист A4»
    document.getElementById('fit-a4').addEventListener('change', applyFitA4);
    // Чекбокс «Не печатать ответы»
    document.getElementById('hide-answers-print').addEventListener('change', applyHideAnswers);

    // Радио «Стиль подсказок» — переключение на лету без перегенерации
    document.querySelectorAll('input[name=cluestyle]').forEach(r => {
      r.addEventListener('change', onClueStyleChange);
    });

    // Радио «Тема оформления» (светлая/тёмная) — мгновенное применение
    document.querySelectorAll('input[name=theme-ui]').forEach(r => {
      r.addEventListener('change', applyThemeUi);
    });

    // Глубина истории без повторов — настраиваемая
    const histInput = document.getElementById('history-limit');
    if (histInput) {
      histInput.value = CW.History.getLimit();
      histInput.addEventListener('change', () => {
        histInput.value = CW.History.setLimit(histInput.value);
        updateStatus();
      });
    }

    // История генерации
    document.getElementById('btn-history-toggle').addEventListener('click', onHistoryToggle);
    document.getElementById('btn-history-clear').addEventListener('click', onHistoryClear);

    // Загрузка пользовательского пака из .js-файла
    document.getElementById('btn-upload-pack').addEventListener('click', () => {
      document.getElementById('input-upload-pack').click();
    });
    document.getElementById('input-upload-pack').addEventListener('change', onUploadPack);

    // Режим решения: клик по сетке (через делегирование) и глобальная клавиатура.
    document.getElementById('grid-container').addEventListener('click', onCellClick);
    document.addEventListener('keydown', onSolveKeydown);
    document.getElementById('btn-check').addEventListener('click', onCheck);
    document.getElementById('btn-clear-input').addEventListener('click', onClearInput);

    // Редактор корпусов: открыть и hook для применённых изменений.
    document.getElementById('btn-open-editor').addEventListener('click', () => {
      if (CW.Editor) CW.Editor.show();
    });
    // Когда editor применил/удалил пак — пересобрать UI основной страницы.
    window.onEditorPackUpdated = function () {
      renderPacksList();
      updateStatus();
    };

    applyFontSize();
    applyFitA4();
    applyHideAnswers();
    applyThemeUi();
    initCollapsibleGroups();
    renderPacksList();
    renderHistoryList();
    updateStatus();
    scheduleInitialAutoGenerate();
  }

  // ---- Сворачиваемая панель настроек (одна общая кнопка) ----
  // Клик по «Настройки ▶» toggle'ит весь блок .ctrl-grid.
  // По умолчанию всегда свёрнуто; раскрытие живёт только в текущей сессии страницы.
  function initCollapsibleGroups() {
    const btn = document.getElementById('btn-toggle-settings');
    const grid = document.getElementById('ctrl-grid');
    if (!btn || !grid) return;

    let expanded = false;

    const apply = () => {
      grid.classList.toggle('collapsed', !expanded);
      btn.classList.toggle('expanded', expanded);
    };
    apply();

    btn.addEventListener('click', () => {
      expanded = !expanded;
      apply();
    });
  }

  function scheduleInitialAutoGenerate() {
    window.clearTimeout(initialAutoGenerateTimer);
    initialAutoGenerateTimer = window.setTimeout(() => {
      if (currentGrid || document.body.classList.contains('mode-editor')) return;
      onGenerate();
    }, 6400);
  }

  function applyThemeUi() {
    const theme = document.querySelector('input[name="theme-ui"]:checked')?.value || 'light';
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-skyrim');
    document.body.classList.add('theme-' + theme);
    try { localStorage.setItem('cw_theme_ui_v1', theme); } catch (e) { /* ignore */ }
  }

  function onClueStyleChange() {
    if (!currentGrid) return;
    const opts = getOpts();
    rerenderClues(opts);
  }

  // Перерисовать ТОЛЬКО подсказки (список определений + ответы),
  // не трогая саму сетку и состояние ответов. Используется при смене стиля.
  function rerenderClues(opts) {
    if (!currentGrid) return;
    const style = opts.cluestyle || 'direct';
    const cluesContainer = document.getElementById('clues-container');
    CW.Renderer.renderCluesList(currentGrid, cluesContainer, { cluestyle: style });
    // Перерисовка страницы ответов
    const ansContainer = document.getElementById('answer-key');
    const wasVisible = ansContainer.classList.contains('visible');
    CW.Renderer.renderAnswerKey(currentGrid, ansContainer, { cluestyle: style });
    if (wasVisible) ansContainer.classList.add('visible');
  }

  // ---- Тематические паки ----

  function renderPacksList() {
    const container = document.getElementById('packs-list');
    const packs = CW.DataLoader.listPacks();
    container.innerHTML = '';
    if (packs.length === 0) {
      container.innerHTML = '<span class="status-muted">Паки не подключены.</span>';
      return;
    }
    for (const pack of packs) {
      const wrapper = document.createElement('label');
      wrapper.className = 'pack-item' + (pack.isUser ? ' pack-item-user' : '');
      wrapper.title = pack.description || '';

      const nameRow = document.createElement('div');
      nameRow.className = 'pack-item-name';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = CW.DataLoader.isPackEnabled(pack.id);
      cb.dataset.packId = pack.id;
      cb.addEventListener('change', onPackToggle);
      nameRow.appendChild(cb);
      const nm = document.createElement('span');
      nm.textContent = pack.name;
      nameRow.appendChild(nm);
      if (pack.isUser) {
        const badge = document.createElement('span');
        badge.className = 'pack-badge';
        badge.textContent = 'свой';
        nameRow.appendChild(badge);
      }
      const cnt = document.createElement('span');
      cnt.className = 'pack-count';
      cnt.textContent = '+' + (pack.words?.length || 0);
      nameRow.appendChild(cnt);
      if (pack.isUser) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'pack-delete';
        del.textContent = '×';
        del.title = 'Удалить пак «' + pack.name + '»';
        del.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (!confirm('Удалить пак «' + pack.name + '»?')) return;
          CW.DataLoader.removeUserPack(pack.id);
          renderPacksList();
          updateStatus();
        });
        nameRow.appendChild(del);
      }
      wrapper.appendChild(nameRow);

      if (pack.description) {
        const desc = document.createElement('div');
        desc.className = 'pack-item-desc';
        desc.textContent = pack.description;
        wrapper.appendChild(desc);
      }

      container.appendChild(wrapper);
    }
  }

  function onUploadPack(ev) {
    const file = ev.target.files && ev.target.files[0];
    const statusEl = document.getElementById('upload-pack-status');
    if (!file) return;
    if (!/\.js$/i.test(file.name)) {
      statusEl.textContent = '✗ нужен .js-файл';
      statusEl.className = 'upload-pack-status err';
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      const source = String(e.target.result || '');
      const result = CW.DataLoader.registerUserPack(source);
      if (result.ok) {
        statusEl.textContent = '✓ загружен пак «' + result.packName + '»';
        statusEl.className = 'upload-pack-status ok';
        renderPacksList();
        updateStatus();
      } else {
        statusEl.textContent = '✗ ' + result.error;
        statusEl.className = 'upload-pack-status err';
      }
      // Сбрасываем input — чтобы можно было загрузить тот же файл повторно
      ev.target.value = '';
    };
    reader.onerror = function () {
      statusEl.textContent = '✗ ошибка чтения файла';
      statusEl.className = 'upload-pack-status err';
    };
    reader.readAsText(file, 'UTF-8');
  }

  function onPackToggle(ev) {
    const packId = ev.target.dataset.packId;
    if (!packId) return;
    // Получим текущий список (или дефолт = все включены)
    let enabled = CW.DataLoader.getEnabledPackIds();
    if (enabled === null) {
      enabled = CW.DataLoader.listPacks().map(p => p.id);
    }
    if (ev.target.checked) {
      if (!enabled.includes(packId)) enabled.push(packId);
    } else {
      enabled = enabled.filter(id => id !== packId);
    }
    CW.DataLoader.setEnabledPackIds(enabled);
    CW.DataLoader.assembleWords();
    updateStatus();
  }

  function applyFontSize() {
    const size = document.querySelector('input[name=fontsize]:checked')?.value || 'medium';
    document.body.classList.remove('font-small', 'font-medium', 'font-large', 'font-xlarge');
    document.body.classList.add('font-' + size);
  }

  function applyFitA4() {
    const fit = document.getElementById('fit-a4')?.checked;
    document.body.classList.toggle('fit-a4', !!fit);
  }

  function applyHideAnswers() {
    const hide = document.getElementById('hide-answers-print')?.checked;
    document.body.classList.toggle('no-print-answers', !!hide);
  }

  // ---- История кроссвордов ----

  function renderHistoryList() {
    const listEl = document.getElementById('history-list');
    const countEl = document.getElementById('history-count');
    const items = CW.Puzzles.list();
    countEl.textContent = items.length === 0
      ? 'пусто'
      : `${items.length} / ${CW.Puzzles.MAX}`;

    listEl.innerHTML = '';
    if (items.length === 0) {
      listEl.innerHTML = '<li class="history-item" style="cursor:default;color:#999;">Пока нет сохранённых кроссвордов. Сгенерируй первый — он появится здесь.</li>';
      return;
    }
    for (const p of items) {
      const li = document.createElement('li');
      li.className = 'history-item';
      if (p.id === currentPuzzleId) li.classList.add('current');
      li.dataset.puzzleId = p.id;

      const main = document.createElement('div');
      main.className = 'history-item-main';
      const t = document.createElement('div');
      t.className = 'history-item-title';
      t.textContent = p.title;
      const meta = document.createElement('div');
      meta.className = 'history-item-meta';
      const d = new Date(p.createdAt);
      const tm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      meta.textContent = `${p.size}×${p.size} · слов: ${p.grid.placements.length} · ${tm}`;
      main.appendChild(t);
      main.appendChild(meta);
      li.appendChild(main);

      const del = document.createElement('button');
      del.className = 'history-item-delete';
      del.type = 'button';
      del.textContent = 'удалить';
      del.title = 'Удалить из истории';
      del.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (!confirm('Удалить «' + p.title + '» из истории?')) return;
        CW.Puzzles.remove(p.id);
        if (currentPuzzleId === p.id) {
          currentPuzzleId = null;
          currentPuzzleFromHistory = false;
          updateBanner();
        }
        renderHistoryList();
      });
      li.appendChild(del);

      li.addEventListener('click', () => loadFromHistory(p.id));
      listEl.appendChild(li);
    }
  }

  function loadFromHistory(id) {
    const entry = CW.Puzzles.get(id);
    if (!entry) return;

    currentGrid = entry.grid;
    currentPuzzleId = id;
    currentPuzzleFromHistory = true;
    // Сброс активной клетки и применение сохранённого прогресса перед рендером,
    // чтобы userInput'ы попали в DOM на первом же renderGrid.
    solveActiveCell = null;
    solveDir = 'A';
    restoreSolveProgress();

    // Восстанавливаем состояние UI чтобы соответствовать сохранённой записи
    const titleEl = document.getElementById('puzzle-title');
    titleEl.textContent = entry.title;
    document.title = entry.title.replace(/·/g, '-');

    const opts = { size: entry.size, difficulty: entry.difficulty, theme: entry.theme };
    const style = getCurrentClueStyle();
    const gridContainer = document.getElementById('grid-container');
    CW.Renderer.renderGrid(currentGrid, gridContainer, { cluestyle: style });
    updateLiveProgress();

    const cluesContainer = document.getElementById('clues-container');
    CW.Renderer.renderCluesList(currentGrid, cluesContainer, { cluestyle: style });

    const ansContainer = document.getElementById('answer-key');
    CW.Renderer.renderAnswerKey(currentGrid, ansContainer, { cluestyle: style });
    ansContainer.classList.remove('visible');
    document.getElementById('btn-toggle-answers').textContent = 'Показать ответы';
    gridContainer.classList.remove('show-answers');

    renderHistoryList();
    updateBanner();
    document.getElementById('grid-container').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function updateBanner() {
    const banner = document.getElementById('history-banner');
    if (!currentPuzzleId || !currentPuzzleFromHistory) {
      banner.classList.remove('visible');
      banner.innerHTML = '';
      return;
    }
    const entry = CW.Puzzles.get(currentPuzzleId);
    if (!entry) {
      banner.classList.remove('visible');
      return;
    }
    const d = new Date(entry.createdAt);
    const tm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    banner.innerHTML = `Просмотр из истории — создан ${tm}. <button id="btn-banner-close" type="button">Скрыть из просмотра</button>`;
    banner.classList.add('visible');
    document.getElementById('btn-banner-close').addEventListener('click', () => {
      currentPuzzleFromHistory = false;
      updateBanner();
      renderHistoryList();
    });
  }

  function onHistoryToggle() {
    const list = document.getElementById('history-list');
    const btn = document.getElementById('btn-history-toggle');
    if (list.classList.contains('visible')) {
      list.classList.remove('visible');
      btn.textContent = 'Показать';
    } else {
      list.classList.add('visible');
      btn.textContent = 'Скрыть';
    }
  }

  function onHistoryClear() {
    if (CW.Puzzles.count() === 0) return;
    if (!confirm('Очистить всю историю кроссвордов? Это нельзя отменить.')) return;
    CW.Puzzles.clear();
    currentPuzzleId = null;
    updateBanner();
    renderHistoryList();
  }

  function getOpts() {
    const size = parseInt(document.querySelector('input[name=size]:checked').value, 10);
    const diffRaw = document.querySelector('input[name=difficulty]:checked').value;
    const difficulty = (diffRaw === 'mixed') ? 'mixed' : parseInt(diffRaw, 10);
    const theme = document.querySelector('input[name=theme]:checked').value;
    const cluestyle = document.querySelector('input[name=cluestyle]:checked')?.value || 'direct';
    return { size, difficulty, theme, cluestyle };
  }

  function getCurrentClueStyle() {
    return document.querySelector('input[name=cluestyle]:checked')?.value || 'direct';
  }

  function buildPool(opts) {
    return CW.DataLoader.buildPool(CW.WORDS, {
      maxDifficulty: opts.difficulty,
      sizeLimit: opts.size,
      theme: opts.theme
    });
  }

  function isMixedMode(opts) {
    return opts.difficulty === 'mixed';
  }

  function onGenerate() {
    const opts = getOpts();
    const rawPool = buildPool(opts);
    const seen = CW.History.seenIds();
    const prioritized = CW.DataLoader.prioritize(rawPool, seen);

    if (prioritized.length < 8) {
      showError('Недостаточно слов в корпусе для выбранных параметров. Попробуйте увеличить сложность или сбросить историю.');
      return;
    }

    const seed = (Date.now() & 0xfffffff) ^ Math.floor(Math.random() * 0xfffff);
    const genOpts = { seed, balanceDifficulty: isMixedMode(opts) };
    const result = CW.GeneratorClassic.generate(prioritized, opts.size, genOpts);

    if (!result.ok) {
      showError('Не удалось собрать сетку: ' + (result.reason || 'неизвестная ошибка') + '. Попробуйте ещё раз или измените параметры.');
      return;
    }

    currentGrid = result.grid;
    currentPuzzleId = null;
    currentPuzzleFromHistory = false;
    const placedIds = result.grid.placements.map(p => p.wordId);
    CW.History.add(placedIds);

    serial++;
    try { localStorage.setItem('cw_serial', String(serial)); } catch (e) { /* ignore */ }

    const titleText = makeTitle(serial - 1);
    renderResult(opts, titleText);

    // Сохраняем полное состояние сетки в истории кроссвордов
    currentPuzzleId = CW.Puzzles.save(result.grid, opts, titleText, serial - 1);
    renderHistoryList();
    updateBanner();
    updateStatus(result);
    try {
      window.dispatchEvent(new CustomEvent('cw-puzzle-generated', {
        detail: { title: titleText, size: opts.size, words: result.grid.placements.length }
      }));
    } catch (e) { /* ignore */ }
  }

  function makeTitle(num) {
    const today = formatDate(new Date());
    return `Кроссворд № ${num} · ${today}`;
  }

  function renderResult(opts, titleText) {
    const titleEl = document.getElementById('puzzle-title');
    titleEl.textContent = titleText;
    document.title = titleText.replace(/·/g, '-');

    const style = opts.cluestyle || 'direct';
    const gridContainer = document.getElementById('grid-container');
    CW.Renderer.renderGrid(currentGrid, gridContainer, { cluestyle: style });
    updateLiveProgress();

    const cluesContainer = document.getElementById('clues-container');
    CW.Renderer.renderCluesList(currentGrid, cluesContainer, { cluestyle: style });

    const ansContainer = document.getElementById('answer-key');
    CW.Renderer.renderAnswerKey(currentGrid, ansContainer, { cluestyle: style });
    ansContainer.classList.remove('visible');
    document.getElementById('btn-toggle-answers').textContent = 'Показать ответы';
    gridContainer.classList.remove('show-answers');

    // Сброс активной клетки и подсветок при новой генерации/перерендере
    solveActiveCell = null;
    solveDir = 'A';
  }

  // ===== Режим решения в браузере =====

  let solveActiveCell = null; // {row, col} или null
  let solveDir = 'A';         // 'A' = ACROSS, 'D' = DOWN

  function isSolvable(r, c) {
    if (!currentGrid) return false;
    if (r < 0 || c < 0 || r >= currentGrid.size || c >= currentGrid.size) return false;
    const cell = currentGrid.cells[r][c];
    return cell && !cell.isBlock;
  }

  function findPlacementAt(r, c, dir) {
    if (!currentGrid) return null;
    for (const p of currentGrid.placements) {
      if (p.dir !== dir) continue;
      const dr = dir === 'D' ? 1 : 0;
      const dc = dir === 'A' ? 1 : 0;
      for (let i = 0; i < p.len; i++) {
        if (p.row + dr * i === r && p.col + dc * i === c) return p;
      }
    }
    return null;
  }

  function gridContainerEl() {
    return document.getElementById('grid-container');
  }

  function getCellEl(r, c) {
    const root = gridContainerEl();
    if (!root) return null;
    // Берём только из основной сетки (не из answer-key inner grid).
    // Основная сетка — первый .grid внутри grid-container, либо обёрнутая в .scroll-paper (Skyrim-тема).
    const grid = root.querySelector(':scope > .grid, :scope > .scroll-paper > .grid');
    if (!grid) return null;
    return grid.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
  }

  function clearSolveHighlights() {
    const root = gridContainerEl();
    if (!root) return;
    root.querySelectorAll('.cell.solve-active, .cell.solve-highlight').forEach(el => {
      el.classList.remove('solve-active', 'solve-highlight');
    });
  }

  function applySolveHighlight() {
    clearSolveHighlights();
    if (!solveActiveCell || !currentGrid) return;
    const { row, col } = solveActiveCell;
    // Подсветить слово в текущем направлении (или fallback на другое если в текущем нет)
    let placement = findPlacementAt(row, col, solveDir);
    if (!placement) {
      const altDir = solveDir === 'A' ? 'D' : 'A';
      placement = findPlacementAt(row, col, altDir);
      if (placement) solveDir = altDir;
    }
    if (placement) {
      const dr = placement.dir === 'D' ? 1 : 0;
      const dc = placement.dir === 'A' ? 1 : 0;
      for (let i = 0; i < placement.len; i++) {
        const el = getCellEl(placement.row + dr * i, placement.col + dc * i);
        if (el) el.classList.add('solve-highlight');
      }
    }
    const activeEl = getCellEl(row, col);
    if (activeEl) activeEl.classList.add('solve-active');
  }

  function setActiveCell(r, c) {
    if (!isSolvable(r, c)) return;
    solveActiveCell = { row: r, col: c };
    applySolveHighlight();
  }

  function moveCursor(dr, dc) {
    if (!solveActiveCell || !currentGrid) return;
    let r = solveActiveCell.row + dr;
    let c = solveActiveCell.col + dc;
    while (r >= 0 && c >= 0 && r < currentGrid.size && c < currentGrid.size) {
      if (isSolvable(r, c)) {
        setActiveCell(r, c);
        return;
      }
      r += dr; c += dc;
    }
  }

  function setCellUserInput(r, c, letter) {
    if (!isSolvable(r, c)) return;
    if (currentGrid.cells[r][c].locked) return;   // закреплённые верные буквы не трогаем
    currentGrid.cells[r][c].userInput = letter || null;
    const el = getCellEl(r, c);
    if (el) {
      const ui = el.querySelector('.user-letter');
      if (ui) ui.textContent = letter || '';
      el.classList.remove('solve-error', 'solve-correct');
    }
    saveSolveProgress();
    updateLiveProgress();
  }

  function onCellClick(ev) {
    const cell = ev.target.closest('.cell');
    if (!cell) return;
    const root = gridContainerEl();
    if (!root || !root.contains(cell)) return;
    if (cell.classList.contains('block')) return;
    const r = parseInt(cell.dataset.row, 10);
    const c = parseInt(cell.dataset.col, 10);
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    // Повторный клик в активную клетку — переключить направление
    if (solveActiveCell && solveActiveCell.row === r && solveActiveCell.col === c) {
      solveDir = solveDir === 'A' ? 'D' : 'A';
    }
    setActiveCell(r, c);
    focusMobileInput();   // тач: открыть системную клавиатуру (на десктопе — no-op)
  }

  function onSolveKeydown(ev) {
    const tag = (ev.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || ev.target.isContentEditable) return;
    if (!solveActiveCell || !currentGrid) return;
    const key = ev.key;
    if (key === 'ArrowUp') { ev.preventDefault(); solveDir = 'D'; moveCursor(-1, 0); return; }
    if (key === 'ArrowDown') { ev.preventDefault(); solveDir = 'D'; moveCursor(1, 0); return; }
    if (key === 'ArrowLeft') { ev.preventDefault(); solveDir = 'A'; moveCursor(0, -1); return; }
    if (key === 'ArrowRight') { ev.preventDefault(); solveDir = 'A'; moveCursor(0, 1); return; }
    if (key === 'Tab' || key === ' ') {
      ev.preventDefault();
      solveDir = solveDir === 'A' ? 'D' : 'A';
      applySolveHighlight();
      return;
    }
    if (key === 'Escape') {
      ev.preventDefault();
      solveActiveCell = null;
      clearSolveHighlights();
      return;
    }
    if (key === 'Backspace') {
      ev.preventDefault();
      const { row, col } = solveActiveCell;
      const cur = currentGrid.cells[row][col].userInput;
      if (cur) {
        setCellUserInput(row, col, '');
      } else {
        const dr = solveDir === 'D' ? -1 : 0;
        const dc = solveDir === 'A' ? -1 : 0;
        moveCursor(dr, dc);
        const a = solveActiveCell;
        if (a) setCellUserInput(a.row, a.col, '');
      }
      return;
    }
    if (key === 'Delete') {
      ev.preventDefault();
      setCellUserInput(solveActiveCell.row, solveActiveCell.col, '');
      return;
    }
    // Русская буква
    if (key.length === 1) {
      const ch = key.toUpperCase().replace('Ё', 'Е');
      if (/^[А-Я]$/.test(ch)) {
        ev.preventDefault();
        const { row, col } = solveActiveCell;
        setCellUserInput(row, col, ch);
        const dr = solveDir === 'D' ? 1 : 0;
        const dc = solveDir === 'A' ? 1 : 0;
        moveCursor(dr, dc);
      }
    }
  }

  // ── Мобильный ввод: скрытый input открывает системную клавиатуру ──────
  // На тач-устройствах span-клетки не дают всплыть клавиатуре. Решение:
  // скрытый (но фокусируемый, НЕ display:none) input, который фокусируем по
  // тапу в клетку; его input/keydown маршрутизируем в ту же solve-логику.
  // Десктоп не трогаем — там по-прежнему document keydown (onSolveKeydown),
  // input не фокусируется (isTouchDevice=false), стрелки/Tab работают как были.
  function isTouchDevice() {
    return !!(window.matchMedia && window.matchMedia('(hover: none)').matches);
  }
  function getMobileInput() {
    let inp = document.getElementById('cw-mobile-input');
    if (!inp) {
      inp = document.createElement('input');
      inp.id = 'cw-mobile-input';
      inp.type = 'text';
      inp.setAttribute('inputmode', 'text');
      inp.setAttribute('autocapitalize', 'characters');
      inp.setAttribute('autocomplete', 'off');
      inp.setAttribute('autocorrect', 'off');
      inp.setAttribute('aria-hidden', 'true');
      inp.tabIndex = -1;
      // Видимо-скрыт, но фокусируемый (font-size:16px — без iOS-зума).
      inp.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:1px;' +
        'opacity:0;border:0;padding:0;margin:0;font-size:16px;z-index:-1;background:transparent;color:transparent;';
      document.body.appendChild(inp);
      inp.addEventListener('input', onMobileInput);
      inp.addEventListener('keydown', onMobileInputKeydown);
    }
    return inp;
  }
  function focusMobileInput() {
    if (!isTouchDevice()) return;
    if (!solveActiveCell) return;
    const inp = getMobileInput();
    inp.value = '';
    try { inp.focus({ preventScroll: true }); } catch (_) { inp.focus(); }
  }
  function typeLetterIntoActive(ch) {
    if (!solveActiveCell || !currentGrid) return;
    ch = ch.toUpperCase().replace('Ё', 'Е');
    if (!/^[А-Я]$/.test(ch)) return;
    const { row, col } = solveActiveCell;
    setCellUserInput(row, col, ch);
    moveCursor(solveDir === 'D' ? 1 : 0, solveDir === 'A' ? 1 : 0);
  }
  function onMobileInput(ev) {
    const v = ev.target.value || '';
    for (const ch of v) typeLetterIntoActive(ch);
    ev.target.value = '';
  }
  function onMobileInputKeydown(ev) {
    // Мягкие клавиатуры надёжно шлют keydown для Backspace.
    if (ev.key !== 'Backspace') return;
    ev.preventDefault();
    if (!solveActiveCell || !currentGrid) return;
    const { row, col } = solveActiveCell;
    if (currentGrid.cells[row][col].userInput) {
      setCellUserInput(row, col, '');
    } else {
      moveCursor(solveDir === 'D' ? -1 : 0, solveDir === 'A' ? -1 : 0);
      if (solveActiveCell) setCellUserInput(solveActiveCell.row, solveActiveCell.col, '');
    }
  }

  function onCheck() {
    if (!currentGrid) return;
    let total = 0, correct = 0;
    for (let r = 0; r < currentGrid.size; r++) {
      for (let c = 0; c < currentGrid.size; c++) {
        const cell = currentGrid.cells[r][c];
        if (cell.isBlock) continue;
        const el = getCellEl(r, c);
        if (!el) continue;
        el.classList.remove('solve-error', 'solve-correct');
        const userIn = cell.userInput;
        if (!userIn) continue;
        total++;
        const expected = (cell.ch || '').toUpperCase();
        if (userIn === expected) {
          el.classList.add('solve-correct', 'solve-locked');
          cell.locked = true;            // закрепляем верную букву — больше не сотрётся
          correct++;
        } else {
          el.classList.add('solve-error');
        }
      }
    }
    const statusEl = document.getElementById('status');
    if (statusEl) {
      const s = computeWordStats() || { solvedWords: 0, totalWords: 0 };
      if (total === 0) {
        statusEl.textContent = 'Пока ничего не вписано — заполни клетки и нажми «Проверить».';
      } else {
        const done = s.totalWords > 0 && s.solvedWords === s.totalWords;
        statusEl.textContent = `Разгадано слов: ${s.solvedWords} / ${s.totalWords} · верных букв: ${correct} из ${total}.` + (done ? ' 🎉 Кроссворд решён!' : '');
      }
    }
  }

  function onClearInput() {
    if (!currentGrid) return;
    if (!confirm('Стереть все буквы (включая закреплённые верные)?')) return;
    for (let r = 0; r < currentGrid.size; r++) {
      for (let c = 0; c < currentGrid.size; c++) {
        const cell = currentGrid.cells[r][c];
        if (cell.isBlock) continue;
        cell.userInput = null;
        cell.locked = false;            // полный сброс снимает и закрепление
        const el = getCellEl(r, c);
        if (el) {
          el.classList.remove('solve-error', 'solve-correct', 'solve-locked');
          const ui = el.querySelector('.user-letter');
          if (ui) ui.textContent = '';
        }
      }
    }
    saveSolveProgress();
    updateLiveProgress();
    const st = document.getElementById('status');
    if (st) st.textContent = '';
  }

  // Сохранение прогресса в puzzle entry с debounce, чтобы каждое нажатие
  // не лезло в localStorage.
  let saveTimer = null;
  function saveSolveProgress() {
    if (!currentPuzzleId || !currentGrid) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const map = {};
      for (let r = 0; r < currentGrid.size; r++) {
        for (let c = 0; c < currentGrid.size; c++) {
          const ui = currentGrid.cells[r][c].userInput;
          if (ui) map[r + ',' + c] = ui;
        }
      }
      if (CW.Puzzles && typeof CW.Puzzles.updateUserInput === 'function') {
        CW.Puzzles.updateUserInput(currentPuzzleId, map);
      }
      saveTimer = null;
    }, 400);
  }

  function restoreSolveProgress() {
    if (!currentPuzzleId || !currentGrid) return;
    const entry = CW.Puzzles.get(currentPuzzleId);
    if (!entry || !entry.userInput) return;
    for (const key in entry.userInput) {
      const parts = key.split(',');
      const r = parseInt(parts[0], 10);
      const c = parseInt(parts[1], 10);
      if (currentGrid.cells[r] && currentGrid.cells[r][c]) {
        currentGrid.cells[r][c].userInput = entry.userInput[key];
      }
    }
  }

  // ===== Статистика по словам =====
  function computeWordStats() {
    if (!currentGrid || !Array.isArray(currentGrid.placements)) return null;
    const G = currentGrid;
    let totalWords = 0, filledWords = 0, solvedWords = 0;
    let totalCells = 0, filledCells = 0, correctCells = 0;
    for (let r = 0; r < G.size; r++) {
      for (let c = 0; c < G.size; c++) {
        const cell = G.cells[r][c];
        if (cell.isBlock || !cell.ch) continue;
        totalCells++;
        if (cell.userInput) {
          filledCells++;
          if ((cell.userInput || '').toUpperCase() === (cell.ch || '').toUpperCase()) correctCells++;
        }
      }
    }
    for (const p of G.placements) {
      totalWords++;
      const dr = p.dir === 'D' ? 1 : 0, dc = p.dir === 'A' ? 1 : 0;
      let filled = true, solved = true;
      for (let i = 0; i < p.word.length; i++) {
        const row = G.cells[p.row + dr * i];
        const cell = row && row[p.col + dc * i];
        if (!cell) { filled = false; solved = false; break; }
        const ui = (cell.userInput || '').toUpperCase();
        if (!ui) { filled = false; solved = false; }
        else if (ui !== (cell.ch || '').toUpperCase()) solved = false;
      }
      if (filled) filledWords++;
      if (solved) solvedWords++;
    }
    return { totalWords, filledWords, solvedWords, totalCells, filledCells, correctCells };
  }

  // Живой счётчик заполненных слов — без раскрытия правильности (не спойлит ответы).
  function updateLiveProgress() {
    const el = document.getElementById('solve-progress');
    if (!el) return;
    const s = computeWordStats();
    if (!s || s.totalWords === 0) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    let t = `Заполнено слов: ${s.filledWords} / ${s.totalWords}`;
    if (s.filledWords === s.totalWords) t += ' — всё заполнено, можно проверять';
    el.textContent = t;
  }

  function onToggleAnswers() {
    const ansContainer = document.getElementById('answer-key');
    const gridContainer = document.getElementById('grid-container');
    const btn = document.getElementById('btn-toggle-answers');
    if (ansContainer.classList.contains('visible')) {
      ansContainer.classList.remove('visible');
      gridContainer.classList.remove('show-answers');
      btn.textContent = 'Показать ответы';
    } else {
      ansContainer.classList.add('visible');
      gridContainer.classList.add('show-answers');
      btn.textContent = 'Скрыть ответы';
    }
  }

  function onPrint() {
    if (!currentGrid) {
      showError('Сначала сгенерируйте кроссворд.');
      return;
    }
    window.print();
  }

  // Раздельная печать: только сетка (без блока вопросов и ответов)
  function onPrintGridOnly() {
    if (!currentGrid) { showError('Сначала сгенерируйте кроссворд.'); return; }
    runPrintWithBodyClass('print-only-grid');
  }
  // Раздельная печать: только вопросы (крупным шрифтом, без сетки)
  function onPrintCluesOnly() {
    if (!currentGrid) { showError('Сначала сгенерируйте кроссворд.'); return; }
    runPrintWithBodyClass('print-only-clues');
  }
  function runPrintWithBodyClass(cls) {
    document.body.classList.add(cls);
    const cleanup = () => {
      document.body.classList.remove(cls);
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    // Fallback — на старых браузерах afterprint может не сработать сразу
    setTimeout(cleanup, 2000);
    window.print();
  }

  function onResetHistory() {
    if (!confirm('Сбросить историю показанных вопросов? Это нельзя отменить.')) return;
    CW.History.reset();
    updateStatus();
  }

  function updateStatus(result) {
    const el = document.getElementById('status');
    const cnt = CW.History.count();
    const corpusTotal = CW.WORDS?.length || 0;
    if (corpusTotal === 0 && !result) {
      // Пустой корпус — оставляем подсказку из HTML, но обновляем при необходимости.
      // Если в HTML был задан текст с инструкцией — не затираем.
      if (!el.dataset.preserveEmpty) {
        el.textContent = 'Корпус пуст. Откройте «✎ Редактор корпусов» → «+ Новый пак», либо загрузите готовый .js-пак через «+ Загрузить свой пак».';
        el.dataset.preserveEmpty = '1';
      }
      return;
    }
    let txt = `Корпус: ${corpusTotal} слов · В истории показанных: ${cnt} / ${CW.History.getLimit()}.`;
    if (!CW.History.isPersistent()) txt += ' (История не сохраняется — localStorage недоступен.)';
    if (result && result.metrics) {
      txt = `Размещено слов: ${result.metrics.placed}. Пересечений: ${result.metrics.intersections}. ` + txt;
    }
    el.textContent = txt;
    delete el.dataset.preserveEmpty;
  }

  function showError(msg) {
    const gridContainer = document.getElementById('grid-container');
    const cluesContainer = document.getElementById('clues-container');
    const ansContainer = document.getElementById('answer-key');
    gridContainer.innerHTML = `<div class="error-msg">${msg}</div>`;
    cluesContainer.innerHTML = '';
    ansContainer.innerHTML = '';
    ansContainer.classList.remove('visible');
  }

  function formatDate(d) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
