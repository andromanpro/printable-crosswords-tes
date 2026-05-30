/*
 * Canvas fire + board-reveal for the Skyrim scroll regeneration.
 *
 * ОДНА карта прожига (burnTime) управляет всем, и рисуется на ОДНОМ canvas
 * поверх свитка (z-26). НИКАКОЙ DOM-маски на .scroll-paper — раньше маска через
 * toDataURL() каждый кадр была дорогой, мерцала и (как родитель сетки) могла
 * скрыть кроссворд целиком в первый же кадр.
 *
 * Теперь canvas сам и есть эффект:
 *   bt > p                  → ПРОЗРАЧНО: бумага и сетка видны (ещё не сгорели);
 *   p-EMBER < bt <= p       → огненная кромка (бело-жёлтая → оранжевая);
 *   bt <= p-EMBER           → НЕПРОЗРАЧНАЯ коричневая ДОСКА (подложка под бумагой)
 *                             с тонкой обугленной кромкой сразу за огнём.
 *
 * Сетка остаётся в DOM с opacity:1 и просто ЗАКРЫВАЕТСЯ доской по мере движения
 * кромки — то есть «исчезает» строго по той же карте, что и огонь. Под сгоревшим
 * — коричневая доска, а не чёрное пятно и не пергамент.
 *
 * window.CWScrollFire.start(hostEl, {duration, cols, rows}) → returns stop().
 */
(function () {
  'use strict';

  function fractalNoise(W, H) {
    const out = new Float32Array(W * H);
    const layers = [[6, 0.5], [12, 0.3], [24, 0.2]];
    let total = 0;
    for (const [, w] of layers) total += w;
    for (const [g, w] of layers) {
      const gw = g + 2;
      const rnd = new Float32Array(gw * gw);
      for (let i = 0; i < gw * gw; i++) rnd[i] = Math.random();
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const fx = (x / W) * g;
          const fy = (y / H) * g;
          const x0 = fx | 0;
          const y0 = fy | 0;
          const tx = fx - x0;
          const ty = fy - y0;
          const sx = tx * tx * (3 - 2 * tx);
          const sy = ty * ty * (3 - 2 * ty);
          const a = rnd[y0 * gw + x0];
          const b = rnd[y0 * gw + x0 + 1];
          const c = rnd[(y0 + 1) * gw + x0];
          const d = rnd[(y0 + 1) * gw + x0 + 1];
          const top = a + (b - a) * sx;
          const bot = c + (d - c) * sx;
          out[y * W + x] += (top + (bot - top) * sy) * w;
        }
      }
    }
    for (let i = 0; i < out.length; i++) out[i] /= total;
    return out;
  }

  function clamp255(v) { return v < 0 ? 0 : (v > 255 ? 255 : v) | 0; }

  function start(host, opts) {
    opts = opts || {};
    const W = opts.cols || 200;
    const H = opts.rows || 150;
    const duration = opts.duration || 1550;
    const EMBER = 0.075;   // ширина раскалённой кромки (в единицах burnTime)

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.className = 'scroll-fire-canvas';
    host.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const data = img.data;

    const noise = fractalNoise(W, H);

    // Карта времени прожига: 0 у краёв (горит первым) → ~1 в центре (последним).
    // Низ-лево чуть раньше (там дыхание дракона), фрактальный шум делает фронт рваным.
    const burnTime = new Float32Array(W * H);
    // Статичный цвет ДОСКИ (не зависит от p) — считаем один раз: тёплое дерево
    // с волокном (noise) и продольными «досками» (швы темнее).
    const boardR = new Uint8ClampedArray(W * H);
    const boardG = new Uint8ClampedArray(W * H);
    const boardB = new Uint8ClampedArray(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const nx = x / (W - 1);
        const ny = y / (H - 1);
        const edge = Math.min(nx, 1 - nx, ny, 1 - ny) * 2;
        const corner = nx * 0.5 + (1 - ny) * 0.5;
        const t = edge * 0.6 + corner * 0.16 + noise[i] * 0.5 - 0.1;
        burnTime[i] = t < 0 ? 0 : (t > 1 ? 1 : t);

        const grain = (noise[i] - 0.5) * 42;                 // волокно дерева ±21
        const seam = Math.abs(((ny * 4) % 1) - 0.5) > 0.45 ? 0.68 : 1; // 4 доски, швы темнее
        boardR[i] = clamp255((100 + grain) * seam);
        boardG[i] = clamp255((66 + grain * 0.72) * seam);
        boardB[i] = clamp255((40 + grain * 0.45) * seam);
      }
    }

    let raf = 0;
    let alive = true;
    const startTs = performance.now();

    function frame(now) {
      if (!alive) return;
      const p = ((now - startTs) / duration) * 1.08;

      // Само-стоп: если прожиг прошёл финал, а stop() не позвали (ошибка в
      // хореографии или внешний вызов API) — сами гасим rAF и снимаем canvas.
      if (p >= 1.12) {
        alive = false;
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        return;
      }

      // Точки фронта для эмиссии частиц (угли/искры/пепел/дым) — собираем во
      // время прохода по пикселям, шлём в CWScrollFX после кадра (экранные коорд.).
      const fx = window.CWScrollFX;
      const emit = (fx && p > 0.02 && p < 1.0) ? [] : null;
      const rect = emit ? canvas.getBoundingClientRect() : null;
      const EMIT_CAP = 10;

      for (let i = 0; i < W * H; i++) {
        const bt = burnTime[i];
        const o = i * 4;

        if (bt > p) {
          // Бумага цела → прозрачно, видны бумага и сетка.
          data[o + 3] = 0;
          continue;
        }

        if (bt > p - EMBER) {
          // Огненная кромка: k=0 (бело-жёлтый) у фронта → k=1 (оранжевый) к тылу.
          const k = (p - bt) / EMBER;
          data[o] = 255;
          data[o + 1] = (245 - k * 165) | 0;   // 245 → 80
          data[o + 2] = (190 - k * 175) | 0;   // 190 → 15
          data[o + 3] = 255;
          // редкая выборка точек фронта → частицы
          if (emit && emit.length < EMIT_CAP && Math.random() < 0.004) emit.push(i);
          continue;
        }

        // Прогорело → коричневая ДОСКА. Сразу за огнём — тонкая обугленная кромка
        // (char) и тёплый отблеск (stain), быстро переходящие в чистое дерево.
        const age = (p - EMBER) - bt;
        const char = age < 0.06 ? (1 - age / 0.06) : 0;      // тёмный нагар у фронта
        const stain = age < 0.13 ? (1 - age / 0.13) : 0;     // тёплый отсвет
        let r = boardR[i], g = boardG[i], b = boardB[i];
        r = r * (1 - char) + 24 * char;
        g = g * (1 - char) + 13 * char;
        b = b * (1 - char) + 8 * char;
        r += stain * 40;
        g += stain * 15;
        data[o] = clamp255(r);
        data[o + 1] = clamp255(g);
        data[o + 2] = clamp255(b);
        data[o + 3] = 255;                                   // НЕПРОЗРАЧНО — закрывает сетку
      }

      ctx.putImageData(img, 0, 0);

      // Эмиссия частиц в собранных точках фронта (перевод canvas-пикселя → экран).
      if (emit && rect && rect.width) {
        for (let e = 0; e < emit.length; e++) {
          const idx = emit[e];
          const sx = rect.left + ((idx % W) / W) * rect.width;
          const sy = rect.top + (((idx / W) | 0) / H) * rect.height;
          fx.emitAt(sx, sy, 1);
        }
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return function stop() {
      alive = false;
      cancelAnimationFrame(raf);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }

  window.CWScrollFire = { start };
})();
