(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const frame = $('gameFrame');
  const ui = {
    score: $('score'), best: $('best'), heat: $('heatFill'), heatText: $('heatText'),
    boost: $('boostFill'), boostText: $('boostText'), health: $('health'),
    speed: $('speedDisplay'), toast: $('toast'), boostNotice: $('boostNotice'),
    start: $('startScreen'), pause: $('pauseScreen'), end: $('endScreen'),
    pauseButton: $('pauseButton'), endTitle: $('endTitle'), endKicker: $('endKicker'),
    endMessage: $('endMessage'), finalScore: $('finalScore'), finalBest: $('finalBest'),
    finalNearMisses: $('finalNearMisses'), soundButton: $('soundButton'), soundLabel: $('soundLabel')
  };
  const lanes = [-0.75, -0.25, 0.25, 0.75];
  const colors = ['#f8c65c', '#ff649b', '#7ae5ff', '#a6ffad', '#c9a8ff'];
  const keys = { left: false, right: false, boost: false };
  const pointerHolds = { left: new Set(), right: new Set(), boost: new Set() };
  const BEST_KEY = 'neon-getaway-best-v1';
  let best = 0;
  try { best = Math.max(0, Number(localStorage.getItem(BEST_KEY)) || 0); } catch (_) {}
  let audioEnabled = false;
  let audioContext = null;
  let width = 0, height = 0, dpr = 1;
  let lastTime = 0, ambientTime = 0, lastHudTime = 0;
  let toastTimer = 0;
  let carId = 0;
  let game = makeGame('menu');

  function makeGame(phase) {
    return {
      phase, time: 0, score: 0, nearMisses: 0, heat: 0, boost: 35, health: 3,
      playerX: 0, playerV: 0, speed: 148, roadOffset: 0, spawnTimer: 0.45,
      traffic: [], particles: [], flash: 0, shake: 0, invulnerable: 0,
      boosting: false, combo: 0, lastNearMiss: -10, level: 1
    };
  }

  function resize() {
    const rect = frame.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const pad = (n) => String(Math.floor(n)).padStart(6, '0');
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const rand = (a, b) => a + Math.random() * (b - a);
  const roadWidth = () => Math.min(width * (width < 650 ? 0.74 : 0.57), 530);
  const playerY = () => height * (width < 650 ? 0.67 : 0.76);
  const roadX = (x) => width / 2 + x * roadWidth() / 2;
  const carSize = () => ({ w: roadWidth() * 0.175, h: clamp(roadWidth() * 0.29, 58, 100) });

  function setScreen(name) {
    for (const [key, el] of [['menu', ui.start], ['paused', ui.pause], ['ended', ui.end]]) {
      const visible = key === name;
      el.classList.toggle('hidden', !visible);
      el.setAttribute('aria-hidden', String(!visible));
    }
    ui.pauseButton.hidden = name !== 'playing';
  }
  setScreen('menu');
  updateHud(true);

  function start() {
    game = makeGame('playing');
    for (const key of Object.keys(keys)) keys[key] = false;
    for (const set of Object.values(pointerHolds)) set.clear();
    document.querySelectorAll('.touch-controls button').forEach((b) => b.classList.remove('pressed'));
    setScreen('playing');
    updateHud(true);
    playTone(360, 0.08, 'sawtooth', 0.045);
    requestAnimationFrame(() => frame.focus?.());
  }
  function pause() {
    if (game.phase !== 'playing') return;
    game.phase = 'paused';
    keys.boost = false;
    game.boosting = false;
    setScreen('paused');
    updateHud(true);
  }
  function resume() {
    if (game.phase !== 'paused') return;
    game.phase = 'playing';
    setScreen('playing');
  }
  function end(reason) {
    if (game.phase !== 'playing') return;
    game.phase = 'ended';
    game.boosting = false;
    const final = Math.floor(game.score);
    const isBest = final > best;
    if (isBest) {
      best = final;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (_) {}
    }
    ui.endKicker.textContent = isBest ? 'NEW HIGH SCORE' : 'RUN OVER';
    ui.endTitle.innerHTML = reason === 'heat' ? 'BUSTED<span>.</span>' : 'TOTALLED<span>.</span>';
    ui.endMessage.textContent = reason === 'heat' ? 'The city finally caught up.' : 'That was one hit too many.';
    ui.finalScore.textContent = pad(final);
    ui.finalBest.textContent = pad(best);
    ui.finalNearMisses.textContent = String(game.nearMisses);
    setScreen('ended');
    updateHud(true);
    playTone(95, 0.36, 'sawtooth', 0.07);
  }

  function updateHud(force = false) {
    if (!force && ambientTime - lastHudTime < 0.07) return;
    lastHudTime = ambientTime;
    ui.score.textContent = pad(game.score);
    ui.best.textContent = pad(best);
    ui.heat.style.width = `${clamp(game.heat, 0, 100)}%`;
    ui.heatText.textContent = `${Math.ceil(game.heat)}%`;
    ui.boost.style.width = `${clamp(game.boost, 0, 100)}%`;
    ui.boostText.textContent = `${Math.floor(game.boost)}%`;
    ui.health.textContent = '◆ '.repeat(game.health).trim() + (game.health < 3 ? ' ◇'.repeat(3 - game.health) : '');
    ui.health.setAttribute('aria-label', `${game.health} of 3 car health`);
    ui.speed.textContent = String(Math.round(game.speed));
    ui.boostNotice.classList.toggle('active', game.boosting);
  }

  function showToast(text, tone = 'good') {
    ui.toast.textContent = text;
    ui.toast.style.color = tone === 'bad' ? '#ff4a9c' : '#d9fa61';
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 950);
  }

  function playTone(freq, duration, type = 'sine', volume = 0.03) {
    if (!audioEnabled) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioContext.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(50, freq * .62), audioContext.currentTime + duration);
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
      osc.connect(gain).connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + duration);
    } catch (_) {}
  }

  function spawnTraffic() {
    const level = Math.floor(game.time / 18) + 1;
    const pressure = game.heat / 100;
    const lane = Math.floor(Math.random() * lanes.length);
    const police = game.time > 14 && Math.random() < 0.1 + pressure * 0.33;
    const common = {
      id: ++carId, y: -0.18, checked: false, hit: false,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedFactor: rand(.83, 1.12)
    };
    game.traffic.push({ ...common, x: lanes[lane], police });
    if (game.time > 25 && Math.random() < Math.min(.35, .1 + level * .035)) {
      const other = (lane + 2 + Math.floor(Math.random() * 2)) % lanes.length;
      game.traffic.push({ ...common, id: ++carId, x: lanes[other], y: -0.31, checked: false, police: false,
        color: colors[Math.floor(Math.random() * colors.length)] });
    }
    game.spawnTimer = Math.max(.47, rand(.75, 1.18) - Math.min(.24, game.time * .0025));
  }

  function makeSparks(x, y, color, amount) {
    for (let i = 0; i < amount; i++) game.particles.push({ x, y, vx: rand(-170, 170), vy: rand(-120, 160), life: rand(.2, .6), max: .6, color });
  }

  function update(dt) {
    const g = game;
    g.time += dt;
    g.level = Math.floor(g.time / 18) + 1;
    g.boosting = keys.boost && g.boost > 1;
    g.speed = (148 + Math.min(g.time * 1.6, 90)) * (g.boosting ? 1.58 : 1);
    g.roadOffset += dt * (g.boosting ? 690 : 420 + Math.min(g.time * 3, 150));
    g.score += dt * g.speed * (g.boosting ? .65 : .42);
    g.heat = clamp(g.heat + dt * (.56 + Math.min(g.time * .025, 1.65)), 0, 100);
    g.boost = clamp(g.boost + (g.boosting ? -28 : .85) * dt, 0, 100);
    g.invulnerable = Math.max(0, g.invulnerable - dt);
    g.flash = Math.max(0, g.flash - dt * 2.4);
    g.shake = Math.max(0, g.shake - dt * 10);
    if (g.time - g.lastNearMiss > 4) g.combo = 0;

    const steer = Number(keys.right) - Number(keys.left);
    g.playerV += steer * 6.1 * dt;
    g.playerV *= Math.exp(-6.2 * dt);
    g.playerX += g.playerV * dt;
    if (g.playerX < -.83 || g.playerX > .83) {
      g.playerX = clamp(g.playerX, -.83, .83);
      g.playerV *= -.16;
      g.heat = clamp(g.heat + dt * 1.8, 0, 100);
    }

    g.spawnTimer -= dt;
    if (g.spawnTimer <= 0) spawnTraffic();
    const pY = playerY();
    const { h } = carSize();
    for (const car of g.traffic) {
      car.y += dt * (g.boosting ? .64 : .43 + Math.min(g.time * .0014, .12)) * car.speedFactor;
      const cy = car.y * height;
      const dx = Math.abs(car.x - g.playerX);
      if (!car.hit && g.invulnerable <= 0 && Math.abs(cy - pY) < h * .71 && dx < .315) {
        car.hit = true;
        car.checked = true;
        g.health--;
        g.heat = clamp(g.heat + (car.police ? 35 : 27), 0, 100);
        g.boost = Math.max(0, g.boost - 12);
        g.invulnerable = 1.5;
        g.flash = .78;
        g.shake = 7;
        g.playerV += (g.playerX >= car.x ? 1 : -1) * 1.5;
        makeSparks(roadX(g.playerX), pY, '#ffca68', 22);
        showToast(car.police ? 'POLICE HIT! +35 HEAT' : 'CRASH! +27 HEAT', 'bad');
        playTone(95, .25, 'sawtooth', .08);
        if (g.health <= 0) { end('health'); break; }
        if (g.heat >= 100) { end('heat'); break; }
      }
      if (!car.checked && cy > pY + h * .72) {
        car.checked = true;
        if (dx >= .315 && dx < .62) {
          g.nearMisses++;
          g.combo = Math.min(5, g.combo + 1);
          g.lastNearMiss = g.time;
          g.boost = clamp(g.boost + 22, 0, 100);
          g.heat = Math.max(0, g.heat - 3);
          g.score += 220 * g.combo;
          makeSparks(roadX(g.playerX), pY - h * .3, '#d9fa61', 8);
          showToast(g.combo >= 2 ? `CLOSE CALL ×${g.combo}  +${220 * g.combo}` : 'CLOSE CALL  +220');
          playTone(580 + g.combo * 90, .12, 'triangle', .045);
        }
      }
    }
    g.traffic = g.traffic.filter((car) => car.y < 1.27 && !car.hit);
    for (const particle of g.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
    }
    g.particles = g.particles.filter((p) => p.life > 0);
    if (g.heat >= 100) end('heat');
    updateHud();
  }

  function roundedRect(x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function strokeLine(x1, y1, x2, y2, color, lineWidth, glow = 0) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
    ctx.stroke(); ctx.shadowBlur = 0;
  }
  function building(side, row, offset, leftEdge, rightEdge) {
    const seed = Math.abs(Math.sin(row * 58.17 + (side === -1 ? 13 : 37)));
    const bw = Math.max(25, (width - roadWidth()) / 2 - 20);
    const x = side === -1 ? leftEdge - bw - 13 : rightEdge + 13;
    const y = row * 118 + offset;
    const hh = 93 + seed * 18;
    roundedRect(x, y, bw, hh, 4, seed > .5 ? '#151735' : '#11132c');
    ctx.fillStyle = '#232747';
    for (let k = 0; k < 3; k++) {
      for (let j = 0; j < Math.max(1, Math.floor((bw - 18) / 25)); j++) {
        const on = Math.sin(row * 14 + k * 8 + j * 6 + side * 3) > .14;
        ctx.fillStyle = on ? (seed > .48 ? '#8959a5' : '#267d9c') : '#272943';
        ctx.fillRect(x + 10 + j * 25, y + 15 + k * 22, 11, 8);
      }
    }
    if (seed > .75) {
      strokeLine(side === -1 ? x + bw : x, y + 9, side === -1 ? x + bw : x, y + hh - 9, side === -1 ? '#ff2c9b' : '#2fe6e9', 2, 13);
    }
  }
  function drawWorld() {
    const rw = roadWidth();
    const left = width / 2 - rw / 2;
    const right = width / 2 + rw / 2;
    ctx.fillStyle = '#090b20'; ctx.fillRect(0, 0, width, height);
    const offset = game.roadOffset % 118;
    for (let row = -2; row < Math.ceil(height / 118) + 1; row++) {
      building(-1, row + Math.floor(game.roadOffset / 118), offset, left, right);
      building(1, row + Math.floor(game.roadOffset / 118), offset, left, right);
    }
    const roadGradient = ctx.createLinearGradient(left, 0, right, 0);
    roadGradient.addColorStop(0, '#1a1d37'); roadGradient.addColorStop(.16, '#22243e');
    roadGradient.addColorStop(.5, '#23243d'); roadGradient.addColorStop(.84, '#22243e');
    roadGradient.addColorStop(1, '#1a1d37');
    ctx.fillStyle = roadGradient; ctx.fillRect(left, 0, rw, height);
    const wash = ctx.createLinearGradient(0, 0, 0, height);
    wash.addColorStop(0, 'rgba(252,30,151,.07)'); wash.addColorStop(.5, 'rgba(37,236,243,.02)'); wash.addColorStop(1, 'rgba(252,30,151,.06)');
    ctx.fillStyle = wash; ctx.fillRect(left, 0, rw, height);
    strokeLine(left + 3, 0, left + 3, height, '#ff3aa7', 4, 17);
    strokeLine(right - 3, 0, right - 3, height, '#35eaf7', 4, 17);
    strokeLine(left + 12, 0, left + 12, height, '#f3a3c9', 1);
    strokeLine(right - 12, 0, right - 12, height, '#99f3f7', 1);
    ctx.fillStyle = 'rgba(244,244,255,.30)';
    const dash = game.roadOffset % 92;
    for (let lane = 1; lane < 4; lane++) {
      const x = left + rw * lane / 4;
      for (let y = -92 + dash; y < height + 92; y += 92) roundedRect(x - 1, y, 2, 42, 1, 'rgba(243,245,255,.32)');
    }
    for (let y = -60 + (game.roadOffset % 120); y < height + 60; y += 120) {
      strokeLine(left - 9, y, left - 18, y + 20, '#ff3aa7', 2, 10);
      strokeLine(right + 9, y, right + 18, y + 20, '#35eaf7', 2, 10);
    }
    const centerGlow = ctx.createRadialGradient(width / 2, height * .72, 5, width / 2, height * .72, rw * .8);
    centerGlow.addColorStop(0, 'rgba(43,224,240,.045)'); centerGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = centerGlow; ctx.fillRect(left, 0, rw, height);
  }

  function drawCar(x, y, color, isPlayer = false, police = false, flash = false) {
    const { w, h } = carSize();
    ctx.save();
    ctx.translate(x, y);
    if (isPlayer) ctx.rotate(clamp(game.playerV * -.085, -.13, .13));
    ctx.shadowColor = color; ctx.shadowBlur = isPlayer ? 25 : 14;
    roundedRect(-w * .58, -h * .36, w * 1.16, h * .83, w * .15, 'rgba(0,0,0,.38)');
    ctx.shadowBlur = 0;
    roundedRect(-w * .5, -h * .5, w, h, w * .16, flash ? '#fff' : color);
    roundedRect(-w * .37, -h * .31, w * .74, h * .25, w * .07, isPlayer ? '#102d47' : '#17223c');
    roundedRect(-w * .34, h * .12, w * .68, h * .22, w * .07, isPlayer ? '#112941' : '#12192e');
    roundedRect(-w * .38, -h * .43, w * .76, h * .06, 2, isPlayer ? '#d8fff9' : '#d6e2ee');
    roundedRect(-w * .56, -h * .31, w * .1, h * .22, 2, '#0a0c1c');
    roundedRect(w * .46, -h * .31, w * .1, h * .22, 2, '#0a0c1c');
    roundedRect(-w * .56, h * .22, w * .1, h * .21, 2, '#0a0c1c');
    roundedRect(w * .46, h * .22, w * .1, h * .21, 2, '#0a0c1c');
    ctx.shadowBlur = 10; ctx.shadowColor = '#ff345d';
    ctx.fillStyle = '#ff415f'; ctx.fillRect(-w * .38, h * .43, w * .18, 4); ctx.fillRect(w * .2, h * .43, w * .18, 4);
    ctx.shadowBlur = 0;
    if (isPlayer) {
      roundedRect(-w * .12, -h * .45, w * .24, h * .73, 3, '#173249');
      strokeLine(-w * .17, -h * .18, -w * .17, h * .29, '#c7ffff', 2);
      strokeLine(w * .17, -h * .18, w * .17, h * .29, '#c7ffff', 2);
      if (game.boosting) {
        ctx.fillStyle = '#4ff4ff'; ctx.shadowColor = '#35eaf7'; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.moveTo(-w * .24, h * .48); ctx.lineTo(-w * .12, h * (.75 + Math.random() * .3)); ctx.lineTo(0, h * .48); ctx.fill();
        ctx.beginPath(); ctx.moveTo(w * .03, h * .48); ctx.lineTo(w * .2, h * (.75 + Math.random() * .3)); ctx.lineTo(w * .34, h * .48); ctx.fill();
      }
    }
    if (police) {
      roundedRect(-w * .34, -h * .04, w * .68, h * .11, 2, '#0a1130');
      const blink = Math.floor(ambientTime * 9) % 2 === 0;
      ctx.shadowBlur = 18;
      ctx.shadowColor = blink ? '#fe3772' : '#335fff';
      ctx.fillStyle = blink ? '#fe3772' : '#335fff';
      ctx.fillRect(-w * .27, -h * .03, w * .24, h * .07);
      ctx.shadowColor = blink ? '#335fff' : '#fe3772';
      ctx.fillStyle = blink ? '#335fff' : '#fe3772';
      ctx.fillRect(w * .03, -h * .03, w * .24, h * .07);
    }
    ctx.restore();
  }

  function draw() {
    ctx.save();
    if (game.shake > 0) ctx.translate(rand(-game.shake, game.shake), rand(-game.shake, game.shake));
    drawWorld();
    const pY = playerY();
    for (const car of game.traffic) drawCar(roadX(car.x), car.y * height, car.police ? '#e8eef8' : car.color, false, car.police);
    if (game.heat > 22 && game.phase !== 'menu') {
      const proximity = (game.heat - 22) / 78;
      const policeY = height * (1.17 - proximity * .17);
      ctx.save(); ctx.globalAlpha = .25 + proximity * .44;
      drawCar(roadX(game.playerX * .35), policeY, '#eef2ff', false, true);
      ctx.restore();
      if (game.heat > 65) {
        ctx.fillStyle = Math.floor(ambientTime * 5) % 2 ? 'rgba(255,30,98,.035)' : 'rgba(41,85,255,.035)';
        ctx.fillRect(0, 0, width, height);
      }
    }
    if (game.phase !== 'menu') {
      ctx.save();
      if (game.invulnerable > 0 && Math.floor(ambientTime * 12) % 2 === 0) ctx.globalAlpha = .46;
      drawCar(roadX(game.playerX), pY, '#35eaf7', true, false, game.flash > .5);
      ctx.restore();
    } else drawCar(roadX(0), pY, '#35eaf7', true);
    for (const p of game.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
    }
    ctx.globalAlpha = 1;
    if (game.flash > 0) {
      ctx.fillStyle = `rgba(255,45,125,${game.flash * .23})`;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }

  function loop(now) {
    const dt = Math.min(.033, Math.max(0, (now - (lastTime || now)) / 1000));
    lastTime = now;
    ambientTime += dt;
    if (game.phase === 'playing') update(dt);
    else if (game.phase === 'menu') game.roadOffset += dt * 110;
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function mapKey(code) {
    if (code === 'ArrowLeft' || code === 'KeyA') return 'left';
    if (code === 'ArrowRight' || code === 'KeyD') return 'right';
    if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') return 'boost';
    return null;
  }
  window.addEventListener('keydown', (event) => {
    const action = mapKey(event.code);
    if (action) {
      event.preventDefault();
      keys[action] = true;
    }
    if ((event.code === 'KeyP' || event.code === 'Escape') && !event.repeat) {
      if (game.phase === 'playing') pause(); else if (game.phase === 'paused') resume();
    }
    if (event.code === 'Enter' && !event.repeat) {
      if (game.phase === 'menu' || game.phase === 'ended') start();
      else if (game.phase === 'paused') resume();
    }
  });
  window.addEventListener('keyup', (event) => { const action = mapKey(event.code); if (action) keys[action] = false; });
  window.addEventListener('blur', () => { for (const key of Object.keys(keys)) keys[key] = false; if (game.phase === 'playing') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.phase === 'playing') pause(); });

  function bindHold(id, action) {
    const button = $(id);
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault(); button.setPointerCapture(event.pointerId);
      pointerHolds[action].add(event.pointerId); keys[action] = true; button.classList.add('pressed');
    });
    const release = (event) => {
      pointerHolds[action].delete(event.pointerId);
      keys[action] = pointerHolds[action].size > 0;
      button.classList.toggle('pressed', keys[action]);
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  }
  bindHold('leftButton', 'left'); bindHold('rightButton', 'right'); bindHold('touchBoost', 'boost');
  $('startButton').addEventListener('click', start);
  $('restartButton').addEventListener('click', start);
})();
