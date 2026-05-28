// Модель сетки кроссворда.
// Cell: { ch (буква), isBlock, num, acrossId, downId }
// Grid содержит cells[row][col] и список placements.

(function () {
  'use strict';

  const ACROSS = 'A';
  const DOWN = 'D';

  function createGrid(size) {
    const cells = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) {
        row.push({
          ch: null,
          isBlock: false,
          num: 0,
          acrossId: null,
          downId: null
        });
      }
      cells.push(row);
    }
    return {
      size,
      cells,
      placements: []
    };
  }

  function inBounds(grid, r, c) {
    return r >= 0 && r < grid.size && c >= 0 && c < grid.size;
  }

  // Проверяет, можно ли положить слово начиная с (row, col) в направлении dir.
  // Возвращает {ok: bool, intersections: number, reason?: string}
  function canPlace(grid, word, row, col, dir) {
    const len = word.length;
    const dr = dir === DOWN ? 1 : 0;
    const dc = dir === ACROSS ? 1 : 0;

    // Проверка размещения целиком в сетке
    const endR = row + dr * (len - 1);
    const endC = col + dc * (len - 1);
    if (!inBounds(grid, row, col) || !inBounds(grid, endR, endC)) {
      return { ok: false, reason: 'out-of-bounds' };
    }

    // Клетка перед началом и после конца должна быть пустой/вне сетки
    const beforeR = row - dr;
    const beforeC = col - dc;
    if (inBounds(grid, beforeR, beforeC) && grid.cells[beforeR][beforeC].ch !== null) {
      return { ok: false, reason: 'before-not-empty' };
    }
    const afterR = endR + dr;
    const afterC = endC + dc;
    if (inBounds(grid, afterR, afterC) && grid.cells[afterR][afterC].ch !== null) {
      return { ok: false, reason: 'after-not-empty' };
    }

    let intersections = 0;
    for (let i = 0; i < len; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const cell = grid.cells[r][c];
      if (cell.ch !== null) {
        if (cell.ch !== word[i]) {
          return { ok: false, reason: 'letter-conflict' };
        }
        intersections++;
      } else {
        // Перпендикулярные соседи должны быть пусты,
        // иначе создастся непреднамеренное паразитное слово
        const perpDr = dir === ACROSS ? 1 : 0;
        const perpDc = dir === ACROSS ? 0 : 1;
        const n1r = r + perpDr, n1c = c + perpDc;
        const n2r = r - perpDr, n2c = c - perpDc;
        if (inBounds(grid, n1r, n1c) && grid.cells[n1r][n1c].ch !== null) {
          return { ok: false, reason: 'glue-side-1' };
        }
        if (inBounds(grid, n2r, n2c) && grid.cells[n2r][n2c].ch !== null) {
          return { ok: false, reason: 'glue-side-2' };
        }
      }
    }

    return { ok: true, intersections };
  }

  // Выбор случайной формулировки из массива. Используется при place(),
  // чтобы при наличии нескольких clues/expertClues каждое размещение
  // фиксировало конкретный вариант. Подсказка не меняется при перерендере
  // и переключении стиля — она зафиксирована в placement.
  function pickFromArray(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function place(grid, wordEntry, row, col, dir) {
    const word = wordEntry.word;
    const len = word.length;
    const dr = dir === DOWN ? 1 : 0;
    const dc = dir === ACROSS ? 1 : 0;
    for (let i = 0; i < len; i++) {
      grid.cells[row + dr * i][col + dc * i].ch = word[i];
    }

    // Если задан массив clues/expertClues — выбираем случайно; иначе берём одиночное поле.
    const chosenClue = (wordEntry.clues && wordEntry.clues.length > 0)
      ? pickFromArray(wordEntry.clues)
      : wordEntry.clue;
    const chosenExpert = (wordEntry.expertClues && wordEntry.expertClues.length > 0)
      ? pickFromArray(wordEntry.expertClues)
      : (wordEntry.expertClue || null);

    grid.placements.push({
      wordId: wordEntry.id,
      word,
      clue: chosenClue,
      shortClue: wordEntry.shortClue || null,
      expertClue: chosenExpert,
      expertShortClue: wordEntry.expertShortClue || null,
      row,
      col,
      dir,
      len
    });
  }

  // Найти все возможные пересечения слова с уже размещёнными буквами.
  // Возвращает массив { row, col, dir, intersections }, отсортированный по убыванию score.
  function findCandidates(grid, word, scoreFn) {
    const len = word.length;
    const candidates = [];
    const seen = new Set();

    for (const p of grid.placements) {
      const pDr = p.dir === DOWN ? 1 : 0;
      const pDc = p.dir === ACROSS ? 1 : 0;
      const newDir = p.dir === ACROSS ? DOWN : ACROSS;

      for (let j = 0; j < p.len; j++) {
        const cellCh = p.word[j];
        for (let i = 0; i < len; i++) {
          if (word[i] !== cellCh) continue;
          const interR = p.row + pDr * j;
          const interC = p.col + pDc * j;
          let nr, nc;
          if (newDir === DOWN) {
            nr = interR - i;
            nc = interC;
          } else {
            nr = interR;
            nc = interC - i;
          }
          const key = nr + ',' + nc + ',' + newDir;
          if (seen.has(key)) continue;
          seen.add(key);

          const check = canPlace(grid, word, nr, nc, newDir);
          if (!check.ok) continue;
          const cand = { row: nr, col: nc, dir: newDir, intersections: check.intersections };
          cand.score = scoreFn ? scoreFn(grid, cand) : check.intersections;
          candidates.push(cand);
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }

  // Финализация: пустые клетки → блоки, нумерация, привязка acrossId/downId.
  function finalize(grid) {
    const size = grid.size;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid.cells[r][c].ch === null) {
          grid.cells[r][c].isBlock = true;
        }
      }
    }

    // Индекс placement-а по координатам начала
    const startIdx = new Map();
    for (let i = 0; i < grid.placements.length; i++) {
      const p = grid.placements[i];
      startIdx.set(p.row + ',' + p.col + ',' + p.dir, i);
    }

    let nextNum = 1;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = grid.cells[r][c];
        if (cell.isBlock) continue;

        const leftBlocked  = (c === 0) || grid.cells[r][c - 1].isBlock;
        const rightHasLetter = (c + 1 < size) && !grid.cells[r][c + 1].isBlock;
        const startsAcross = leftBlocked && rightHasLetter;

        const upBlocked   = (r === 0) || grid.cells[r - 1][c].isBlock;
        const downHasLetter = (r + 1 < size) && !grid.cells[r + 1][c].isBlock;
        const startsDown = upBlocked && downHasLetter;

        if (startsAcross || startsDown) {
          cell.num = nextNum;
          if (startsAcross) {
            const idx = startIdx.get(r + ',' + c + ',' + ACROSS);
            if (idx !== undefined) {
              grid.placements[idx].num = nextNum;
              cell.acrossId = grid.placements[idx].wordId;
            }
          }
          if (startsDown) {
            const idx = startIdx.get(r + ',' + c + ',' + DOWN);
            if (idx !== undefined) {
              grid.placements[idx].num = nextNum;
              cell.downId = grid.placements[idx].wordId;
            }
          }
          nextNum++;
        }
      }
    }
    return grid;
  }

  // Детектор паразитных слов: каждый сегмент длины ≥ 2 в строке/колонке
  // должен совпадать с placement-ом. Возвращает массив проблем (пуст если ок).
  function detectParasites(grid) {
    const size = grid.size;
    const problems = [];

    function scanSegments(getCh, dir, segCallback) {
      for (let outer = 0; outer < size; outer++) {
        let start = -1, segChars = [];
        for (let inner = 0; inner <= size; inner++) {
          const ch = inner < size ? getCh(outer, inner) : null;
          if (ch) {
            if (start < 0) start = inner;
            segChars.push(ch);
          } else {
            if (segChars.length >= 2) segCallback(outer, start, segChars.join(''));
            start = -1;
            segChars = [];
          }
        }
      }
    }

    const placedAcross = new Set();
    const placedDown = new Set();
    for (const p of grid.placements) {
      const key = p.row + ',' + p.col + ',' + p.word;
      if (p.dir === ACROSS) placedAcross.add(key);
      else placedDown.add(key);
    }

    scanSegments(
      (r, c) => grid.cells[r][c].isBlock ? null : grid.cells[r][c].ch,
      ACROSS,
      (r, startC, segWord) => {
        const key = r + ',' + startC + ',' + segWord;
        if (!placedAcross.has(key)) {
          problems.push({ dir: ACROSS, row: r, col: startC, word: segWord });
        }
      }
    );
    scanSegments(
      (r, c) => grid.cells[c][r].isBlock ? null : grid.cells[c][r].ch,
      DOWN,
      (c, startR, segWord) => {
        const key = startR + ',' + c + ',' + segWord;
        if (!placedDown.has(key)) {
          problems.push({ dir: DOWN, row: startR, col: c, word: segWord });
        }
      }
    );

    return problems;
  }

  // Метрики качества сетки
  function metrics(grid) {
    const size = grid.size;
    let filled = 0;
    let totalIntersections = 0;
    const intersectionMark = [];
    for (let r = 0; r < size; r++) {
      intersectionMark.push(new Array(size).fill(0));
    }
    for (const p of grid.placements) {
      const dr = p.dir === DOWN ? 1 : 0;
      const dc = p.dir === ACROSS ? 1 : 0;
      for (let i = 0; i < p.len; i++) {
        intersectionMark[p.row + dr * i][p.col + dc * i]++;
      }
    }
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (intersectionMark[r][c] >= 1) filled++;
        if (intersectionMark[r][c] >= 2) totalIntersections++;
      }
    }
    return {
      placed: grid.placements.length,
      filled,
      total: size * size,
      density: filled / (size * size),
      intersections: totalIntersections
    };
  }

  window.CW = window.CW || {};
  CW.Grid = {
    ACROSS, DOWN,
    create: createGrid,
    canPlace, place, findCandidates, finalize,
    detectParasites, metrics
  };
})();
