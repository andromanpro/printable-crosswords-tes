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
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function smoothstep(edge0, edge1, x) {
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  const mainBoardImage = new Image();
  mainBoardImage.decoding = 'async';
  mainBoardImage.src = 'assets/images/main-window-bg.png?v=1';

  function blendChannel(base, tint, alpha) {
    return base * (1 - alpha) + tint * alpha;
  }

  function sampleMainBoard(host, canvas, W, H) {
    if (!mainBoardImage.complete || !mainBoardImage.naturalWidth) return null;
    const main = host.closest('main');
    if (!main) return null;

    const mainRect = main.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    if (!mainRect.width || !mainRect.height || !canvasRect.width || !canvasRect.height) return null;

    const iw = mainBoardImage.naturalWidth;
    const ih = mainBoardImage.naturalHeight;
    const scale = Math.max(mainRect.width / iw, mainRect.height / ih);
    const destW = iw * scale;
    const destH = ih * scale;
    const destX = mainRect.left + (mainRect.width - destW) * 0.5;
    const destY = mainRect.top + (mainRect.height - destH) * 0.5;

    const sx = (canvasRect.left - destX) / scale;
    const sy = (canvasRect.top - destY) / scale;
    const sw = canvasRect.width / scale;
    const sh = canvasRect.height / scale;

    const board = document.createElement('canvas');
    board.width = W;
    board.height = H;
    const boardCtx = board.getContext('2d', { willReadFrequently: true });
    boardCtx.drawImage(mainBoardImage, sx, sy, sw, sh, 0, 0, W, H);

    const pixels = boardCtx.getImageData(0, 0, W, H);
    const data = pixels.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const vx = canvasRect.left + ((x + 0.5) / W) * canvasRect.width;
        const vy = canvasRect.top + ((y + 0.5) / H) * canvasRect.height;
        const ny = Math.max(0, Math.min(1, (vy - mainRect.top) / mainRect.height));

        const linearA = 0.12 + ny * 0.30;
        data[i] = clamp255(blendChannel(data[i], 8 - ny * 6, linearA));
        data[i + 1] = clamp255(blendChannel(data[i + 1], 6 - ny * 4, linearA));
        data[i + 2] = clamp255(blendChannel(data[i + 2], 4 - ny * 2, linearA));

        const dx = (vx - (mainRect.left + mainRect.width * 0.5)) / (mainRect.width * 0.36);
        const dy = (vy - mainRect.top) / (mainRect.height * 0.20);
        const radialA = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy)) * 0.14;
        data[i] = clamp255(blendChannel(data[i], 216, radialA));
        data[i + 1] = clamp255(blendChannel(data[i + 1], 177, radialA));
        data[i + 2] = clamp255(blendChannel(data[i + 2], 103, radialA));
      }
    }
    return data;
  }

  function start(host, opts) {
    opts = opts || {};
    const hostRect = host.getBoundingClientRect();
    const W = opts.cols || Math.max(240, Math.min(380, Math.round((hostRect.width || 640) * 0.56)));
    const H = opts.rows || Math.max(280, Math.min(460, Math.round((hostRect.height || 760) * 0.56)));
    const duration = opts.duration || 1550;
    const EMBER = 0.076;   // ширина раскалённой кромки (в единицах burnTime)
    const PREHEAT = 0.026; // прозрачный дымный ореол перед фронтом огня

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.className = 'scroll-fire-canvas';
    host.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const data = img.data;

    const noise = fractalNoise(W, H);
    const sampledBoard = sampleMainBoard(host, canvas, W, H);

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

        if (sampledBoard) {
          const o = i * 4;
          const grain = (noise[i] - 0.5) * 4;
          boardR[i] = clamp255(sampledBoard[o] + grain);
          boardG[i] = clamp255(sampledBoard[o + 1] + grain * 0.7);
          boardB[i] = clamp255(sampledBoard[o + 2] + grain * 0.45);
        } else {
          const grain = (noise[i] - 0.5) * 18;
          const edgeShade = 0.96 - Math.max(0, Math.abs(ny - 0.5) - 0.24) * 0.24;
          const fibre = 1 + Math.sin(nx * 38 + noise[i] * 6) * 0.018;
          const shade = edgeShade * fibre;
          boardR[i] = clamp255((58 + grain) * shade);
          boardG[i] = clamp255((40 + grain * 0.68) * shade);
          boardB[i] = clamp255((23 + grain * 0.45) * shade);
        }
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
      const EMIT_CAP = 18;

      for (let i = 0; i < W * H; i++) {
        const bt = burnTime[i];
        const o = i * 4;

        if (bt > p) {
          // Бумага цела. Прямо перед фронтом добавляем лёгкий дымно-янтарный
          // ореол, чтобы огонь не выглядел как вырезанная красная граница.
          const preheat = 1 - (bt - p) / PREHEAT;
          if (preheat > 0) {
            const flicker = 0.55 + 0.45 * Math.sin(now * 0.035 + i * 0.071 + noise[i] * 16);
            const a = clamp01(preheat) * (0.18 + 0.16 * flicker);
            data[o] = 130 + flicker * 42;
            data[o + 1] = 74 + flicker * 28;
            data[o + 2] = 32 + flicker * 12;
            data[o + 3] = clamp255(a * 255);
          } else {
            data[o + 3] = 0;
          }
          continue;
        }

        if (bt > p - EMBER) {
          // Огненная кромка без цветовых "изолиний": один тонкий рваный фронт,
          // а глубина прожига сразу уходит в обугленную подложку.
          const x = i % W;
          const y = (i / W) | 0;
          const kRaw = (p - bt) / EMBER;
          const jitter =
            (noise[i] - 0.5) * 0.34 +
            Math.sin(x * 0.17 + y * 0.071 + now * 0.031 + noise[i] * 11) * 0.055;
          const k = clamp01(kRaw + jitter);
          const flicker = 0.88 + 0.18 * Math.sin(now * 0.052 + x * 0.19 + noise[i] * 23);

          const hot = Math.pow(1 - smoothstep(0.00, 0.28, k), 1.35) * flicker;
          const emberGlow = Math.pow(1 - smoothstep(0.16, 0.58, k), 2.4) * 0.42 * flicker;
          const char = smoothstep(0.22, 0.92, k);
          const glow = clamp01(hot + emberGlow);

          const baseR = boardR[i] * (1 - char) + 22 * char;
          const baseG = boardG[i] * (1 - char) + 12 * char;
          const baseB = boardB[i] * (1 - char) + 7 * char;

          const fireR = 255;
          const fireG = 118 + hot * 126 + emberGlow * 60;
          const fireB = 18 + hot * 150;

          data[o] = clamp255(baseR * (1 - glow) + fireR * glow);
          data[o + 1] = clamp255(baseG * (1 - glow) + fireG * glow);
          data[o + 2] = clamp255(baseB * (1 - glow) + fireB * glow);
          data[o + 3] = 255;
          if (emit && emit.length < EMIT_CAP && Math.random() < 0.0075) emit.push(i);
          continue;
        }

        // Прогорело → коричневая ДОСКА. Сразу за огнём — тонкая обугленная кромка
        // (char) и тёплый отблеск (stain), быстро переходящие в чистое дерево.
        const age = (p - EMBER) - bt;
        const char = age < 0.06 ? (1 - age / 0.06) : 0;      // тёмный нагар у фронта
        const stain = age < 0.08 ? (1 - age / 0.08) : 0;     // тёплый отсвет
        let r = boardR[i], g = boardG[i], b = boardB[i];
        r = r * (1 - char) + 24 * char;
        g = g * (1 - char) + 13 * char;
        b = b * (1 - char) + 8 * char;
        r += stain * 10;
        g += stain * 4;
        b += stain * 1;
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
