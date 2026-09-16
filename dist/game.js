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
})();
