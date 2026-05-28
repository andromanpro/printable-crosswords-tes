/* Скелетный дракон-курсор — собственная реализация (clean-room).
 * 10-сегментная цепочка: голова + шея + массивное тело (рёбра, крылья,
 * таз + 2 задние лапы) + 6 хвостовых позвонков, заостряющихся к концу.
 * Концепция «цепочка с lerp-инерцией» — общеизвестный паттерн (Verlet chain).
 */
(function () {
  'use strict';

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const svg = document.querySelector('svg.skyrim-dragon-skel');
  const stage = document.getElementById('sk-dragon-screen');
  if (!stage || !svg) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const XLINK_NS = 'http://www.w3.org/1999/xlink';

  const SEG_COUNT = 10;
  const BODY_AT = 3;
  const NECK_AT = 2;
  const SPRING = 0.11;
  const FOLLOW = 0.25;
  const SPACING_BASE = 16;     // расстояние между обычными сегментами
  const SPACING_BODY = 28;     // тело отстоит от шеи сильнее
  const SCALE_HEAD = 0.65;
  const SCALE_NECK = 0.38;
  const SCALE_BODY = 0.55;
  const SCALE_TAIL_BASE = 0.34;
  const SCALE_TAIL_TAPER = 0.04;

  // Корректное преобразование «пиксели страницы → SVG-координаты»
  // через текущую матрицу (учитывает preserveAspectRatio="xMidYMid meet").
  const svgPoint = svg.createSVGPoint ? svg.createSVGPoint() : null;
  function toStage(px, py) {
    if (!svgPoint) {
      return { x: (px / window.innerWidth) * 320 - 160, y: (py / window.innerHeight) * 320 - 160 };
    }
    svgPoint.x = px;
    svgPoint.y = py;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = svgPoint.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  let cursorPos = toStage(window.innerWidth / 2, window.innerHeight / 2);
  let phase = Math.random() * Math.PI * 2;
  let lastMove = performance.now();

  const segments = [];
  for (let i = 0; i < SEG_COUNT; i++) {
    segments.push({ x: cursorPos.x, y: cursorPos.y, node: null });
  }

  window.addEventListener('pointermove', (ev) => {
    const p = toStage(ev.clientX, ev.clientY);
    cursorPos.x = p.x;
    cursorPos.y = p.y;
    lastMove = performance.now();
  }, false);

  // Mount порядок: хвост первым через appendChild → голова последней → голова поверх стека
  function mount(useId, idx) {
    const el = document.createElementNS(SVG_NS, 'use');
    segments[idx].node = el;
    el.setAttributeNS(XLINK_NS, 'xlink:href', '#' + useId);
    stage.appendChild(el);
  }
  for (let i = SEG_COUNT - 1; i >= 1; i--) {
    if (i === 1) mount('sk-dragon-head', i);
    else if (i === NECK_AT) mount('sk-dragon-neck', i);
    else if (i === BODY_AT) mount('sk-dragon-body', i);
    else mount('sk-dragon-tail', i);
  }

  function scaleFor(i) {
    if (i === 1) return SCALE_HEAD;
    if (i === NECK_AT) return SCALE_NECK;
    if (i === BODY_AT) return SCALE_BODY;
    const tailOff = i - BODY_AT - 1;
    return Math.max(0.10, SCALE_TAIL_BASE - tailOff * SCALE_TAIL_TAPER);
  }

  function spacingFor(i) {
    if (i === BODY_AT) return SPACING_BODY;
    if (i > BODY_AT) return Math.max(8, SPACING_BASE - (i - BODY_AT) * 1.2);
    return SPACING_BASE;
  }

  function tick() {
    requestAnimationFrame(tick);

    const idleMs = performance.now() - lastMove;
    const lead = segments[0];
    // Тихое парение только после 2.5с простоя курсора, амплитуда нарастает плавно
    let orbitX = 0, orbitY = 0;
    if (idleMs > 2500) {
      const amp = Math.min(20, (idleMs - 2500) / 1500 * 20);
      orbitX = Math.cos(phase * 3.1) * amp;
      orbitY = Math.sin(phase * 2.3) * amp;
    }
    lead.x += (cursorPos.x + orbitX - lead.x) * SPRING;
    lead.y += (cursorPos.y + orbitY - lead.y) * SPRING;

    for (let i = 1; i < SEG_COUNT; i++) {
      const cur = segments[i];
      const prev = segments[i - 1];
      const angle = Math.atan2(cur.y - prev.y, cur.x - prev.x);
      const spacing = spacingFor(i);
      cur.x += (prev.x - cur.x + Math.cos(angle) * spacing) * FOLLOW;
      cur.y += (prev.y - cur.y + Math.sin(angle) * spacing) * FOLLOW;
      const s = scaleFor(i);
      if (cur.node) {
        const cx = (prev.x + cur.x) * 0.5;
        const cy = (prev.y + cur.y) * 0.5;
        const deg = (180 / Math.PI) * angle;
        cur.node.setAttributeNS(null, 'transform',
          'translate(' + cx + ' ' + cy + ') rotate(' + deg + ') scale(' + s + ')');
      }
    }

    phase += 0.0028;
  }
  tick();
})();
