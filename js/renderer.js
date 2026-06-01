// Отрисовка сетки и списка определений в DOM.

(function () {
  'use strict';

  const ACROSS = 'A';
  const DOWN = 'D';

  // Выбор подсказки по текущему стилю.
  // style: 'direct' (default) | 'cryptic'
  // При 'cryptic' используется expertClue, если он задан; иначе fallback на обычный clue.
  function pickClue(p, style) {
    if (style === 'cryptic' && p.expertClue) return p.expertClue;
    return p.clue;
  }
  function pickShort(p, style) {
    if (style === 'cryptic') {
      return p.expertShortClue || p.expertClue || p.shortClue || p.clue;
    }
    return p.shortClue || p.clue;
  }

  // Карта кириллица → руна (детерминированная) для режима «руны-подсказки»:
  // каждая буква ответа всегда даёт одну и ту же руну (одинаковые буквы — одинаковые руны).
  const RUNE_MAP = {
    'А':'ᚠ','Б':'ᚢ','В':'ᚦ','Г':'ᚨ','Д':'ᚩ','Е':'ᚪ','Ж':'ᚫ','З':'ᚬ','И':'ᚱ','Й':'ᚲ',
    'К':'ᚳ','Л':'ᚷ','М':'ᚹ','Н':'ᚺ','О':'ᚻ','П':'ᚾ','Р':'ᛁ','С':'ᛃ','Т':'ᛇ','У':'ᛈ',
    'Ф':'ᛉ','Х':'ᛊ','Ц':'ᛋ','Ч':'ᛏ','Ш':'ᛒ','Щ':'ᛖ','Ъ':'ᛗ','Ы':'ᛚ','Ь':'ᛜ','Э':'ᛞ',
    'Ю':'ᛟ','Я':'ᛠ'
  };
  function runeFor(ch) {
    if (!ch) return '';
    return RUNE_MAP[ch.toUpperCase().replace('Ё', 'Е')] || '';
  }
  function runeHintsOn() {
    const el = document.getElementById('rune-hints');
    return !!(el && el.checked);
  }
  // Проставляет/снимает руны-подсказки во всех заполняемых клетках основной сетки.
  function applyRuneHints(root) {
    root = root || document.getElementById('grid-container');
    if (!root) return;
    const on = runeHintsOn();
    root.querySelectorAll('.cell:not(.block)').forEach(el => {
      let rh = el.querySelector('.rune-hint');
      if (on) {
        const ansEl = el.querySelector('.ans');
        const rune = runeFor(ansEl ? ansEl.textContent : '');
        if (!rune) { if (rh) rh.remove(); return; }
        if (!rh) {
          rh = document.createElement('span');
          rh.className = 'rune-hint';
          rh.setAttribute('aria-hidden', 'true');
          el.appendChild(rh);
        }
        rh.textContent = rune;
      } else if (rh) {
        rh.remove();
      }
    });
  }

  function cellSizeFor(size) {
    // Базовый размер ячейки по размеру сетки (десктоп).
    var base = size <= 11 ? 38 : (size <= 13 ? 34 : 30);
    // Адаптив: ужимаем под ширину экрана, чтобы сетка влезала на узких экранах.
    try {
      var vv = window.visualViewport;
      var vw = Math.min(window.innerWidth || 9999, (vv && vv.width) || 9999);
      var avail = vw - 22;                 // поля/рамки
      var fit = Math.floor(avail / size);
      if (fit < base) base = Math.max(15, fit);   // не меньше 15px ради читаемости
    } catch (e) { /* ignore */ }
    return base;
  }

  function renderGrid(grid, container, opts) {
    opts = opts || {};
    const size = grid.size;
    container.innerHTML = '';
    container.style.setProperty('--grid-size', size);
    container.style.setProperty('--cell-size', cellSizeFor(size) + 'px');

    const div = document.createElement('div');
    div.className = 'grid';
    div.style.setProperty('--grid-size', size);
    div.style.setProperty('--cell-size', cellSizeFor(size) + 'px');

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = grid.cells[r][c];
        const el = document.createElement('div');
        el.className = 'cell';
        el.dataset.row = r;
        el.dataset.col = c;
        if (cell.isBlock) {
          el.classList.add('block');
        } else {
          if (cell.num) {
            const n = document.createElement('span');
            n.className = 'num';
            n.textContent = cell.num;
            el.appendChild(n);
          }
          const ans = document.createElement('span');
          ans.className = 'ans';
          ans.textContent = cell.ch || '';
          el.appendChild(ans);
          // Пользовательский ввод (отдельный span, чтобы не мешать показу ответов).
          const ui = document.createElement('span');
          ui.className = 'user-letter';
          ui.textContent = cell.userInput || '';
          el.appendChild(ui);
        }
        div.appendChild(el);
      }
    }
    if (!opts.showAnswers) applyRuneHints(div);   // руны-подсказки (если включены) — только основная сетка
    container.appendChild(div);
  }

  function renderCluesList(grid, container, opts) {
    opts = opts || {};
    const style = opts.cluestyle || 'direct';
    container.innerHTML = '';
    const acrossList = [];
    const downList = [];
    for (const p of grid.placements) {
      if (p.dir === ACROSS) acrossList.push(p);
      else downList.push(p);
    }
    acrossList.sort((a, b) => (a.num || 0) - (b.num || 0));
    downList.sort((a, b) => (a.num || 0) - (b.num || 0));

    if (acrossList.length > 0) {
      const sec = document.createElement('div');
      const h = document.createElement('h3');
      h.textContent = 'По горизонтали';
      sec.appendChild(h);
      const ol = document.createElement('ol');
      for (const p of acrossList) {
        const li = document.createElement('li');
        li.value = p.num;
        const num = document.createElement('b');
        num.textContent = p.num + '.';
        li.appendChild(num);
        li.appendChild(document.createTextNode(' ' + pickClue(p, style)));
        ol.appendChild(li);
      }
      sec.appendChild(ol);
      container.appendChild(sec);
    }
    if (downList.length > 0) {
      const sec = document.createElement('div');
      const h = document.createElement('h3');
      h.textContent = 'По вертикали';
      sec.appendChild(h);
      const ol = document.createElement('ol');
      for (const p of downList) {
        const li = document.createElement('li');
        li.value = p.num;
        const num = document.createElement('b');
        num.textContent = p.num + '.';
        li.appendChild(num);
        li.appendChild(document.createTextNode(' ' + pickClue(p, style)));
        ol.appendChild(li);
      }
      sec.appendChild(ol);
      container.appendChild(sec);
    }
  }

  function renderAnswerKey(grid, container, opts) {
    opts = opts || {};
    container.innerHTML = '';
    const h = document.createElement('h3');
    h.textContent = 'Ответы';
    container.appendChild(h);
    const inner = document.createElement('div');
    inner.style.display = 'flex';
    inner.style.justifyContent = 'center';
    renderGrid(grid, inner, { showAnswers: true, cluestyle: opts.cluestyle });
    inner.classList.add('show-answers');
    inner.querySelector('.grid')?.classList.add('show-answers');
    container.appendChild(inner);
  }

  window.CW = window.CW || {};
  CW.Renderer = { renderGrid, renderCluesList, renderAnswerKey, cellSizeFor, pickClue, pickShort, applyRuneHints, runeFor };
})();
