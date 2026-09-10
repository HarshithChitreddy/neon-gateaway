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
})();
