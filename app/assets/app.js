// Abecedario: una definición por letra contra el reloj, para uno o varios jugadores por turnos.
// Interfaz, teclado, relojes, estadísticas y guardado.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const bank = ABGen.parseBank(window.ABBanco);
  const LETTERS = ABGen.LETTERS;
  const TIMES = [[120, '2 min'], [180, '3 min'], [240, '4 min'], [300, '5 min'], [0, 'Sin límite']];
  const ANS_TIMES = [[15, '15 s'], [20, '20 s'], [30, '30 s'], [45, '45 s'], [60, '1 min'], [0, 'Sin límite']];
  const MAX_PLAYERS = 4;
  const COLORS = ['#f5b82e', '#4fb3f6', '#f27aa8', '#7ad47a'];

  // ---------- Ajustes y estadísticas ----------
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
  const cfg = Object.assign({
    time: 180, ansTime: 30, theme: 'claro', sound: true, kbd: true, showLen: false,
    nplayers: 1, names: ['Jugador 1', 'Jugador 2', 'Jugador 3', 'Jugador 4'],
  }, load('ab.cfg', {}));
  const stats = Object.assign({ played: 0, okTotal: 0, best: 0, full: 0, multi: 0, daily: { last: '', streak: 0, best: 0 } }, load('ab.stats', {}));
  let hist = load('ab.hist', []); // respuestas recientes, para no repetirlas

  // ---------- Estado de la partida ----------
  // P: {seed, daily, limit, ansLimit, players:[{name, items:[{l,t,a,alts,d}]}]}
  // S: {phase:'ready'|'play'|'over', turn, handoff, answering, ansLeft, typed, counted,
  //     pl:[{st:[0 pendiente|1 acierto|2 fallo], said:[], cur, left, used, done, why}]}
  let P = null, S = null;
  let paused = false, modalOpen = false;
  let revealing = 0; // temporizador mientras se muestra la respuesta tras un fallo

  const multi = () => P && P.players.length > 1;
  const me = () => S.pl[S.turn];
  const myItems = () => P.players[S.turn].items;

  function todayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function newGame(seed, daily) {
    if (S && S.phase === 'play' && !S.counted) finish(true);
    const n = daily ? 1 : Math.max(1, Math.min(MAX_PLAYERS, cfg.nplayers));
    // Cada jugador tiene su propio abecedario, sin repetir respuestas entre ellos si se puede
    const avoid = daily ? new Set() : new Set(hist);
    const players = [];
    for (let k = 0; k < n; k++) {
      const items = ABGen.make(bank, seed + k * 7919, avoid);
      items.forEach(e => avoid.add(e.alts[0]));
      players.push({ name: n > 1 ? (cfg.names[k] || 'Jugador ' + (k + 1)) : '', items });
    }
    P = { seed, daily: daily || '', limit: cfg.time, ansLimit: cfg.ansTime, players };
    S = {
      phase: 'ready', turn: 0, handoff: false, answering: false, ansLeft: 0, typed: '', counted: false,
      pl: players.map(() => ({ st: LETTERS.map(() => 0), said: LETTERS.map(() => ''), cur: 0, left: cfg.time, used: 0, done: false, why: '' })),
    };
    if (!daily) {
      hist = hist.concat(...players.map(p => p.items.map(e => e.alts[0]))).slice(-300);
      save('ab.hist', hist);
    }
    stopReveal();
    paused = false; $('pauseCover').classList.remove('show'); $('card').style.visibility = '';
    persist(); render();
  }

  function begin() {
    if (S.phase === 'ready') { S.phase = 'play'; S.handoff = false; }
    else if (S.handoff) S.handoff = false;
    else return;
    beep(660, 0.08);
    persist(); render();
  }

  let saveTimer = 0;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save('ab.game', { v: 2, P, S }), 200);
  }

  // ---------- Jugar ----------
  const pendingOf = p => p.st.filter(v => !v).length;
  const canAct = () => S && S.phase === 'play' && !paused && !revealing && !S.handoff;

  // Siguiente letra sin contestar del jugador, dando la vuelta si hace falta
  function advance(p) {
    for (let k = 1; k <= LETTERS.length; k++) {
      const i = (p.cur + k) % LETTERS.length;
      if (!p.st[i]) { p.cur = i; return true; }
    }
    return false;
  }

  // Pulsar «Responder»: se para el reloj principal y empieza el de la respuesta
  function startAnswer() {
    if (!canAct() || S.answering) return;
    S.answering = true;
    S.ansLeft = P.ansLimit;
    S.typed = '';
    beep(880, 0.05);
    persist(); render();
  }

  function submit() {
    if (!canAct() || !S.answering) return;
    const text = S.typed.trim();
    if (!ABGen.norm(text)) { toast('Escribe la respuesta'); return; }
    judge(text);
  }

  function judge(text) {
    const p = me(), item = myItems()[p.cur];
    S.answering = false;
    S.typed = '';
    p.said[p.cur] = text;
    if (text && ABGen.check(item, text)) {
      p.st[p.cur] = 1;
      beep(784, 0.08); beep(1047, 0.12, 0.08);
      flashLetter(p.cur);
      // con un acierto se sigue jugando
      if (!advance(p)) { p.done = true; p.why = 'done'; nextTurn(); return; }
      persist(); render();
    } else {
      p.st[p.cur] = 2;
      beep(220, 0.25);
      flashLetter(p.cur);
      // Enseña la respuesta un momento, con los relojes parados
      showReveal(item, text);
      persist(); render();
      revealing = setTimeout(() => {
        stopReveal();
        if (!advance(p)) { p.done = true; p.why = 'done'; }
        nextTurn();
      }, 2800);
    }
  }

  function pass() {
    if (!canAct()) return;
    const p = me();
    S.answering = false;
    S.typed = '';
    beep(440, 0.06);
    if (pendingOf(p) === 1 && !multi()) { toast('Es la última letra que queda'); render(); return; }
    advance(p);
    nextTurn();
  }

  // Tras un fallo o un paso, juega el siguiente que no haya terminado (en solitario, el mismo)
  function nextTurn() {
    const n = S.pl.length;
    for (let k = 1; k <= n; k++) {
      const t = (S.turn + k) % n;
      if (S.pl[t].done) continue;
      if (t !== S.turn) { S.turn = t; S.handoff = true; beep(523, 0.1); }
      persist(); render();
      return;
    }
    finish();
  }

  function playerOut(why) {
    const p = me();
    p.done = true; p.why = why;
    S.answering = false; S.typed = '';
    if (why === 'time') toast(multi() ? `Se acabó el tiempo de ${P.players[S.turn].name}` : 'Se acabó el tiempo');
    nextTurn();
  }

  function showReveal(item, text) {
    const r = $('reveal');
    r.className = 'show bad';
    r.innerHTML = (text ? `No es «${esc(text)}». ` : 'Se acabó el tiempo para responder. ') +
      `La respuesta era <b>${esc(item.a.toUpperCase())}</b>.`;
  }
  function stopReveal() {
    if (revealing) clearTimeout(revealing);
    revealing = 0;
    $('reveal').className = '';
  }

  const okOf = p => p.st.filter(v => v === 1).length;
  const badOf = p => p.st.filter(v => v === 2).length;

  // Puesto de cada jugador: más aciertos, luego menos fallos, luego más tiempo sobrante
  function ranking() {
    return S.pl.map((p, k) => k).sort((a, b) => {
      const A = S.pl[a], B = S.pl[b];
      return okOf(B) - okOf(A) || badOf(A) - badOf(B) || (B.left - A.left);
    });
  }

  function finish(silent) {
    stopReveal();
    S.phase = 'over';
    S.answering = false; S.handoff = false;
    if (multi()) S.turn = ranking()[0]; // la rueda muestra la del ganador
    if (!S.counted) {
      S.counted = true;
      if (multi()) stats.multi = (stats.multi || 0) + 1;
      else {
        const ok = okOf(S.pl[0]);
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
        S.newBest = best && stats.played > 1;
      }
      save('ab.stats', stats);
    }
    persist();
    if (silent) return;
    chime();
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
    bubbles[i].animate([{ transform: 'translate(-50%, -50%) scale(1.5)' }, { transform: 'translate(-50%, -50%) scale(1)' }], { duration: 400, easing: 'ease-out' });
  }

  const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const clockOf = p => P.limit ? fmt(Math.max(0, p.left)) : fmt(p.used);

  // Relojes: el principal del jugador en el centro; el de responder, en el botón y en la barra
  function renderClock() {
    if (!P) return;
    const p = me(), c = $('clock');
    c.textContent = clockOf(p);
    c.classList.toggle('low', !!P.limit && S.phase === 'play' && p.left <= 15);
    c.classList.toggle('stopped', S.phase === 'play' && (S.answering || S.handoff));
    if (S.answering && P.ansLimit) {
      const b = $('bSend');
      if (b) b.textContent = `Enviar · ${S.ansLeft}`;
      $('ansBar').style.width = (100 * S.ansLeft / P.ansLimit) + '%';
      $('ansBar').classList.toggle('low', S.ansLeft <= 5);
    }
    if (multi()) S.pl.forEach((q, k) => { const t = document.querySelector(`#players [data-p="${k}"] em`); if (t) t.textContent = clockOf(q); });
  }

  function renderPlayers() {
    const box = $('players');
    if (!multi()) { box.innerHTML = ''; box.style.display = 'none'; return; }
    box.style.display = '';
    box.innerHTML = P.players.map((pl, k) => {
      const p = S.pl[k];
      const cls = (k === S.turn && S.phase === 'play' ? 'on' : '') + (p.done ? ' out' : '');
      return `<div class="pchip ${cls}" data-p="${k}"><i style="background:${COLORS[k]}"></i><span>${esc(pl.name)}</span>
        <b>${okOf(p)}</b><em>${clockOf(p)}</em></div>`;
    }).join('');
  }

  function render() {
    if (!P) return;
    const p = me(), items = myItems();
    const ok = okOf(p), bad = badOf(p);
    bubbles.forEach((b, i) => {
      b.className = 'lt' + (p.st[i] === 1 ? ' ok' : p.st[i] === 2 ? ' bad' : '') + (S.phase === 'play' && i === p.cur && !p.st[i] ? ' cur' : '');
    });
    $('sOk').textContent = ok; $('sBad').textContent = bad;
    $('who').textContent = multi() && S.phase !== 'over' ? P.players[S.turn].name : '';
    $('who').style.color = multi() ? COLORS[S.turn] : '';
    $('score').innerHTML = `<span><i style="background:var(--ok)"></i>${ok}</span><span><i style="background:var(--bad)"></i>${bad}</span>`;
    $('hSub').textContent = (P.daily ? 'Abecedario del día · ' : multi() ? `${P.players.length} jugadores · ` : '') + `nº ${P.seed} · ` +
      (P.limit ? fmt(P.limit) + ' min' : 'sin límite') + (P.ansLimit ? ` · ${P.ansLimit} s para responder` : '');
    renderPlayers();
    renderClock();
    const def = $('def'), rule = $('rule'), ans = $('answer'), act = $('actions');
    $('ansWrap').classList.toggle('show', S.phase === 'play' && S.answering && !!P.ansLimit);
    const setActs = html => { if (act.dataset.h !== html) { act.innerHTML = html; act.dataset.h = html; } };

    if (S.phase === 'ready' || S.handoff) {
      const name = P.players[S.turn].name;
      if (S.phase === 'ready' && !multi()) {
        rule.innerHTML = '<b>A</b>Preparado';
        def.className = 'start';
        def.innerHTML = `Para cada letra hay una definición. La respuesta <b>empieza por</b> esa letra o, si lo indica,
          la <b>contiene</b>. Cuando la sepas, pulsa <b>Responder</b>: el reloj se para y tienes
          ${P.ansLimit ? `<b>${P.ansLimit} segundos</b>` : 'todo el tiempo que quieras'} para escribirla. Si no, pulsa <b>Paso</b>.
          ${P.limit ? `Tienes ${fmt(P.limit)} minutos.` : 'Esta partida no tiene límite de tiempo.'}`;
      } else {
        rule.innerHTML = `<b style="background:${COLORS[S.turn]}">${esc(name.charAt(0).toUpperCase())}</b>Turno de ${esc(name)}`;
        def.className = 'start';
        def.innerHTML = S.phase === 'ready'
          ? `Juegan ${P.players.length}, cada uno con su abecedario y su reloj. Se sigue jugando mientras se acierta;
            al fallar o pasar, le toca al siguiente. Gana quien más acierte.<br><br>Empieza <b>${esc(name)}</b>.`
          : `Pasa la tablet a <b>${esc(name)}</b>. Su reloj no corre hasta que pulse el botón.
            Lleva ${okOf(p)} aciertos y le quedan ${pendingOf(p)} letras.`;
      }
      ans.textContent = ''; ans.classList.add('off');
      setActs(`<button class="btn" id="bStart">${S.phase === 'ready' && !multi() ? 'Empezar' : 'Empezar turno'}</button>`);
      $('bStart').onclick = begin;
      return;
    }
    if (S.phase === 'over') {
      if (multi()) {
        const r = ranking(), w = S.pl[r[0]], tie = r.length > 1 && okOf(w) === okOf(S.pl[r[1]]) && badOf(w) === badOf(S.pl[r[1]]);
        rule.innerHTML = `<b>${okOf(w)}</b>${tie ? 'Empate' : 'Gana ' + esc(P.players[r[0]].name)}`;
        def.className = 'start';
        def.innerHTML = r.map((k, n) => `${n + 1}. <b>${esc(P.players[k].name)}</b>: ${okOf(S.pl[k])} aciertos, ${badOf(S.pl[k])} fallos`).join('<br>');
      } else {
        const why = { done: 'Abecedario terminado', time: 'Se acabó el tiempo', quit: 'Te has plantado' }[p.why] || 'Terminado';
        rule.innerHTML = `<b>${ok}</b>${why}`;
        def.className = 'start';
        def.innerHTML = `${ok} aciertos, ${bad} fallos y ${LETTERS.length - ok - bad} sin contestar.`;
      }
      ans.textContent = ''; ans.classList.add('off');
      setActs('<button class="btn" id="bPass">Ver respuestas</button><button class="btn" id="bSend">Nuevo abecedario</button>');
      $('bPass').onclick = resultSheet;
      $('bSend').onclick = () => action('new');
      return;
    }
    const item = items[p.cur];
    const how = item.t === 'E' ? `Empieza por la ${item.l}` : `Contiene la ${item.l}`;
    rule.innerHTML = `<b>${item.l}</b>${how}${cfg.showLen ? `<small>${item.alts[0].length} letras</small>` : ''}`;
    def.className = '';
    def.textContent = paused ? '' : item.d;
    ans.textContent = S.typed;
    ans.classList.toggle('off', !S.answering || !!revealing);
    ans.classList.toggle('idle', !S.answering);
    if (!S.answering && !revealing) ans.textContent = 'Pulsa Responder para escribir';
    if (S.answering) {
      setActs('<button class="btn" id="bPass">Paso</button><button class="btn" id="bSend">Enviar</button>');
      $('bSend').onclick = submit;
    } else {
      setActs('<button class="btn" id="bPass">Paso</button><button class="btn" id="bSend">Responder</button>');
      $('bSend').onclick = startAnswer;
    }
    $('bPass').onclick = pass;
    renderClock();
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
  // Escribir una letra equivale a pulsar «Responder»
  function type(c) {
    if (!canAct()) return;
    if (!S.answering) startAnswer();
    if (S.typed.length >= 24) return;
    S.typed += c;
    $('answer').textContent = S.typed;
  }
  function erase() {
    if (!canAct() || !S.answering) return;
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
      ${playing && !S.handoff ? `<button class="btn" data-a="quit">${ico('M4 22V4a1 1 0 0 1 1-1h12l-2 5 2 5H5')}${multi() ? 'Plantarse (' + esc(P.players[S.turn].name) + ')' : 'Plantarse'}</button>` : ''}
      ${S && S.phase === 'over' ? `<button class="btn" data-a="results">${ico('M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11')}Ver respuestas</button>` : ''}
      <button class="btn" data-a="stats">${ico('M4 20V10M10 20V4M16 20v-7M22 20H2')}Estadísticas</button>
      <button class="btn" data-a="settings">${ico('M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6')}Ajustes</button>
      <button class="btn" data-a="howto">${ico('M12 17h.01M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z')}Cómo se juega</button>
    </div><div class="row-btns"><button class="btn" data-a="close">Cerrar</button></div>`);
  }

  // Elegir jugadores antes de empezar
  let draft = null;
  function newSheet() {
    draft = draft || { n: cfg.nplayers, names: cfg.names.slice() };
    const names = draft.n > 1 ? `<h3>Nombres</h3><div class="names">${draft.names.slice(0, draft.n).map((nm, k) =>
      `<label><i style="background:${COLORS[k]}"></i><input class="num" data-k="${k}" maxlength="14" value="${esc(nm)}"></label>`).join('')}</div>` : '';
    sheet(`<h2>Nuevo abecedario</h2>
      <div class="set"><span>Jugadores<small>${draft.n > 1 ? 'Por turnos en la misma tablet, cada uno con su abecedario' : 'Partida en solitario'}</small></span>
      <div class="seg">${[1, 2, 3, 4].map(n => `<button data-a="nPl" data-v="${n}" class="${draft.n === n ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      ${names}
      <p style="font-size:14px;opacity:.7">Tiempo: ${cfg.time ? fmt(cfg.time) + ' min por jugador' : 'sin límite'}; para responder: ${cfg.ansTime ? cfg.ansTime + ' s' : 'sin límite'}. Se cambia en Ajustes.</p>
      <div class="row-btns"><button class="btn" data-a="close">Cancelar</button><button class="btn primary" data-a="go">Empezar</button></div>`);
  }
  function readNames() {
    document.querySelectorAll('#sheet .names input').forEach(i => { draft.names[+i.dataset.k] = i.value.trim() || 'Jugador ' + (+i.dataset.k + 1); });
  }

  function answersOf(k) {
    const p = S.pl[k];
    return P.players[k].items.map((e, i) => {
      const cls = p.st[i] === 1 ? 'ok' : p.st[i] === 2 ? 'bad' : '';
      const said = p.st[i] === 2 ? ` <s>${esc(p.said[i] || 'sin respuesta')}</s>` : '';
      return `<div class="${cls}"><b>${e.l}</b><span><strong>${esc(e.a)}</strong>${said}<small>${esc(e.d)}</small></span></div>`;
    }).join('');
  }

  function resultSheet() {
    if (multi()) {
      const r = ranking(), w = S.pl[r[0]], tie = okOf(w) === okOf(S.pl[r[1]]) && badOf(w) === badOf(S.pl[r[1]]);
      const rows = r.map((k, n) => `<tr><td>${n + 1}. <i class="dot" style="background:${COLORS[k]}"></i>${esc(P.players[k].name)}</td>
        <td>${okOf(S.pl[k])}</td><td>${badOf(S.pl[k])}</td><td>${LETTERS.length - okOf(S.pl[k]) - badOf(S.pl[k])}</td><td>${P.limit ? fmt(Math.max(0, S.pl[k].left)) : fmt(S.pl[k].used)}</td></tr>`).join('');
      sheet(`<h2>${tie ? '¡Empate!' : '¡Gana ' + esc(P.players[r[0]].name) + '!'}</h2>
        <table class="st"><tr><th>Jugador</th><th>Aciertos</th><th>Fallos</th><th>Sin contestar</th><th>${P.limit ? 'Le sobró' : 'Tiempo'}</th></tr>${rows}</table>
        ${r.map(k => `<details><summary>Respuestas de ${esc(P.players[k].name)}</summary><div class="list">${answersOf(k)}</div></details>`).join('')}
        <div class="row-btns"><button class="btn" data-a="close">Cerrar</button><button class="btn primary" data-a="new">Nuevo abecedario</button></div>`);
      return;
    }
    const p = S.pl[0], ok = okOf(p), bad = badOf(p);
    const title = ok === LETTERS.length ? '¡Abecedario completo!' : ok >= 20 ? '¡Muy bien!' : ok >= 12 ? 'Bien jugado' : 'Resultado';
    sheet(`<h2>${title}</h2>
      <div class="res">
        <div><b style="color:var(--ok)">${ok}</b><small>Aciertos</small>${S.newBest ? '<em>Mejor marca</em>' : ''}</div>
        <div><b style="color:var(--bad)">${bad}</b><small>Fallos</small></div>
        <div><b>${LETTERS.length - ok - bad}</b><small>Sin contestar</small></div>
        <div><b>${fmt(P.limit ? P.limit - Math.max(0, p.left) : p.used)}</b><small>Tiempo</small></div>
      </div>
      ${P.daily ? `<p>Abecedario del día hecho. Racha: <b>${stats.daily.streak}</b> ${stats.daily.streak === 1 ? 'día' : 'días seguidos'}.</p>` : ''}
      <h3>Respuestas</h3><div class="list">${answersOf(0)}</div>
      <div class="row-btns"><button class="btn" data-a="close">Cerrar</button><button class="btn primary" data-a="new">Nuevo abecedario</button></div>`);
  }

  function statsSheet() {
    const avg = stats.played ? (stats.okTotal / stats.played).toFixed(1).replace('.', ',') : '—';
    sheet(`<h2>Estadísticas</h2>
      <p style="opacity:.7;font-size:14px">De las partidas en solitario.</p>
      <div class="res">
        <div><b>${stats.played}</b><small>Jugados</small></div>
        <div><b>${stats.best}</b><small>Mejor marca</small></div>
        <div><b>${avg}</b><small>Aciertos de media</small></div>
        <div><b>${stats.full}</b><small>Completos</small></div>
      </div>
      <p>Partidas a varios: <b>${stats.multi || 0}</b></p>
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
      ${seg('time', 'Tiempo de cada jugador', TIMES, 'Se aplica desde el próximo abecedario')}
      ${seg('ansTime', 'Tiempo para responder', ANS_TIMES, 'Desde que se pulsa Responder; el reloj principal se para')}
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
        <li>Cuando sepas la respuesta, pulsa <b>Responder</b> (o empieza a escribir). Tu reloj se para y empieza
          la cuenta atrás para escribirla (30 segundos, se cambia en Ajustes). Luego pulsa <b>Enviar</b>. Las tildes no importan.</li>
        <li>Si se acaba la cuenta atrás, cuenta como fallo.</li>
        <li>Si no la sabes, pulsa <b>Paso</b>: volverás a ella en la siguiente vuelta.</li>
        <li>Al fallar verás la respuesta correcta; mientras tanto los relojes están parados.</li>
        <li>La partida termina cuando contestas todas las letras, se acaba el tiempo o te plantas desde el menú.</li>
      </ul>
      <h3>Varios jugadores</h3>
      <ul>
        <li>Elige de 2 a 4 jugadores en <b>Nuevo abecedario</b>. Cada uno tiene su propio abecedario y su reloj.</li>
        <li>Se sigue jugando mientras se acierta. Al fallar o pasar, le toca al siguiente; su reloj no corre hasta que pulsa <b>Empezar turno</b>.</li>
        <li>Gana quien más acierte; si empatan, quien menos falle.</li>
      </ul>
      <p>Hay un <b>abecedario del día</b> (en solitario), igual durante todo el día, que lleva la cuenta de tu racha.</p>
      <p>Con teclado físico: escribe para responder, <b>Intro</b> para enviar, <b>Tab</b> para pasar y <b>Esc</b> para pausar.</p>
      <div class="row-btns"><button class="btn primary" data-a="close">Entendido</button></div>`);
  }

  function byNumSheet() {
    sheet(`<h2>Partida por número</h2>
      <p>El mismo número da siempre el mismo abecedario (con ${cfg.nplayers} ${cfg.nplayers === 1 ? 'jugador' : 'jugadores'}).</p>
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
      case 'new': draft = null; newSheet(); break;
      case 'nPl': readNames(); draft.n = +el.dataset.v; newSheet(); break;
      case 'go':
        if (draft) { readNames(); cfg.nplayers = draft.n; cfg.names = draft.names; save('ab.cfg', cfg); draft = null; }
        if (S && S.phase === 'play') { confirmSheet('La partida en curso terminará.', 'doGo', 'Nuevo abecedario'); break; }
        closeSheet(); newGame(randSeed()); break;
      case 'doGo': closeSheet(); newGame(randSeed()); break;
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
      case 'quit': confirmSheet(multi() ? `${esc(P.players[S.turn].name)} deja de jugar; sus letras sin contestar no cuentan.` : 'Terminará la partida; las letras sin contestar no cuentan.', 'doQuit', 'Plantarse'); break;
      case 'doQuit': closeSheet(); stopReveal(); playerOut('quit'); break;
      case 'results': resultSheet(); break;
      case 'stats': statsSheet(); break;
      case 'resetStats': confirmSheet('Se borrarán todas las estadísticas.', 'doResetStats', 'Borrar'); break;
      case 'doResetStats':
        Object.assign(stats, { played: 0, okTotal: 0, best: 0, full: 0, multi: 0, daily: { last: '', streak: 0, best: 0 } });
        save('ab.stats', stats); statsSheet(); break;
      case 'settings': settingsSheet(); break;
      case 'howto': howtoSheet(); save('ab.seenHelp', 1); break;
      case 'cfg': cfg[el.dataset.k] = el.checked; save('ab.cfg', cfg); applyCfg(); break;
      case 'seg': {
        const k = el.dataset.k;
        cfg[k] = k === 'time' || k === 'ansTime' ? +el.dataset.v : el.dataset.v;
        save('ab.cfg', cfg); applyCfg();
        // si aún no ha empezado, los tiempos nuevos valen ya para esta partida
        if (S && S.phase === 'ready') {
          if (k === 'time') { P.limit = cfg.time; S.pl.forEach(p => { p.left = cfg.time; }); }
          if (k === 'ansTime') P.ansLimit = cfg.ansTime;
          persist(); render();
        }
        settingsSheet(); break;
      }
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
    if (!S || S.phase !== 'play' || paused || modalOpen || revealing || S.handoff || document.hidden) return;
    if (S.answering) {
      // reloj de la respuesta; el principal está parado
      if (!P.ansLimit) return;
      S.ansLeft--;
      if (S.ansLeft <= 5 && S.ansLeft > 0) beep(990, 0.04);
      if (S.ansLeft <= 0) { judge(S.typed.trim()); return; }
      renderClock();
      return;
    }
    const p = me();
    p.used++;
    if (P.limit) {
      p.left--;
      if (p.left <= 10 && p.left > 0) beep(880, 0.04);
      if (p.left <= 0) { p.left = 0; playerOut('time'); return; }
    }
    renderClock();
    if (p.used % 5 === 0) persist();
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
    if (modalOpen) {
      if (e.key === 'Escape') closeSheet();
      return;
    }
    if (!S || e.ctrlKey || e.metaKey || e.altKey) return;
    if (paused) { if (e.key === ' ' || e.key === 'Escape') setPause(false); return; }
    const k = e.key;
    if ((S.phase === 'ready' || S.handoff) && k === 'Enter') { begin(); e.preventDefault(); return; }
    if (/^[a-zñA-ZÑáéíóúüÁÉÍÓÚÜ]$/.test(k)) { type(k.toUpperCase()); e.preventDefault(); return; }
    if (k === 'Backspace') erase();
    else if (k === 'Enter') { if (S.answering) submit(); else startAnswer(); }
    else if (k === 'Tab') pass();
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
  window.appPause = function () { if (S && S.phase === 'play') setPause(true); if (P) save('ab.game', { v: 2, P, S }); };

  // ---------- Arranque ----------
  buildKbd();
  applyCfg();
  const saved = load('ab.game', null);
  if (saved && saved.v === 2 && saved.P && saved.S) {
    P = saved.P; S = saved.S;
    S.typed = S.typed || '';
    // si se cerró mostrando un fallo, sigue con la siguiente letra o el siguiente jugador
    const p = me();
    if (S.phase === 'play' && p.st[p.cur] && !p.done) {
      if (!advance(p)) { p.done = true; p.why = 'done'; }
      nextTurn();
    }
    render();
    if (S.phase === 'play' && !S.handoff) setPause(true);
  } else {
    newGame(randSeed());
  }
  if (!load('ab.seenHelp', 0)) { save('ab.seenHelp', 1); setTimeout(howtoSheet, 300); }

  window.ABDebug = { get P() { return P; }, get S() { return S; }, type, submit, startAnswer, pass, begin, finish, newGame, action, judge };
})();
