/* Dragon baked defaults — «заводские» настройки дракона для ПУБЛИКАЦИИ.
 *
 * Приоритет применения (низший → высший):
 *   1. hardcoded DEFAULTS в dragon-control-panel.js
 *   2. ЭТОТ файл (window.CW_DRAGON_DEFAULTS) — baked под публикацию
 *   3. localStorage 'cw_dragon_lab_settings_v1' — рантайм-правки пользователя
 *
 * Когда настроишь всё идеально в панели — нажми «📋 Скопировать для бейка»,
 * пришли мне JSON, и я перезапишу этот объект. После публикации (без
 * localStorage у нового пользователя) дракон возьмёт ИМЕННО эти значения.
 *
 * Значения ниже — последняя известная рабочая конфигурация (bone-attach к
 * голове NPC_Head_046, пасть в bone-local, огонь из морды).
 */
window.CW_DRAGON_DEFAULTS = {
  // — положение на странице —
  // Боковая композиция: дракон стоит слева от свитка и дышит в его сторону.
  // Не привязываем к самому scrollRect, иначе на широких экранах он уезжает
  // в центр и закрывает сетку.
  anchorX: 13, anchorY: 76.5,
  followScroll: false,
  trackCursor: true,

  // — трансформ дракона —
  dragonYaw: 23, dragonPitch: 0, dragonRoll: 0,
  dragonScale: 0.89,
  dragonOffsetX: 0.5, dragonOffsetY: 0.08, dragonOffsetZ: -0.08,

  // — платформа —
  showPedestal: true,
  pedestalScale: 1.04,
  runeBeltOffset: 0.36,

  // — адаптив размера по ширине экрана (0 = выкл, 1 = полная кривая) —
  responsiveStrength: 1,

  // — освещение —
  lightIntensity: 0.55,
  platformLight: 0,

  // — огонь (bone-local координаты пасти) —
  mouthBone: 'NPC_Head_046',
  modelSourceId: 'ancient-toplevel',
  fireX: 2.35, fireY: 1.65, fireZ: 0.6,
  fireYaw: 33, firePitch: 9,
  fireLength: 3.6, fireIntensity: 1.05,

  // — анимация / окно огня —
  fireWindowStart: 3, fireWindowEnd: 4.75,

  // — burn-эффект —
  burnOnGenerate: true
};
