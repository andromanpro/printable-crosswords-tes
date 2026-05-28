// Seedable PRNG (Mulberry32). Нужен для воспроизводимости при отладке
// и для детерминистичного перебора рестартов.

(function () {
  'use strict';

  function create(seed) {
    let s = (seed | 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleInPlace(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function pick(arr, rng) {
    return arr[Math.floor(rng() * arr.length)];
  }

  window.CW = window.CW || {};
  CW.RNG = { create, shuffleInPlace, pick };
})();
