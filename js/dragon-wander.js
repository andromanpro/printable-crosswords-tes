/* Dragon wander — random target lerp, 100% own code from Claude.ai designer.
   Активируется когда `.dragon-flight` есть в DOM и body.dragon-flight включён. */
/* ── Дракон блуждает по случайным точкам экрана ──
   Подход (свой код, без копирования стороннего):
     • выбираем случайную точку в пределах безопасной зоны
     • плавно интерполируем текущую позицию к ней (lerp ~0.6%/кадр)
     • когда подошли близко — ставим новую цель + случайную паузу
     • направление движения управляет лёгким наклоном корпуса
     • если цель слева → отзеркаливаем дракона (scaleX -1) */
(function dragonWander() {
  const dragon = document.querySelector('.dragon-flight');
  if (!dragon) return;

  // Позиция: проценты от viewport. x — по центру, y — в верхней трети
  let x = 50, y = 25;
  let tx = 50, ty = 25;
  let prevX = x;
  let facing = 1;          // 1 = вправо, -1 = влево (зеркало)
  let pauseUntil = 0;

  function pickTarget() {
    // Случайная точка в пределах сцены: x 6-94%, y 5-50% (в основном небо)
    tx = 6 + Math.random() * 88;
    ty = 5 + Math.random() * 45;
    // Не слишком близко к текущей (минимум 25% расстояния)
    const dx = tx - x, dy = ty - y;
    const dist = Math.hypot(dx, dy);
    if (dist < 25) { return pickTarget(); }
    // Поворачиваем фейс если цель сильно слева/справа
    if (tx < x - 4) facing = -1;
    else if (tx > x + 4) facing = 1;
  }

  pickTarget();

  function frame(t) {
    if (t > pauseUntil) {
      const dx = tx - x, dy = ty - y;
      const dist = Math.hypot(dx, dy);
      // Близко — задержка 1.5–4с, затем новая цель
      if (dist < 1.5) {
        pauseUntil = t + 1500 + Math.random() * 2500;
        pickTarget();
      } else {
        // Lerp: чем дальше цель, тем чуть быстрее (от 0.4% до 0.9% за кадр)
        const k = 0.004 + Math.min(0.005, dist * 0.00015);
        prevX = x;
        x += dx * k;
        y += dy * k;
      }
    }
    // Наклон корпуса: по вертикальному вектору движения (поднимается → нос вверх)
    const dy = ty - y;
    const tilt = Math.max(-7, Math.min(7, dy * -0.25));
    dragon.style.transform =
      `translate(${x}vw, ${y}vh) translate(-50%, -50%)` +
      ` rotate(${tilt}deg) scaleX(${facing})`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
