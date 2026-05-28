// Редактор корпусов (CMS-режим).
//
// Позволяет:
// - Просматривать любой пак (builtin / user) в виде редактируемой таблицы.
// - Редактировать только user-паки. Builtin показываются read-only;
//   чтобы их править — кнопка «⧉ Клонировать» создаёт копию как user-pack.
// - Создавать новые паки с нуля.
// - Применять изменения (регистрировать пак в CW.PACKS, обновлять
//   localStorage user-packs, пересобирать CW.WORDS).
// - Скачивать готовый .js-файл пака.
//
// Архитектура хранения изменений:
// - User-паки целиком сериализуются в localStorage[cw_user_packs_v1] как
//   массив {id, source} (исходник IIFE). Это уже было сделано в data-loader.
//   Editor генерирует исходник из текущего DOM-состояния таблицы и переписывает
//   соответствующую запись через registerUserPack/removeUserPack.

(function () {
  'use strict';

  const THEMES = ['general', 'skyrim', 'morrowind', 'oblivion', 'daedra', 'meme', 'lore'];
  const THEME_LABELS = {
    general: 'общее',
    skyrim: 'Skyrim',
    morrowind: 'Morrowind',
    oblivion: 'Oblivion',
    daedra: 'Даэдра',
    meme: 'мемы',
    lore: 'лор'
  };
  const DIFFS = [1, 2, 3];
  const EXPERT_CLUE_COUNT = 6;
  const EXPERT_FIELDS = Array.from({ length: EXPERT_CLUE_COUNT }, (_, i) => 'exp' + (i + 1));

  // Транслитерация русского для генерации id
  const RU_TR = {
    'А':'a','Б':'b','В':'v','Г':'g','Д':'d','Е':'e','Ж':'zh','З':'z',
    'И':'i','Й':'y','К':'k','Л':'l','М':'m','Н':'n','О':'o','П':'p',
    'Р':'r','С':'s','Т':'t','У':'u','Ф':'f','Х':'h','Ц':'ts','Ч':'ch',
    'Ш':'sh','Щ':'sch','Ъ':'','Ы':'y','Ь':'','Э':'e','Ю':'yu','Я':'ya','Ё':'e'
  };
  function transliterate(word) {
    return (word || '').toUpperCase()
      .split('')
      .map(ch => RU_TR[ch] !== undefined ? RU_TR[ch] : '')
      .join('');
  }
  function makeWordId(packId, word, takenIds) {
    const prefix = (packId || 'p').replace(/[^a-z0-9_]/g, '').slice(0, 6) || 'p';
    const slug = transliterate(word).slice(0, 24);
    let base = (prefix || 'p') + '_' + slug;
    let id = base;
    let n = 2;
    while (takenIds.has(id)) { id = base + n; n++; }
    return id;
  }
  function makePackId(name) {
    const slug = transliterate(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return slug || 'pack_' + Date.now().toString(36);
  }

  // Текущее состояние редактора: каким паком сейчас правим
  let state = {
    packId: null,        // id текущего пака
    name: '',
    description: '',
    isUser: false,       // true = редактируемый user-пак, false = builtin (read-only)
    rows: []             // [{word, clue, exp1..exp6, theme, difficulty, tags, originalId}]
  };

  // ---- DOM helpers ----
  const $ = (id) => document.getElementById(id);

  // Подгоняет высоту textarea под содержимое (для браузеров без
  // field-sizing: content, например Firefox).
  const SUPPORTS_FIELD_SIZING = (typeof CSS !== 'undefined') && CSS.supports && CSS.supports('field-sizing', 'content');
  function autoResize(ta) {
    if (SUPPORTS_FIELD_SIZING) return;
    ta.style.height = 'auto';
    ta.style.height = (ta.scrollHeight + 2) + 'px';
  }

  function escapeJsString(s) {
    return String(s || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '');
  }

  function themeLabel(theme) {
    return THEME_LABELS[theme] || theme || 'общее';
  }

  function themeOptions(currentTheme) {
    if (!currentTheme || THEMES.includes(currentTheme)) return THEMES;
    return THEMES.concat([currentTheme]);
  }

  function emptyRow() {
    const row = {
      word: '',
      clue: '',
      theme: 'general',
      difficulty: 1,
      tags: '',
      originalId: null
    };
    for (const field of EXPERT_FIELDS) row[field] = '';
    return row;
  }

  // ---- Импорт пака в state ----

  function importPackFromCW(packId) {
    const pack = (CW.PACKS || {})[packId];
    if (!pack) return false;
    state.packId = pack.id;
    state.name = pack.name || '';
    state.description = pack.description || '';
    state.isUser = !!pack.isUser;
    state.rows = (pack.words || []).map(w => {
      const expertClues = Array.isArray(w.expertClues)
        ? w.expertClues
        : (w.expertClue ? [w.expertClue] : []);
      const row = {
        word: w.word || '',
        clue: w.clue || '',
        theme: w.theme || 'general',
        difficulty: w.difficulty || 1,
        tags: Array.isArray(w.tags) ? w.tags.join(',') : (w.tags || ''),
        originalId: w.id || null
      };
      EXPERT_FIELDS.forEach((field, idx) => {
        row[field] = expertClues[idx] || '';
      });
      return row;
    });
    return true;
  }

  function newEmptyPack() {
    const suffix = Date.now().toString(36).slice(-5);
    state.packId = makePackId('Новый пак') + '_' + suffix;
    state.name = 'Новый пак';
    state.description = '';
    state.isUser = true;
    state.rows = [];
  }

  function clonePack() {
    if (!state.packId) return;
    const baseName = state.name + ' (копия)';
    state.packId = makePackId(baseName) + '_' + Date.now().toString(36).slice(-4);
    state.name = baseName;
    state.isUser = true;
    // Сбросим originalId — id'ы перегенерируются при сохранении
    state.rows = state.rows.map(r => ({...r, originalId: null}));
  }

  // ---- Рендер UI ----

  function renderToolbar() {
    const select = $('editor-pack-select');
    const packs = CW.DataLoader.listPacks();
    const currentId = state.packId;
    select.innerHTML = '';
    if (state.isUser && currentId && !packs.find(p => p.id === currentId)) {
      // Текущий пак — новый, ещё не зарегистрирован. Добавим виртуальную опцию.
      const opt = document.createElement('option');
      opt.value = currentId;
      opt.textContent = '✎ ' + (state.name || currentId) + ' (новый)';
      opt.selected = true;
      select.appendChild(opt);
    }
    // User packs first
    const userPacks = packs.filter(p => p.isUser);
    const builtinPacks = packs.filter(p => !p.isUser);
    if (userPacks.length > 0) {
      const grp = document.createElement('optgroup');
      grp.label = 'Свои паки';
      for (const p of userPacks) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = '✎ ' + p.name + ' (' + (p.words?.length || 0) + ')';
        if (p.id === currentId) opt.selected = true;
        grp.appendChild(opt);
      }
      select.appendChild(grp);
    }
    if (builtinPacks.length > 0) {
      const grp = document.createElement('optgroup');
      grp.label = 'Встроенные (read-only)';
      for (const p of builtinPacks) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name + ' (' + (p.words?.length || 0) + ')';
        if (p.id === currentId) opt.selected = true;
        grp.appendChild(opt);
      }
      select.appendChild(grp);
    }
    $('editor-readonly-tag').hidden = state.isUser;
    $('btn-editor-clone').hidden = state.isUser;
    $('btn-editor-delete-pack').hidden = !state.isUser;
  }

  function renderMeta() {
    $('editor-pack-name').value = state.name;
    $('editor-pack-description').value = state.description;
    $('editor-pack-id').textContent = state.packId || '—';
    $('editor-pack-name').disabled = !state.isUser;
    $('editor-pack-description').disabled = !state.isUser;
  }

  function rowEl(row, idx) {
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;

    const tdWord = document.createElement('td');
    tdWord.className = 'col-word';
    const inWord = document.createElement('input');
    inWord.type = 'text';
    inWord.value = row.word;
    inWord.maxLength = 30;
    inWord.addEventListener('input', () => {
      row.word = inWord.value.toUpperCase().replace(/[Ё]/g, 'Е').replace(/[^А-Я]/g, '');
      inWord.value = row.word;
      tdLen.textContent = row.word.length || '—';
      validate();
    });
    tdWord.appendChild(inWord);
    tr.appendChild(tdWord);

    const tdLen = document.createElement('td');
    tdLen.className = 'col-len';
    tdLen.textContent = row.word.length || '—';
    tr.appendChild(tdLen);

    function makeTextarea(field) {
      const td = document.createElement('td');
      const ta = document.createElement('textarea');
      ta.rows = 2;
      ta.value = row[field] || '';
      ta.addEventListener('input', () => {
        row[field] = ta.value;
        autoResize(ta);
        validate();
      });
      td.appendChild(ta);
      return td;
    }
    tr.appendChild(makeTextarea('clue'));
    for (const field of EXPERT_FIELDS) {
      tr.appendChild(makeTextarea(field));
    }

    const tdTheme = document.createElement('td');
    tdTheme.className = 'col-theme';
    const selTheme = document.createElement('select');
    for (const t of themeOptions(row.theme)) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = themeLabel(t);
      if (row.theme === t) opt.selected = true;
      selTheme.appendChild(opt);
    }
    selTheme.addEventListener('change', () => { row.theme = selTheme.value; });
    tdTheme.appendChild(selTheme);
    tr.appendChild(tdTheme);

    const tdDiff = document.createElement('td');
    tdDiff.className = 'col-diff';
    const selDiff = document.createElement('select');
    for (const d of DIFFS) {
      const opt = document.createElement('option');
      opt.value = String(d);
      opt.textContent = d === 1 ? '1 (все)' : d === 2 ? '2 (фан)' : '3 (спец)';
      if (row.difficulty === d) opt.selected = true;
      selDiff.appendChild(opt);
    }
    selDiff.addEventListener('change', () => { row.difficulty = parseInt(selDiff.value, 10); });
    tdDiff.appendChild(selDiff);
    tr.appendChild(tdDiff);

    const tdAct = document.createElement('td');
    tdAct.className = 'col-actions';
    if (state.isUser) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'editor-row-delete';
      del.textContent = '×';
      del.title = 'Удалить строку';
      del.addEventListener('click', () => {
        state.rows.splice(idx, 1);
        renderTable();
      });
      tdAct.appendChild(del);
    }
    tr.appendChild(tdAct);

    return tr;
  }

  function renderTable() {
    const tbody = $('editor-tbody');
    tbody.innerHTML = '';
    state.rows.forEach((row, idx) => {
      tbody.appendChild(rowEl(row, idx));
    });
    $('btn-editor-add-row').style.display = state.isUser ? 'block' : 'none';
    $('btn-editor-apply').disabled = !state.isUser;
    $('btn-editor-download').disabled = false; // скачать можно любой
    document.querySelector('.editor-panel').classList.toggle('editor-readonly', !state.isUser);
    // Подогнать высоту всех textarea под содержимое (для браузеров без field-sizing).
    if (!SUPPORTS_FIELD_SIZING) {
      tbody.querySelectorAll('textarea').forEach(autoResize);
    }
    validate();
  }

  function validate() {
    const stats = $('editor-stats');
    const seenWords = new Set();
    const dupRows = new Set();
    let invalid = 0;
    state.rows.forEach((row, idx) => {
      const w = (row.word || '').trim();
      const c = (row.clue || '').trim();
      const tr = document.querySelector(`#editor-tbody tr[data-idx="${idx}"]`);
      if (!tr) return;
      tr.classList.remove('invalid');
      const issues = [];
      if (!w || w.length < 2) issues.push('слово ≥ 2 букв');
      if (!c) issues.push('нужна прямая подсказка');
      if (seenWords.has(w)) {
        issues.push('дубликат слова');
        dupRows.add(idx);
      } else if (w) {
        seenWords.add(w);
      }
      if (issues.length > 0) {
        tr.classList.add('invalid');
        invalid++;
        tr.title = issues.join(', ');
      } else {
        tr.title = '';
      }
    });
    const total = state.rows.length;
    const multiCount = state.rows.filter(r => EXPERT_FIELDS.some(field => r[field])).length;
    let msg = `Слов: ${total} · с хитрыми: ${multiCount}`;
    if (invalid > 0) msg += ` · <span class="err">проблем: ${invalid}</span>`;
    stats.innerHTML = msg;
    return invalid === 0;
  }

  // ---- Сериализация в JS-исходник пака ----

  function buildSource() {
    const lines = [];
    lines.push('// Сгенерировано редактором ' + new Date().toISOString().slice(0, 10));
    lines.push('// Пак: ' + state.name);
    lines.push('(function () {');
    lines.push('  "use strict";');
    lines.push('  const ID = "' + escapeJsString(state.packId) + '";');
    lines.push('  const words = [');

    const takenIds = new Set();
    for (const row of state.rows) {
      const word = (row.word || '').trim();
      const clue = (row.clue || '').trim();
      if (!word || !clue) continue;

      let id = row.originalId || makeWordId(state.packId, word, takenIds);
      if (takenIds.has(id)) id = makeWordId(state.packId, word, takenIds);
      takenIds.add(id);

      const expert = EXPERT_FIELDS.map(field => (row[field] || '').trim()).filter(Boolean);
      const tags = (row.tags || '').split(',').map(s => s.trim()).filter(Boolean);
      const len = word.length;

      const parts = [
        '    { id: "' + escapeJsString(id) + '"',
        '      word: "' + escapeJsString(word) + '"',
        '      clue: "' + escapeJsString(clue) + '"'
      ];
      if (expert.length > 0) {
        const exprStr = expert.map(e => '"' + escapeJsString(e) + '"').join(', ');
        parts.push('      expertClues: [' + exprStr + ']');
      }
      parts.push('      theme: "' + escapeJsString(row.theme || 'general') + '"');
      parts.push('      difficulty: ' + (parseInt(row.difficulty, 10) || 1));
      parts.push('      len: ' + len);
      if (tags.length > 0) {
        parts.push('      tags: [' + tags.map(t => '"' + escapeJsString(t) + '"').join(', ') + ']');
      }
      lines.push(parts.join(',\n') + ' }' + ',');
    }

    lines.push('  ];');
    lines.push('  window.CW = window.CW || {};');
    lines.push('  CW.PACKS = CW.PACKS || {};');
    lines.push('  CW.PACKS[ID] = {');
    lines.push('    id: ID,');
    lines.push('    name: "' + escapeJsString(state.name) + '",');
    lines.push('    description: "' + escapeJsString(state.description) + '",');
    lines.push('    words: words');
    lines.push('  };');
    lines.push('})();');
    lines.push('');
    return lines.join('\n');
  }

  // ---- Применить и скачать ----

  function applyChanges() {
    if (!state.isUser) {
      setStatus('Встроенный пак нельзя изменить. Клонируйте его.', 'err');
      return false;
    }
    state.name = $('editor-pack-name').value.trim() || state.name;
    state.description = $('editor-pack-description').value.trim();
    if (!state.name) {
      setStatus('Введите название пака.', 'err');
      return false;
    }
    if (state.rows.length === 0) {
      setStatus('В паке нет слов.', 'err');
      return false;
    }
    if (!validate()) {
      setStatus('Есть проблемы в строках. Исправьте подсвеченные.', 'err');
      return false;
    }
    const source = buildSource();
    // Удаляем предыдущую регистрацию того же id (если была)
    if (CW.PACKS && CW.PACKS[state.packId]) {
      CW.DataLoader.removeUserPack(state.packId);
    }
    const result = CW.DataLoader.registerUserPack(source);
    if (!result.ok) {
      setStatus('Ошибка применения: ' + result.error, 'err');
      return false;
    }
    setStatus('✓ Пак применён. Слов в пакете: ' + state.rows.length + '.', 'ok');
    // Перерисовать toolbar (могли появиться новые опции)
    renderToolbar();
    // Уведомить app о смене корпуса (если есть hook)
    if (typeof window.onEditorPackUpdated === 'function') {
      window.onEditorPackUpdated();
    }
    return true;
  }

  function downloadFile() {
    state.name = $('editor-pack-name').value.trim() || state.name;
    state.description = $('editor-pack-description').value.trim();
    const source = buildSource();
    const filename = 'pack-' + (state.packId || 'export').replace(/[^a-z0-9_-]/gi, '_') + '.js';
    const blob = new Blob([source], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    setStatus('Скачан ' + filename, 'ok');
  }

  function deletePack() {
    if (!state.isUser) return;
    if (!confirm('Удалить пак «' + state.name + '»? Это нельзя отменить.')) return;
    CW.DataLoader.removeUserPack(state.packId);
    if (typeof window.onEditorPackUpdated === 'function') window.onEditorPackUpdated();
    // Перейдём на первый доступный пак или создадим пустой
    const packs = CW.DataLoader.listPacks();
    if (packs.length > 0) {
      importPackFromCW(packs[0].id);
    } else {
      newEmptyPack();
    }
    renderAll();
  }

  function setStatus(msg, kind) {
    const el = $('editor-status');
    el.textContent = msg;
    el.className = 'editor-footer-status ' + (kind || '');
  }

  function renderAll() {
    renderToolbar();
    renderMeta();
    renderTable();
  }

  // ---- Public API ----

  function show(packId) {
    document.body.classList.add('mode-editor');
    if (packId) {
      importPackFromCW(packId);
    } else {
      // Если не задано — открыть первый пак (предпочтительно user)
      const packs = CW.DataLoader.listPacks();
      const firstUser = packs.find(p => p.isUser);
      if (firstUser) importPackFromCW(firstUser.id);
      else if (packs.length > 0) importPackFromCW(packs[0].id);
      else newEmptyPack();
    }
    renderAll();
    window.scrollTo(0, 0);
  }

  function hide() {
    document.body.classList.remove('mode-editor');
  }

  function init() {
    $('editor-pack-select').addEventListener('change', (ev) => {
      importPackFromCW(ev.target.value);
      renderAll();
    });
    $('btn-editor-back').addEventListener('click', hide);
    $('btn-editor-new').addEventListener('click', () => {
      newEmptyPack();
      renderAll();
      $('editor-pack-name').focus();
    });
    $('btn-editor-clone').addEventListener('click', () => {
      clonePack();
      renderAll();
      setStatus('Клонировано. Нажмите ✓ Применить чтобы сохранить копию.', 'ok');
    });
    $('btn-editor-add-row').addEventListener('click', () => {
      state.rows.push(emptyRow());
      renderTable();
      // Фокус в новое слово
      const lastTr = $('editor-tbody').lastElementChild;
      if (lastTr) lastTr.querySelector('input')?.focus();
    });
    $('btn-editor-apply').addEventListener('click', applyChanges);
    $('btn-editor-download').addEventListener('click', downloadFile);
    $('btn-editor-delete-pack').addEventListener('click', deletePack);
    $('editor-pack-name').addEventListener('input', () => { state.name = $('editor-pack-name').value; });
    $('editor-pack-description').addEventListener('input', () => { state.description = $('editor-pack-description').value; });
  }

  window.CW = window.CW || {};
  CW.Editor = { init, show, hide };

  // Авто-инициализация после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
