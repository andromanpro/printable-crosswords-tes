// Загрузка и нормализация корпуса слов.
// Обрабатывает CW.WORDS (определён в data/words.js): нормализует Ё→Е,
// валидирует длину, строит фильтры по теме и сложности.

(function () {
  'use strict';

  const RU_YO_UPPER = /Ё/g;
  const RU_YO_LOWER = /ё/g;

  function normalizeWord(s) {
    if (typeof s !== 'string') return '';
    return s
      .toUpperCase()
      .replace(RU_YO_UPPER, 'Е')
      .replace(/[^А-Я]/g, '');
  }

  function normalizeClue(s) {
    if (typeof s !== 'string') return '';
    let t = s.trim();
    if (!t) return '';
    if (!/[.!?…]$/.test(t)) t += '.';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function normalize(raw) {
    const out = [];
    const seenIds = new Set();
    const seenWords = new Set();
    let warnings = 0;
    let dupWords = 0;

    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const word = normalizeWord(item.word);
      if (!word || word.length < 2) {
        warnings++; continue;
      }
      const id = item.id || ('auto_' + word.toLowerCase());
      if (seenIds.has(id)) {
        warnings++;
        continue;
      }
      // Дедупликация по слову — иначе одно и то же слово из base + pack
      // могло бы оказаться в пуле дважды и сломать алгоритм размещения.
      if (seenWords.has(word)) {
        dupWords++;
        continue;
      }
      seenIds.add(id);
      seenWords.add(word);

      // Поддержка массивов формулировок: clues[] / expertClues[].
      // Из массива при размещении (place) случайно выбирается одна формулировка
      // и фиксируется в puzzle. Так можно держать 2-3 разных хитрых
      // формулировки на одно слово — при повторе пользователь увидит другую.
      const cluesArr = Array.isArray(item.clues)
        ? item.clues.map(normalizeClue).filter(s => s && s.length > 0)
        : null;
      const expertCluesArr = Array.isArray(item.expertClues)
        ? item.expertClues.map(normalizeClue).filter(s => s && s.length > 0)
        : null;

      out.push({
        id,
        word,
        clue: normalizeClue(item.clue || ''),
        clues: (cluesArr && cluesArr.length > 0) ? cluesArr : null,
        shortClue: item.shortClue ? normalizeClue(item.shortClue) : null,
        expertClue: item.expertClue ? normalizeClue(item.expertClue) : null,
        expertClues: (expertCluesArr && expertCluesArr.length > 0) ? expertCluesArr : null,
        expertShortClue: item.expertShortClue ? normalizeClue(item.expertShortClue) : null,
        theme: item.theme || 'general',
        difficulty: typeof item.difficulty === 'number' ? item.difficulty : 1,
        len: word.length,
        tags: Array.isArray(item.tags) ? item.tags.slice() : []
      });
    }

    if (warnings > 0 && typeof console !== 'undefined') {
      console.warn('CW.DataLoader: пропущено записей с проблемами: ' + warnings);
    }
    if (dupWords > 0 && typeof console !== 'undefined') {
      console.warn('CW.DataLoader: дубликаты слов: ' + dupWords);
    }
    return out;
  }

  // Возвращает pool слов под параметры генерации.
  // theme: '70_30' | '100_sport' | '50_50' — определяет долю спорт/общее.
  // maxDifficulty: 1..3 — максимальная сложность.
  // sizeLimit: максимальная длина слова (для конкретной сетки).
  function buildPool(words, opts) {
    const maxDiff = opts.maxDifficulty || 3;
    const sizeLimit = opts.sizeLimit || 99;
    const theme = opts.theme || '70_30';
    const isMixed = (maxDiff === 'mixed' || maxDiff === 4 || opts.balanceDifficulty);

    const ok = words.filter(w =>
      (isMixed || w.difficulty <= maxDiff) &&
      w.len >= 3 &&
      w.len <= sizeLimit
    );

    const wl = ok.filter(w => w.theme === 'weightlifting');
    const sp = ok.filter(w => w.theme === 'sport');
    const gn = ok.filter(w => w.theme === 'general');

    if (theme === '100_sport') {
      return wl.concat(sp);
    }
    if (theme === '50_50') {
      return wl.concat(sp).concat(gn);
    }
    // 70_30: спорт+тяжёлая атлетика приоритетны, но general включён для геометрии
    return wl.concat(sp).concat(gn);
  }

  // Сортирует pool с учётом приоритета и истории.
  // seenIds: Set<string> — id уже показанных слов (понижают приоритет).
  // Возвращает новый массив, не мутирует.
  function prioritize(pool, seenIds) {
    const seen = seenIds || new Set();
    const fresh = pool.filter(w => !seen.has(w.id));
    const stale = pool.filter(w => seen.has(w.id));
    if (fresh.length >= 50) return fresh;
    return fresh.concat(stale);
  }

  // ---- Поддержка тематических паков ----
  // Базовый корпус живёт в CW.BASE_WORDS_RAW (data/words.js).
  // Каждый пак файла регистрирует себя в CW.PACKS[id] = { id, name, description, words: [...] }.
  // Активные паки берутся из localStorage (по умолчанию — все).

  const PACKS_KEY = 'cw_packs_enabled_v1';
  const KNOWN_KEY = 'cw_packs_known_v1';

  function getEnabledPackIds() {
    try {
      const raw = localStorage.getItem(PACKS_KEY);
      if (raw === null) return null;  // null = все паки включены (default)
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function setEnabledPackIds(ids) {
    try {
      localStorage.setItem(PACKS_KEY, JSON.stringify(ids));
    } catch (e) { /* ignore */ }
  }

  function getKnownPackIds() {
    try {
      const raw = localStorage.getItem(KNOWN_KEY);
      if (raw === null) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function setKnownPackIds(ids) {
    try {
      localStorage.setItem(KNOWN_KEY, JSON.stringify(ids));
    } catch (e) { /* ignore */ }
  }

  function isPackEnabled(packId) {
    const enabled = getEnabledPackIds();
    if (enabled === null) return true;  // дефолт — все включены
    return enabled.includes(packId);
  }

  function listPacks() {
    return Object.values(CW.PACKS || {});
  }

  // ---- Пользовательские паки (загруженные через UI) ----
  // Хранятся в localStorage в виде {id, source} — source это исходник IIFE
  // который при eval'е регистрирует себя в CW.PACKS.
  const USER_PACKS_KEY = 'cw_user_packs_v1';

  function getUserPacks() {
    try {
      const raw = localStorage.getItem(USER_PACKS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function saveUserPacks(arr) {
    try {
      localStorage.setItem(USER_PACKS_KEY, JSON.stringify(arr));
      return true;
    } catch (e) { return false; }
  }

  // Загружает все user-паки из localStorage и регистрирует их в CW.PACKS.
  // Вызывается на старте, до assembleWords.
  function loadStoredUserPacks() {
    const stored = getUserPacks();
    for (const item of stored) {
      try {
        // eval source. Source — это IIFE который вызывает CW.PACKS[id] = {...}.
        // new Function вместо eval — изолирует от текущей лексической среды.
        (new Function(item.source))();
        // Помечаем зарегистрированный пак как user-pack для UI
        if (CW.PACKS && CW.PACKS[item.id]) {
          CW.PACKS[item.id].isUser = true;
        }
      } catch (e) {
        if (typeof console !== 'undefined') {
          console.warn('CW.DataLoader: ошибка загрузки user-пака ' + item.id + ': ' + e.message);
        }
      }
    }
  }

  // Регистрирует новый user-пак из исходника. Возвращает {ok, packId, error}.
  // Источник — содержимое .js файла (IIFE с регистрацией CW.PACKS[id]).
  function registerUserPack(source) {
    if (typeof source !== 'string' || source.trim().length === 0) {
      return { ok: false, error: 'Пустой файл.' };
    }
    if (source.length > 500000) {
      return { ok: false, error: 'Файл слишком большой (>500 КБ).' };
    }
    // Запоминаем какие паки были до eval — чтобы понять какой добавился.
    const before = new Set(Object.keys(CW.PACKS || {}));
    try {
      (new Function(source))();
    } catch (e) {
      return { ok: false, error: 'Ошибка выполнения: ' + e.message };
    }
    const after = Object.keys(CW.PACKS || {});
    const newIds = after.filter(id => !before.has(id));
    if (newIds.length === 0) {
      return { ok: false, error: 'Файл не зарегистрировал ни одного пакета. Проверьте формат — должна быть IIFE, регистрирующая CW.PACKS[id].' };
    }
    // Берём первый зарегистрированный новый пак
    const packId = newIds[0];
    const pack = CW.PACKS[packId];
    if (!pack || !Array.isArray(pack.words) || pack.words.length === 0) {
      delete CW.PACKS[packId];
      return { ok: false, error: 'Пакет не содержит слов.' };
    }
    pack.isUser = true;
    // Сохраняем в localStorage
    const stored = getUserPacks();
    // Если уже был такой id — заменяем
    const filtered = stored.filter(item => item.id !== packId);
    filtered.push({ id: packId, source: source });
    if (!saveUserPacks(filtered)) {
      delete CW.PACKS[packId];
      return { ok: false, error: 'Не удалось сохранить в localStorage (превышена квота).' };
    }
    // Помечаем как known + auto-enable
    const known = getKnownPackIds();
    if (!known.includes(packId)) setKnownPackIds(known.concat([packId]));
    const enabled = getEnabledPackIds();
    if (enabled !== null && !enabled.includes(packId)) {
      setEnabledPackIds(enabled.concat([packId]));
    }
    assembleWords();
    return { ok: true, packId, packName: pack.name };
  }

  function removeUserPack(packId) {
    const stored = getUserPacks();
    const filtered = stored.filter(item => item.id !== packId);
    if (filtered.length === stored.length) return false;
    saveUserPacks(filtered);
    if (CW.PACKS) delete CW.PACKS[packId];
    // Также удаляем из known/enabled
    const known = getKnownPackIds().filter(id => id !== packId);
    setKnownPackIds(known);
    const enabled = getEnabledPackIds();
    if (enabled !== null) {
      setEnabledPackIds(enabled.filter(id => id !== packId));
    }
    assembleWords();
    return true;
  }

  // Авто-подхват новых паков: если пак никогда не встречался раньше
  // (нет в KNOWN_KEY), его автоматически добавляем в enabled. Это
  // отличает «новый пак, ещё не виденный» от «пак, который пользователь
  // явно отключил» — последний остаётся в KNOWN, но не в ENABLED.
  function autoAdoptNewPacks() {
    const known = getKnownPackIds();
    const allIds = listPacks().map(p => p.id);
    const newPacks = allIds.filter(id => !known.includes(id));
    if (newPacks.length === 0) return;

    // Помечаем все паки как известные
    setKnownPackIds(allIds);

    // Если у пользователя был задан явный enabled-список, добавляем туда новые
    const stored = getEnabledPackIds();
    if (stored !== null) {
      setEnabledPackIds(stored.concat(newPacks));
    }
    // Если stored === null (дефолт «все включены») — новые паки автоматически в этом наборе
  }

  // Собирает CW.WORDS из CW.BASE_WORDS_RAW + слов из активных паков.
  function assembleWords() {
    autoAdoptNewPacks();
    const base = CW.BASE_WORDS_RAW || [];
    let combined = base.slice();
    for (const pack of listPacks()) {
      if (isPackEnabled(pack.id)) {
        combined = combined.concat(pack.words || []);
      }
    }
    CW.WORDS = normalize(combined);
    return CW.WORDS;
  }

  // ---- Public API ----
  window.CW = window.CW || {};
  CW.DataLoader = {
    normalize,
    buildPool,
    prioritize,
    listPacks,
    isPackEnabled,
    getEnabledPackIds,
    setEnabledPackIds,
    assembleWords,
    registerUserPack,
    removeUserPack,
    init() {
      // Подгружаем сохранённые user-паки до сборки CW.WORDS.
      loadStoredUserPacks();
      // Совместимость: если CW.WORDS уже задан напрямую (старая версия),
      // используем как есть; иначе собираем из базы + паков.
      if (Array.isArray(CW.BASE_WORDS_RAW)) {
        return assembleWords();
      }
      CW.WORDS = normalize(CW.WORDS || []);
      return CW.WORDS;
    }
  };

  // Auto-init при загрузке скрипта.
  CW.DataLoader.init();
})();
