// История показанных слов через localStorage.
// Цель — не повторять вопросы при последовательных генерациях.

(function () {
  'use strict';

  const KEY = 'cw_history_v1';
  const LIMIT_KEY = 'cw_history_limit';
  const DEFAULT_LIMIT = 200;

  // Глубина истории без повторов — настраиваемая (localStorage), дефолт 200.
  function getLimit() {
    try {
      const v = parseInt(localStorage.getItem(LIMIT_KEY), 10);
      if (v && v >= 20 && v <= 5000) return v;
    } catch (e) { /* ignore */ }
    return DEFAULT_LIMIT;
  }

  let memoryFallback = null;
  let storageOk = true;

  function readRaw() {
    if (!storageOk) return memoryFallback;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { shown: [] };
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.shown)) return { shown: [] };
      return parsed;
    } catch (e) {
      storageOk = false;
      memoryFallback = memoryFallback || { shown: [] };
      return memoryFallback;
    }
  }

  function writeRaw(data) {
    if (!storageOk) {
      memoryFallback = data;
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      storageOk = false;
      memoryFallback = data;
    }
  }

  function get() {
    return readRaw();
  }

  function seenIds() {
    const data = readRaw();
    return new Set(data.shown.map(e => e.id));
  }

  function add(ids) {
    if (!ids || ids.length === 0) return;
    const data = readRaw();
    const existing = new Set(data.shown.map(e => e.id));
    const now = Date.now();
    for (const id of ids) {
      if (existing.has(id)) {
        // Сдвигаем «свежесть» — пересохраняем в конец
        const idx = data.shown.findIndex(e => e.id === id);
        if (idx >= 0) data.shown.splice(idx, 1);
      }
      data.shown.push({ id, at: now });
      existing.add(id);
    }
    const limit = getLimit();
    if (data.shown.length > limit) {
      data.shown = data.shown.slice(-limit);
    }
    writeRaw(data);
  }

  function reset() {
    if (storageOk) {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    }
    memoryFallback = { shown: [] };
  }

  function count() {
    return readRaw().shown.length;
  }

  function isPersistent() {
    return storageOk;
  }

  function setLimit(n) {
    n = parseInt(n, 10);
    if (!n || n < 20) n = 20;
    if (n > 5000) n = 5000;
    try { localStorage.setItem(LIMIT_KEY, String(n)); } catch (e) { /* ignore */ }
    // Подрезаем текущую историю под новый лимит.
    const data = readRaw();
    if (data.shown.length > n) { data.shown = data.shown.slice(-n); writeRaw(data); }
    return n;
  }

  window.CW = window.CW || {};
  CW.History = { get, seenIds, add, reset, count, isPersistent, getLimit, setLimit, DEFAULT_LIMIT };
})();
