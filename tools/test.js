// Comprueba el banco de definiciones y la preparación de abecedarios. Uso: node tools/test.js
const fs = require('fs'), path = require('path');
global.window = {};
eval(fs.readFileSync(path.join(__dirname, '../app/assets/banco.js'), 'utf8'));
const G = require('../app/assets/gen.js');
const bank = G.parseBank(window.ABBanco);
let fails = 0;
const fail = m => { fails++; console.log('FALLO: ' + m); };

const seen = new Map();
let total = 0;
for (const l of G.LETTERS) {
  const list = bank[l];
  total += list.length;
  if (list.length < 8) fail(`${l}: solo ${list.length} definiciones`);
  for (const e of list) {
    const tag = `${l} ${e.a}`;
    if (e.t !== 'E' && e.t !== 'C') fail(`${tag}: tipo ${e.t}`);
    for (const n of e.alts) {
      if (e.t === 'E' && n[0] !== l) fail(`${tag}: no empieza por ${l}`);
      if (e.t === 'C' && !n.includes(l)) fail(`${tag}: no contiene ${l}`);
      if (e.t === 'C' && n[0] === l) fail(`${tag}: empieza por ${l}, debería ser E`);
    }
    if (!e.d || e.d.length < 6) fail(`${tag}: definición vacía`);
    // la definición no debe contener la respuesta como palabra
    const words = e.d.split(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/).map(G.norm);
    if (e.alts.some(n => words.includes(n))) fail(`${tag}: la definición contiene la respuesta`);
    const k = e.alts[0] + '/' + l;
    if (seen.has(k)) fail(`${tag}: repetida`);
    seen.set(k, 1);
  }
}
console.log(`${total} definiciones; por letra: ` + G.LETTERS.map(l => l + bank[l].length).join(' '));

for (let seed = 1; seed <= 500; seed++) {
  const r = G.make(bank, seed);
  if (r.length !== 27) fail(`semilla ${seed}: ${r.length} letras`);
  const ans = new Set(r.map(e => e.alts[0]));
  if (ans.size !== 27) fail(`semilla ${seed}: respuestas repetidas`);
  r.forEach((e, k) => { if (e.l !== G.LETTERS[k]) fail(`semilla ${seed}: orden`); });
}
// Respuestas que se aceptan
const item = bank.K.find(e => e.a === 'Kétchup');
if (!G.check(item, 'ketchup') || !G.check(item, ' Kechup ') || G.check(item, 'catsup')) fail('comprobación de respuestas');
const avoid = new Set(G.make(bank, 7).map(e => e.alts[0]));
const r2 = G.make(bank, 8, avoid);
const rep = r2.filter(e => avoid.has(e.alts[0])).length;
console.log(`Evitando el anterior se repiten ${rep} de 27`);
if (fails) { console.log(fails + ' fallos'); process.exit(1); }
console.log('Todo bien');
