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

  function cellSizeFor(size) {
    // Возвращает размер ячейки в px для экранного просмотра
    if (size <= 11) return 38;
    if (size <= 13) return 34;
    return 30;
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
  CW.Renderer = { renderGrid, renderCluesList, renderAnswerKey, cellSizeFor, pickClue, pickShort };
})();
