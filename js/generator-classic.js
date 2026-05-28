// Генератор классического кроссворда: жадная вставка с rng-seed-рестартами.
// Возвращает наилучшую сетку из 30 попыток.

(function () {
  'use strict';

  const ACROSS = 'A';
  const DOWN = 'D';
  const MAX_ATTEMPTS = 30;

  function targetPlacement(size) {
    if (size <= 11) return 8;
    if (size <= 13) return 12;
    if (size <= 15) return 18;
    if (size <= 17) return 24;
    if (size <= 19) return 28;
    if (size <= 21) return 36;
    if (size <= 23) return 42;
    return 48; // 25+
  }

  function scoreFn(grid) {
    const center = (grid.size - 1) / 2;
    return function (g, cand) {
      const len = cand.len || 0;
      const half = len > 0 ? (len - 1) / 2 : 0;
      const midR = cand.row + (cand.dir === DOWN ? half : 0);
      const midC = cand.col + (cand.dir === ACROSS ? half : 0);
      const distance = Math.abs(midR - center) + Math.abs(midC - center);
      return cand.intersections * 10 - distance;
    };
  }

  // Один прогон жадного алгоритма
  function singleAttempt(pool, size, rng, balanceDifficulty) {
    const Grid = CW.Grid;
    const grid = Grid.create(size);

    // Сортируем пул по убыванию длины, внутри одной длины — shuffle с rng
    const lenBuckets = new Map();
    for (const w of pool) {
      if (!lenBuckets.has(w.len)) lenBuckets.set(w.len, []);
      lenBuckets.get(w.len).push(w);
    }
    const lengths = Array.from(lenBuckets.keys()).sort((a, b) => b - a);
    const ordered = [];
    for (const L of lengths) {
      const bucket = lenBuckets.get(L).slice();
      CW.RNG.shuffleInPlace(bucket, rng);
      if (balanceDifficulty) {
        // Чередуем сложности внутри bucket'а: d1, d2, d3, d1, d2, d3, ...
        // Это даёт простым словам шанс попасть рядом с длинными сложными.
        const byDiff = { 1: [], 2: [], 3: [] };
        for (const w of bucket) byDiff[w.difficulty || 1].push(w);
        const interleaved = [];
        while (byDiff[1].length || byDiff[2].length || byDiff[3].length) {
          for (const d of [1, 2, 3]) {
            if (byDiff[d].length) interleaved.push(byDiff[d].shift());
          }
        }
        for (const w of interleaved) ordered.push(w);
      } else {
        for (const w of bucket) ordered.push(w);
      }
    }

    // Стартовое слово — самое длинное, влезающее в сетку, кладём через центр
    const seedWord = ordered.find(w => w.len <= size);
    if (!seedWord) return { grid, placed: [], skipped: ordered.slice() };
    const startRow = Math.floor(size / 2);
    const startCol = Math.floor((size - seedWord.len) / 2);
    Grid.place(grid, seedWord, startRow, startCol, ACROSS);
    const placedIds = new Set([seedWord.id]);
    const skipped = [];

    const score = scoreFn(grid);

    for (const w of ordered) {
      if (placedIds.has(w.id)) continue;
      if (w.len > size) {
        skipped.push(w);
        continue;
      }
      const candidates = Grid.findCandidates(grid, w.word, score);
      if (candidates.length === 0) {
        skipped.push(w);
        continue;
      }
      const best = candidates[0];
      Grid.place(grid, w, best.row, best.col, best.dir);
      placedIds.add(w.id);
    }

    return { grid, placed: grid.placements.length, skipped };
  }

  function generate(pool, size, opts) {
    opts = opts || {};
    const target = opts.target || targetPlacement(size);
    const baseSeed = opts.seed || ((Date.now() & 0xfffffff) || 1);
    const balanceDiff = !!opts.balanceDifficulty;
    let best = null;
    let bestScore = -1;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const rng = CW.RNG.create(baseSeed + attempt * 7919);
      const localPool = pool.slice();
      CW.RNG.shuffleInPlace(localPool, rng);
      // Восстанавливаем сортировку по длине внутри single attempt
      const result = singleAttempt(localPool, size, rng, balanceDiff);
      if (result.placed === 0) continue;
      const m = CW.Grid.metrics(result.grid);
      // Score попытки: количество слов важнее всего, потом пересечения, потом плотность
      const sc = m.placed * 100 + m.intersections * 5 + m.density * 10;
      if (sc > bestScore) {
        bestScore = sc;
        best = result;
      }
      // Ранний выход если попадание очень хорошее
      if (m.placed >= target + 4) break;
    }

    if (!best || best.placed < Math.max(6, target - 4)) {
      return { ok: false, reason: 'недостаточная плотность сетки', best };
    }

    CW.Grid.finalize(best.grid);

    const parasites = CW.Grid.detectParasites(best.grid);
    if (parasites.length > 0) {
      return {
        ok: false,
        reason: 'обнаружены паразитные слова: ' + parasites.length,
        best,
        parasites
      };
    }

    return {
      ok: true,
      grid: best.grid,
      placed: best.placed,
      skipped: best.skipped,
      metrics: CW.Grid.metrics(best.grid)
    };
  }

  window.CW = window.CW || {};
  CW.GeneratorClassic = { generate, MAX_ATTEMPTS };
})();
