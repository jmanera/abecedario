// Abecedario: una definición por letra contra el reloj. Interfaz, teclado, estadísticas y guardado.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const bank = ABGen.parseBank(window.ABBanco);
  const LETTERS = ABGen.LETTERS;
  const TIMES = [[120, '2 min'], [180, '3 min'], [240, '4 min'], [300, '5 min'], [0, 'Sin límite']];

  // ---------- Ajustes y estadísticas ----------
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
  const cfg = Object.assign({ time: 180, theme: 'claro', sound: true, kbd: true, showLen: false }, load('ab.cfg', {}));
  const stats = Object.assign({ played: 0, okTotal: 0, best: 0, full: 0, daily: { last: '', streak: 0, best: 0 } }, load('ab.stats', {}));
  let hist = load('ab.hist', []); // respuestas recientes, para no repetirlas

  // ---------- Estado de la partida ----------
  // P: {seed, daily, items:[{l,t,a,alts,d}], limit}
  // S: {phase:'ready'|'play'|'over', st:[0 pendiente|1 acierto|2 fallo], said:[], cur, left, used, typed, counted, why}
  let P = null, S = null;
  let paused = false, modalOpen = false;
  let revealing = 0; // temporizador mientras se muestra la respuesta tras un fallo

  function todayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function newGame(seed, daily) {
    if (S && S.phase === 'play' && !S.counted) finish('quit', true);
    const items = ABGen.make(bank, seed, daily ? null : new Set(hist));
    P = { seed, daily: daily || '', items, limit: cfg.time };
    S = { phase: 'ready', st: items.map(() => 0), said: items.map(() => ''), cur: 0, left: P.limit, used: 0, typed: '', counted: false, why: '' };
    if (!daily) {
      hist = hist.concat(items.map(e => e.alts[0])).slice(-300);
      save('ab.hist', hist);
    }
    stopReveal();
    paused = false; $('pauseCover').classList.remove('show');
    persist(); render();
  }

  function begin() {
    if (S.phase !== 'ready') return;
    S.phase = 'play';
    beep(660, 0.08);
    persist(); render();
  }

  let saveTimer = 0;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save('ab.game', { v: 1, P, S }), 200);
  }

  // ---------- Jugar ----------
  const pending = () => S.st.filter(v => !v).length;

  // Siguiente letra sin contestar, dando la vuelta si hace falta
  function advance() {
    for (let k = 1; k <= LETTERS.length; k++) {
      const i = (S.cur + k) % LETTERS.length;
      if (!S.st[i]) { S.cur = i; return true; }
    }
    return false;
  }

  function answer() {
    if (S.phase !== 'play' || paused || revealing) return;
    const text = S.typed.trim();
    if (!ABGen.norm(text)) { pass(); return; }
    const item = P.items[S.cur];
    S.said[S.cur] = text;
    S.typed = '';
    if (ABGen.check(item, text)) {
      S.st[S.cur] = 1;
      beep(784, 0.08); beep(1047, 0.12, 0.08);
      flashLetter(S.cur);
      next();
    } else {
      S.st[S.cur] = 2;
      beep(220, 0.25);
      flashLetter(S.cur);
      // Enseña la respuesta un momento, con el reloj parado
      showReveal(item);
      persist(); render();
      revealing = setTimeout(() => { stopReveal(); next(); }, 2600);
    }
  }

  function pass() {
    if (S.phase !== 'play' || paused || revealing) return;
    S.typed = '';
    beep(440, 0.06);
    // si es la única que queda, no hay adónde pasar
    if (pending() === 1) { toast('Es la última letra que queda'); render(); return; }
    next();
  }

  function next() {
    if (!advance()) { finish('done'); return; }
    persist(); render();
  }

  function showReveal(item) {
    const r = $('reveal');
    r.className = 'show bad';
    r.innerHTML = `No es «${esc(S.said[S.cur])}». La respuesta era <b>${esc(item.a.toUpperCase())}</b>.`;
  }
  function stopReveal() {
    if (revealing) clearTimeout(revealing);
    revealing = 0;
    $('reveal').className = '';
  }

  // why: 'done' (todas contestadas), 'time' (se acabó el tiempo), 'quit' (se planta)
  function finish(why, silent) {
    stopReveal();
    S.phase = 'over';
    S.why = why;
    if (!S.counted) {
      S.counted = true;
      const ok = S.st.filter(v => v === 1).length;
      stats.played++;
      stats.okTotal += ok;
      const best = ok > stats.best;
      if (best) stats.best = ok;
      if (ok === LETTERS.length) stats.full++;
      if (P.daily) {
        const d = stats.daily, y = new Date(); y.setDate(y.getDate() - 1);
        if (d.last !== P.daily) {
          d.streak = d.last === todayKey(y) ? d.streak + 1 : 1;
          d.last = P.daily; d.best = Math.max(d.best || 0, d.streak);
        }
      }
      save('ab.stats', stats);
      S.newBest = best && stats.played > 1;
    }
    persist();
    if (silent) return;
    if (S.st.every(v => v === 1)) chime(); else beep(523, 0.15);
    render();
    setTimeout(() => { if (S.phase === 'over') resultSheet(); }, 700);
  }

  // ---------- Dibujo ----------
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ring = $('ring');
  const bubbles = LETTERS.map((l, i) => {
    const b = document.createElement('div');
    b.className = 'lt'; b.textContent = l; b.dataset.i = i;
    ring.appendChild(b);
    return b;
  });

  function layoutRing() {
    const r = $('stage').getBoundingClientRect();
    const size = Math.max(120, Math.min(r.width, r.height) - 24);
    ring.style.width = ring.style.height = size + 'px';
    const n = LETTERS.length, bub = size * Math.PI / n * 0.86, R = size / 2 - bub / 2 - 4;
    bubbles.forEach((b, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / n;
      b.style.left = (size / 2 + R * Math.cos(a)) + 'px';
      b.style.top = (size / 2 + R * Math.sin(a)) + 'px';
      b.style.width = b.style.height = bub + 'px';
      b.style.fontSize = (bub * 0.5) + 'px';
    });
    $('hub').style.fontSize = (size * 0.17) + 'px';
  }

  function flashLetter(i) {
    const b = bubbles[i];
    b.animate([{ transform: 'translate(-50%, -50%) scale(1.5)' }, { transform: 'translate(-50%, -50%) scale(1)' }], { duration: 400, easing: 'ease-out' });
  }

  const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

  function renderClock() {
    const c = $('clock');
    if (!P) return;
    if (P.limit) { c.textContent = fmt(Math.max(0, S.left)); c.classList.toggle('low', S.phase === 'play' && S.left <= 15); }
    else { c.textContent = fmt(S.used); c.classList.remove('low'); }
  }

  function render() {
    if (!P) return;
    const ok = S.st.filter(v => v === 1).length, bad = S.st.filter(v => v === 2).length;
    bubbles.forEach((b, i) => {
      b.className = 'lt' + (S.st[i] === 1 ? ' ok' : S.st[i] === 2 ? ' bad' : '') + (S.phase === 'play' && i === S.cur && !S.st[i] ? ' cur' : '');
    });
    $('sOk').textContent = ok; $('sBad').textContent = bad;
    $('score').innerHTML = `<span><i style="background:var(--ok)"></i>${ok}</span><span><i style="background:var(--bad)"></i>${bad}</span>`;
    $('hSub').textContent = (P.daily ? 'Abecedario del día · ' : '') + `nº ${P.seed} · ` + (P.limit ? fmt(P.limit) + ' min' : 'sin límite de tiempo');
    renderClock();
    const def = $('def'), rule = $('rule'), ans = $('answer'), act = $('actions');
    if (S.phase === 'ready') {
      rule.innerHTML = '<b>A</b>Preparado';
      def.className = 'start';
      def.innerHTML = `Para cada letra hay una definición. La respuesta <b>empieza por</b> esa letra o, si lo indica,
        la <b>contiene</b>. Escribe y pulsa <b>Responder</b>, o <b>Paso</b> para dejarla para la siguiente vuelta.
        ${P.limit ? `Tienes ${fmt(P.limit)} minutos; el reloj se para mientras ves la respuesta de un fallo.` : 'Esta partida no tiene límite de tiempo.'}`;
      ans.textContent = ''; ans.classList.add('off');
      act.innerHTML = '<button class="btn" id="bStart">Empezar</button>';
      $('bStart').onclick = begin;
      return;
    }
    if (S.phase === 'over') {
      const why = { done: 'Abecedario terminado', time: 'Se acabó el tiempo', quit: 'Te has plantado' }[S.why] || 'Terminado';
      rule.innerHTML = `<b>${ok}</b>${why}`;
      def.className = 'start';
      def.innerHTML = `${ok} aciertos, ${bad} fallos y ${LETTERS.length - ok - bad} sin contestar.`;
      ans.textContent = ''; ans.classList.add('off');
      act.innerHTML = '<button class="btn" id="bPass">Ver respuestas</button><button class="btn" id="bSend">Nuevo abecedario</button>';
      $('bPass').onclick = resultSheet;
      $('bSend').onclick = () => newGame(randSeed());
      return;
    }
    const item = P.items[S.cur];
    const how = item.t === 'E' ? `Empieza por la ${item.l}` : `Contiene la ${item.l}`;
    rule.innerHTML = `<b>${item.l}</b>${how}${cfg.showLen ? `<small>${item.alts[0].length} letras</small>` : ''}`;
    def.className = '';
    def.textContent = paused ? '' : item.d;
    ans.textContent = S.typed;
    ans.classList.toggle('off', !!revealing);
    if (!act.querySelector('#bPass') || act.querySelector('#bPass').textContent !== 'Paso') {
      act.innerHTML = '<button class="btn" id="bPass">Paso</button><button class="btn" id="bSend">Responder</button>';
      $('bPass').onclick = pass;
      $('bSend').onclick = answer;
    }
  }

  // ---------- Teclado ----------
  function buildKbd() {
    const rows = ['QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM'];
    const del = '<svg viewBox="0 0 24 24"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1zM12 9l6 6M18 9l-6 6"/></svg>';
    const k = $('kbd');
    k.innerHTML = rows.map((r, n) => `<div class="row">${r.split('').map(c => `<button data-k="${c}">${c}</button>`).join('')}${n === 2 ? `<button class="wide" data-k="del" aria-label="Borrar">${del}</button>` : ''}</div>`).join('');
    k.addEventListener('pointerdown', e => {
      const b = e.target.closest('button');
      if (!b) return;
      e.preventDefault();
      if (b.dataset.k === 'del') erase(); else type(b.dataset.k);
    });
  }
  function type(c) {
    if (!S || S.phase !== 'play' || paused || revealing) return;
    if (S.typed.length >= 24) return;
    S.typed += c;
    $('answer').textContent = S.typed;
  }
  function erase() {
    if (!S || S.phase !== 'play' || paused || revealing) return;
    S.typed = S.typed.slice(0, -1);
    $('answer').textContent = S.typed;
  }

  // ---------- Ventanas ----------
  function sheet(html) {
    $('sheet').innerHTML = html;
    $('modal').classList.add('show');
    $('sheet').scrollTop = 0;
    modalOpen = true;
  }
  function closeSheet() { $('modal').classList.remove('show'); modalOpen = false; }
  $('modal').addEventListener('click', e => {
    if (e.target === $('modal')) { closeSheet(); return; }
    const b = e.target.closest('[data-a]');
    if (b) action(b.dataset.a, b);
  });
  const ico = d => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;

  function menuSheet() {
    const playing = S && S.phase === 'play';
    sheet(`<h2>Menú</h2><div class="menu-list">
      <button class="btn" data-a="new">${ico('M12 5v14M5 12h14')}Nuevo abecedario</button>
      <button class="btn" data-a="daily">${ico('M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z')}Abecedario del día</button>
      <button class="btn" data-a="byNum">${ico('M4 9h16M4 15h16M10 3 8 21M16 3l-2 18')}Partida por número</button>
      ${playing ? `<button class="btn" data-a="quit">${ico('M4 22V4a1 1 0 0 1 1-1h12l-2 5 2 5H5')}Plantarse</button>` : ''}
      ${S && S.phase === 'over' ? `<button class="btn" data-a="results">${ico('M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11')}Ver respuestas</button>` : ''}
      <button class="btn" data-a="stats">${ico('M4 20V10M10 20V4M16 20v-7M22 20H2')}Estadísticas</button>
      <button class="btn" data-a="settings">${ico('M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6')}Ajustes</button>
      <button class="btn" data-a="howto">${ico('M12 17h.01M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z')}Cómo se juega</button>
    </div><div class="row-btns"><button class="btn" data-a="close">Cerrar</button></div>`);
  }

  function resultSheet() {
    const ok = S.st.filter(v => v === 1).length, bad = S.st.filter(v => v === 2).length;
    const title = ok === LETTERS.length ? '¡Abecedario completo!' : ok >= 20 ? '¡Muy bien!' : ok >= 12 ? 'Bien jugado' : 'Resultado';
    const rows = P.items.map((e, i) => {
      const cls = S.st[i] === 1 ? 'ok' : S.st[i] === 2 ? 'bad' : '';
      const said = S.st[i] === 2 ? ` <s>${esc(S.said[i])}</s>` : '';
      return `<div class="${cls}"><b>${e.l}</b><span><strong>${esc(e.a)}</strong>${said}<small>${esc(e.d)}</small></span></div>`;
    }).join('');
    sheet(`<h2>${title}</h2>
      <div class="res">
        <div><b style="color:var(--ok)">${ok}</b><small>Aciertos</small>${S.newBest ? '<em>Mejor marca</em>' : ''}</div>
        <div><b style="color:var(--bad)">${bad}</b><small>Fallos</small></div>
        <div><b>${LETTERS.length - ok - bad}</b><small>Sin contestar</small></div>
        <div><b>${fmt(P.limit ? P.limit - Math.max(0, S.left) : S.used)}</b><small>Tiempo</small></div>
      </div>
      ${P.daily ? `<p>Abecedario del día hecho. Racha: <b>${stats.daily.streak}</b> ${stats.daily.streak === 1 ? 'día' : 'días seguidos'}.</p>` : ''}
      <h3>Respuestas</h3><div class="list">${rows}</div>
      <div class="row-btns"><button class="btn" data-a="close">Cerrar</button><button class="btn primary" data-a="go">Nuevo abecedario</button></div>`);
  }

  function statsSheet() {
    const avg = stats.played ? (stats.okTotal / stats.played).toFixed(1).replace('.', ',') : '—';
    sheet(`<h2>Estadísticas</h2>
      <div class="res">
        <div><b>${stats.played}</b><small>Jugados</small></div>
        <div><b>${stats.best}</b><small>Mejor marca</small></div>
        <div><b>${avg}</b><small>Aciertos de media</small></div>
        <div><b>${stats.full}</b><small>Completos</small></div>
      </div>
      <h3>Abecedario del día</h3>
      <p>Racha actual: <b>${stats.daily.streak || 0}</b> · Mejor racha: <b>${stats.daily.best || 0}</b>${stats.daily.last ? ` · Último: ${stats.daily.last.split('-').reverse().join('/')}` : ''}</p>
      <div class="row-btns"><button class="btn danger" data-a="resetStats">Borrar estadísticas</button><button class="btn" data-a="close">Cerrar</button></div>`);
  }

  function settingsSheet() {
    const sw = (k, label, hint) => `<label class="set"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span>
      <input type="checkbox" class="switch" data-a="cfg" data-k="${k}" ${cfg[k] ? 'checked' : ''}></label>`;
    const seg = (k, label, opts, hint) => `<div class="set"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><div class="seg">${opts.map(([v, t]) =>
      `<button data-a="seg" data-k="${k}" data-v="${v}" class="${String(cfg[k]) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div></div>`;
    sheet(`<h2>Ajustes</h2>
      ${seg('time', 'Tiempo', TIMES, 'Se aplica desde el próximo abecedario')}
      ${seg('theme', 'Aspecto', [['claro', 'Claro'], ['oscuro', 'Oscuro']])}
      ${sw('showLen', 'Mostrar el número de letras', 'Una ayuda para las difíciles')}
      ${sw('kbd', 'Teclado en pantalla', 'Desactívalo si usas un teclado físico')}
      ${sw('sound', 'Sonido')}
      <div class="row-btns"><button class="btn primary" data-a="close">Hecho</button></div>`);
  }

  function howtoSheet() {
    sheet(`<h2>Cómo se juega</h2>
      <p>El abecedario tiene una definición para cada letra, de la A a la Z con la Ñ. La respuesta
      <b>empieza por</b> esa letra, salvo cuando pone <b>contiene</b>: entonces la letra está en algún lugar de la palabra.</p>
      <ul>
        <li>Escribe la respuesta y pulsa <b>Responder</b>. Las tildes no importan.</li>
        <li>Si no la sabes, pulsa <b>Paso</b>: volverás a ella cuando des la vuelta.</li>
        <li>Si fallas, verás la respuesta correcta; mientras tanto el reloj se para.</li>
        <li>La partida termina cuando contestas todas las letras, se acaba el tiempo o te plantas desde el menú.</li>
      </ul>
      <p>Hay un <b>abecedario del día</b>, igual durante todo el día, que lleva la cuenta de tu racha.
      En los demás se evitan las respuestas que han salido hace poco.</p>
      <p>Con teclado físico: escribe normalmente, <b>Intro</b> para responder (vacío, para pasar) y <b>Esc</b> para pausar.</p>
      <div class="row-btns"><button class="btn primary" data-a="close">Entendido</button></div>`);
  }

  function byNumSheet() {
    sheet(`<h2>Partida por número</h2>
      <p>El mismo número da siempre el mismo abecedario.</p>
      <input class="num" id="numIn" type="number" inputmode="numeric" min="1" max="999999" value="${P ? P.seed : 1}">
      <div class="row-btns"><button class="btn" data-a="close">Cancelar</button><button class="btn primary" data-a="goNum">Jugar</button></div>`);
  }

  function confirmSheet(text, yes, label) {
    sheet(`<h2>¿Seguro?</h2><p>${text}</p><div class="row-btns">
      <button class="btn" data-a="close">Cancelar</button><button class="btn danger" data-a="${yes}">${label}</button></div>`);
  }

  const randSeed = () => 1 + Math.floor(Math.random() * 999999);
  const dailySeed = d => { const [y, m, dd] = d.split('-').map(Number); return (y * 372 + m * 31 + dd) % 999983 + 1; };

  function action(a, el) {
    switch (a) {
      case 'close': closeSheet(); break;
      case 'new':
        if (S && S.phase === 'play') confirmSheet('La partida en curso terminará y contará como jugada.', 'go', 'Nuevo abecedario');
        else { closeSheet(); newGame(randSeed()); }
        break;
      case 'go': closeSheet(); newGame(randSeed()); break;
      case 'daily': {
        const d = todayKey();
        if (P && P.daily === d) { closeSheet(); toast('Ya estás en el abecedario de hoy'); break; }
        if (stats.daily.last === d) { closeSheet(); toast('El abecedario de hoy ya está hecho. Mañana habrá otro.'); break; }
        closeSheet(); newGame(dailySeed(d), d); break;
      }
      case 'byNum': byNumSheet(); break;
      case 'goNum': {
        const n = parseInt($('numIn').value, 10);
        if (!(n >= 1 && n <= 999999)) { toast('Escribe un número entre 1 y 999999'); break; }
        closeSheet(); newGame(n); break;
      }
      case 'quit': confirmSheet('Terminará la partida; las letras sin contestar no cuentan.', 'doQuit', 'Plantarse'); break;
      case 'doQuit': closeSheet(); finish('quit'); break;
      case 'results': resultSheet(); break;
      case 'stats': statsSheet(); break;
      case 'resetStats': confirmSheet('Se borrarán todas las estadísticas.', 'doResetStats', 'Borrar'); break;
      case 'doResetStats':
        Object.assign(stats, { played: 0, okTotal: 0, best: 0, full: 0, daily: { last: '', streak: 0, best: 0 } });
        save('ab.stats', stats); statsSheet(); break;
      case 'settings': settingsSheet(); break;
      case 'howto': howtoSheet(); save('ab.seenHelp', 1); break;
      case 'cfg': cfg[el.dataset.k] = el.checked; save('ab.cfg', cfg); applyCfg(); break;
      case 'seg':
        cfg[el.dataset.k] = el.dataset.k === 'time' ? +el.dataset.v : el.dataset.v;
        save('ab.cfg', cfg); applyCfg();
        // si aún no ha empezado, el tiempo nuevo vale ya para esta partida
        if (el.dataset.k === 'time' && S && S.phase === 'ready') { P.limit = cfg.time; S.left = cfg.time; persist(); render(); }
        settingsSheet(); break;
    }
  }

  function applyCfg() {
    document.body.dataset.theme = cfg.theme;
    document.body.classList.toggle('nokbd', !cfg.kbd);
    requestAnimationFrame(() => { layoutRing(); render(); });
  }

  // ---------- Pausa, tiempo, sonido ----------
  function setPause(v) {
    if (!S || S.phase !== 'play') v = false;
    paused = v;
    $('pauseCover').classList.toggle('show', v);
    $('card').style.visibility = v ? 'hidden' : '';
    render();
  }

  setInterval(() => {
    if (!S || S.phase !== 'play' || paused || modalOpen || revealing || document.hidden) return;
    S.used++;
    if (P.limit) {
      S.left--;
      if (S.left <= 10 && S.left > 0) beep(880, 0.04);
      if (S.left <= 0) { S.left = 0; finish('time'); return; }
    }
    renderClock();
    if (S.used % 5 === 0) persist();
  }, 1000);

  let audio = null;
  function beep(freq, dur, delay) {
    if (!cfg.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime + (delay || 0);
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
      o.connect(g).connect(audio.destination);
      o.start(t); o.stop(t + dur + 0.2);
    } catch (e) { /* sin audio */ }
  }
  function chime() { [523, 659, 784, 1047].forEach((f, k) => beep(f, 0.12, k * 0.11)); }

  let toastTimer = 0;
  function toast(t) {
    const el = $('toast');
    el.textContent = t; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // ---------- Eventos ----------
  $('bMenu').onclick = menuSheet;
  $('bNew').onclick = () => action('new');
  $('bPause').onclick = () => setPause(!paused);
  $('bResume').onclick = () => setPause(false);

  document.addEventListener('keydown', e => {
    if (modalOpen) { if (e.key === 'Escape') closeSheet(); return; }
    if (!S || e.ctrlKey || e.metaKey || e.altKey) return;
    if (paused) { if (e.key === ' ' || e.key === 'Escape') setPause(false); return; }
    const k = e.key;
    if (S.phase === 'ready' && k === 'Enter') { begin(); e.preventDefault(); return; }
    if (/^[a-zñA-ZÑáéíóúüÁÉÍÓÚÜ]$/.test(k)) { type(k.toUpperCase()); e.preventDefault(); return; }
    if (k === 'Backspace') erase();
    else if (k === 'Enter') answer();
    else if (k === 'Escape') setPause(true);
    else return;
    e.preventDefault();
  });

  window.addEventListener('resize', () => { layoutRing(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S && S.phase === 'play') { setPause(true); persist(); } });

  // Llamadas desde la app Android
  window.appBack = function () {
    if (modalOpen) { closeSheet(); return true; }
    if (paused) { setPause(false); return true; }
    if (S && S.phase === 'play') { setPause(true); return true; }
    return false;
  };
  window.appPause = function () { if (S && S.phase === 'play') setPause(true); if (P) save('ab.game', { v: 1, P, S }); };

  // ---------- Arranque ----------
  buildKbd();
  applyCfg();
  const saved = load('ab.game', null);
  if (saved && saved.v === 1 && saved.P && saved.S) {
    P = saved.P; S = saved.S;
    S.typed = S.typed || '';
    // si se cerró mostrando un fallo, sigue con la siguiente letra
    if (S.phase === 'play' && S.st[S.cur]) { if (!advance()) finish('done', true); }
    render();
    if (S.phase === 'play') setPause(true);
  } else {
    newGame(randSeed());
  }
  if (!load('ab.seenHelp', 0)) { save('ab.seenHelp', 1); setTimeout(howtoSheet, 300); }

  window.ABDebug = { get P() { return P; }, get S() { return S; }, type, answer, pass, begin, finish, newGame, action };
})();
