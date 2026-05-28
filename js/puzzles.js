// История сгенерированных кроссвордов в localStorage.
// Каждая запись хранит полное состояние сетки, чтобы её можно было
// открыть позже и посмотреть ответы.

(function () {
  'use strict';

  const KEY = 'cw_puzzles_v1';
  const MAX = 50;

  let memFallback = null;
  let storageOk = true;

  function read() {
    if (!storageOk) return memFallback || { puzzles: [] };
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { puzzles: [] };
      const p = JSON.parse(raw);
      if (!p || !Array.isArray(p.puzzles)) return { puzzles: [] };
      return p;
    } catch (e) {
      storageOk = false;
      memFallback = memFallback || { puzzles: [] };
      return memFallback;
    }
  }

  function write(data) {
    if (!storageOk) { memFallback = data; return; }
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      // Превышение квоты — урезаем до 70%
      if (data.puzzles.length > 1) {
        data.puzzles = data.puzzles.slice(-Math.max(1, Math.floor(data.puzzles.length * 0.7)));
        try { localStorage.setItem(KEY, JSON.stringify(data)); }
        catch (e2) { storageOk = false; memFallback = data; }
      } else {
        storageOk = false;
        memFallback = data;
      }
    }
  }

  function save(grid, opts, title, serial) {
    const data = read();
    const id = 'p_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const entry = {
      id,
      serial: serial,
      size: opts.size,
      difficulty: opts.difficulty,
      theme: opts.theme,
      title,
      createdAt: Date.now(),
      grid: {
        size: grid.size,
        cells: grid.cells,
        placements: grid.placements
      },
      userInput: {} // карта "row,col" → буква, обновляется через updateUserInput
    };
    data.puzzles.push(entry);
    if (data.puzzles.length > MAX) {
      data.puzzles = data.puzzles.slice(-MAX);
    }
    write(data);
    return id;
  }

  function list() {
    // newest first
    return read().puzzles.slice().reverse();
  }

  function get(id) {
    return read().puzzles.find(p => p.id === id);
  }

  function remove(id) {
    const data = read();
    data.puzzles = data.puzzles.filter(p => p.id !== id);
    write(data);
  }

  function clear() {
    write({ puzzles: [] });
  }

  // Обновляет карту userInput для конкретного puzzle. Вызывается с debounce
  // из app.js при каждом нажатии буквы пользователем.
  function updateUserInput(id, map) {
    const data = read();
    const entry = data.puzzles.find(p => p.id === id);
    if (!entry) return;
    entry.userInput = map || {};
    write(data);
  }

  function count() {
    return read().puzzles.length;
  }

  function isPersistent() {
    return storageOk;
  }

  window.CW = window.CW || {};
  CW.Puzzles = { save, list, get, remove, clear, count, isPersistent, updateUserInput, MAX };
})();
