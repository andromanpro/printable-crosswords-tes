// История показанных слов через localStorage.
// Цель — не повторять вопросы при последовательных генерациях.

(function () {
  'use strict';

  const KEY = 'cw_history_v1';
  const MAX_ENTRIES = 200;

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
    if (data.shown.length > MAX_ENTRIES) {
      data.shown = data.shown.slice(-MAX_ENTRIES);
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

  window.CW = window.CW || {};
  CW.History = { get, seenIds, add, reset, count, isPersistent, MAX_ENTRIES };
})();
