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
})();
