/* Частицы горения свитка — угли, искры, пепел, дым.
 *
 * Адаптировано из FXEngine (Claude Design «Древние свитки»), переписано на
 * ванильный offline-модуль без React. Один полноэкранный canvas (fixed,
 * pointer-events:none) поверх сцены. Эмиссия управляется ИЗВНЕ — burn (огонь
 * свитка, dragon-scroll-fire.js) каждый кадр зовёт CWScrollFX.emitAt(x,y) в
 * экранных координатах фронта огня.
 *
 * rAF-петля сама засыпает когда частиц не осталось (экономия CPU) и
 * просыпается на следующем emitAt — поэтому пепел/дым доживают и после того,
 * как canvas огня уже снят.
 *
 * window.CWScrollFX = { emitAt(x, y, intensity), ensure() }
 */
(function () {
  'use strict';

  let canvas = null, ctx = null, dpr = 1, w = 0, h = 0;
  let parts = [];
  let raf = 0, running = false, lastTs = 0;
  const MAX_PARTS = 900;   // жёсткий потолок — на ultrawide/высоком DPR не копим частицы

  function resize() {
    if (!canvas) return;
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ensure() {
    if (canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);   // ограничиваем площадь clearRect на ultrawide
    canvas = document.createElement('canvas');
    canvas.className = 'scroll-fx-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
      'position:fixed;inset:0;z-index:60;pointer-events:none;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }

  // Заспавнить смесь частиц в экранной точке (x,y). intensity масштабирует кол-во.
  function emitAt(x, y, intensity) {
    ensure();
    if (parts.length >= MAX_PARTS) { kick(); return; }   // потолок частиц
    const n = Math.max(1, Math.round((intensity || 1) * 4));
    for (let i = 0; i < n; i++) {
      if (parts.length >= MAX_PARTS) break;
      const r = Math.random();
      if (r < 0.28) {                // короткий язык пламени у кромки
        parts.push({ t: 'flame', x: x + rnd(-4, 4), y: y + rnd(-5, 4),
          vx: rnd(-18, 18), vy: rnd(-46, -8), life: rnd(.16, .38), age: 0,
          size: rnd(8, 18), rot: rnd(-0.25, 0.25), vr: rnd(-0.45, 0.45),
          hue: rnd(20, 38), flick: rnd(0, 6.28) });
      } else if (r < 0.56) {         // уголёк (летит вверх, тлеет)
        parts.push({ t: 'ember', x: x + rnd(-3, 3), y: y + rnd(-4, 5),
          vx: rnd(-16, 16), vy: rnd(-85, -28), life: rnd(.6, 1.5), age: 0,
          size: rnd(.8, 2.6), hue: rnd(18, 42), flick: rnd(0, 6.28) });
      } else if (r < 0.72) {         // яркая искра (быстрая, гаснет)
        parts.push({ t: 'spark', x, y, vx: rnd(-55, 55), vy: rnd(-150, -65),
          life: rnd(.25, .6), age: 0, size: rnd(.6, 1.4) });
      } else if (r < 0.90) {         // хлопок пепла (планирует вниз)
        parts.push({ t: 'ash', x, y, vx: rnd(-20, 20), vy: rnd(8, 38),
          life: rnd(2, 4.2), age: 0, size: rnd(1.6, 4.2), rot: rnd(0, 6.28),
          vr: rnd(-3, 3), g: rnd(.6, .85) });
      } else {                       // дым (поднимается, растёт)
        parts.push({ t: 'smoke', x, y: y - 6, vx: rnd(-9, 9), vy: rnd(-24, -10),
          life: rnd(1.6, 3), age: 0, size: rnd(12, 26), grow: rnd(18, 38),
          alpha: rnd(.08, .18) });
      }
    }
    kick();
  }

  function kick() {
    if (running) return;
    running = true;
    lastTs = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function loop(now) {
    const dt = Math.min((now - lastTs) / 1000, .05);
    lastTs = now;
    ctx.clearRect(0, 0, w, h);

    // дым + пепел — обычное смешивание
    ctx.globalCompositeOperation = 'source-over';
    for (const p of parts) {
      p.age += dt;
      const k = p.age / p.life;
      if (p.t === 'smoke') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy *= 0.992; p.size += p.grow * dt;
        const a = p.alpha * Math.sin(Math.min(k, 1) * Math.PI);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        g.addColorStop(0, 'rgba(40,36,32,' + a + ')');
        g.addColorStop(1, 'rgba(20,18,16,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.2832); ctx.fill();
      } else if (p.t === 'ash') {
        p.vy += 28 * p.g * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        const a = (1 - k) * 0.9;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = 'rgba(' + (30 + k * 20 | 0) + ',' + (28 + k * 18 | 0) + ',' + (26 + k * 16 | 0) + ',' + a + ')';
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
        ctx.restore();
      }
    }
    // угли + искры — аддитивное смешивание (светятся)
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      const k = p.age / p.life;
      if (p.t === 'flame') {
        p.vy -= 18 * dt; p.vx *= 0.98; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        const a = Math.sin(Math.min(k, 1) * Math.PI) * 0.72;
        const w0 = p.size * (0.56 + k * 0.10);
        const h0 = p.size * (0.82 + k * 0.24);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot + Math.sin(now / 120 + p.flick) * 0.035);
        const g = ctx.createRadialGradient(0, h0 * 0.08, 0, 0, 0, h0);
        g.addColorStop(0.00, 'rgba(255,248,215,' + a + ')');
        g.addColorStop(0.18, 'rgba(255,210,78,' + (a * 0.86) + ')');
        g.addColorStop(0.48, 'rgba(255,96,20,' + (a * 0.56) + ')');
        g.addColorStop(1.00, 'rgba(90,18,4,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, w0, h0, 0, 0, 6.2832);
        ctx.fill();
        ctx.restore();
      } else if (p.t === 'ember') {
        p.vy += 10 * dt; p.vx += Math.sin(now / 200 + p.flick) * 8 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const a = (1 - k);
        const fl = 0.6 + 0.4 * Math.sin(now / 60 + p.flick);
        ctx.fillStyle = 'hsla(' + p.hue + ',100%,' + (58 + fl * 8) + '%,' + a + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - k * .4) + 0.3, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'hsla(' + (p.hue - 6) + ',100%,55%,' + (a * 0.25) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.6, 0, 6.2832); ctx.fill();
      } else if (p.t === 'spark') {
        p.vy += 40 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        const a = (1 - k);
        ctx.fillStyle = 'rgba(255,' + (200 + 55 * (1 - k) | 0) + ',' + (150 * (1 - k) | 0) + ',' + a + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.2832); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    parts = parts.filter(p => p.age < p.life && p.y < h + 60 && p.y > -80);
    if (parts.length) {
      raf = requestAnimationFrame(loop);
    } else {
      running = false;                 // засыпаем — частиц нет
      ctx.clearRect(0, 0, w, h);
    }
  }

  window.CWScrollFX = { emitAt: emitAt, ensure: ensure };
})();
