// Prepara cada abecedario a partir del banco. Sin DOM: se usa en el navegador y en Node (tools/test.js).
(function (root) {
  'use strict';

  const LETTERS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');

  // Mayúsculas sin tildes ni signos; la Ñ se conserva.
  function norm(s) {
    return String(s).toUpperCase().replace(/Ñ/g, '\u0001').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\u0001/g, 'Ñ').replace(/[^A-ZÑ]/g, '');
  }

  // Devuelve {A: [{l, t, a, alts, d}], ...}
  function parseBank(text) {
    const bank = {};
    LETTERS.forEach(l => { bank[l] = []; });
    for (const line of text.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      const [l, t, ans, d] = s.split('|');
      const alts = ans.split('/').map(x => x.trim());
      bank[l].push({ l, t, a: alts[0], alts: alts.map(norm), d: d.trim() });
    }
    return bank;
  }

  // mulberry32
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Una definición por letra, sin repetir respuesta en el mismo abecedario.
  // avoid: respuestas salidas hace poco; se evitan mientras quede otra opción.
  function make(bank, seed, avoid) {
    const rand = rng(seed * 2654435761 + 17);
    const used = new Set(), out = [];
    for (const l of LETTERS) {
      const free = bank[l].filter(e => !used.has(e.alts[0]));
      const fresh = avoid ? free.filter(e => !avoid.has(e.alts[0])) : free;
      const pool = fresh.length ? fresh : free;
      const e = pool[Math.floor(rand() * pool.length)];
      used.add(e.alts[0]);
      out.push({ l: e.l, t: e.t, a: e.a, alts: e.alts, d: e.d });
    }
    return out;
  }

  // ¿La respuesta escrita vale? Sin tener en cuenta tildes, mayúsculas ni espacios.
  function check(item, text) {
    const n = norm(text);
    return !!n && item.alts.includes(n);
  }

  const api = { LETTERS, norm, parseBank, rng, make, check };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ABGen = api;
})(this);
