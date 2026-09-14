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
})();
