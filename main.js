import './style.css';

const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d');
const startButton = document.querySelector('#startButton');
const restartButton = document.querySelector('#restartButton');
const introOverlay = document.querySelector('#introOverlay');
const resultOverlay = document.querySelector('#resultOverlay');
const distanceValue = document.querySelector('#distanceValue');
const finalDistance = document.querySelector('#finalDistance');
const timerValue = document.querySelector('#timerValue');
const progressFill = document.querySelector('#progressFill');
const resultStatus = document.querySelector('#resultStatus');
const resultCopy = document.querySelector('#resultCopy');

const TAU = Math.PI * 2;
const GAME_LENGTH = 180;
let width = 960;
let height = 520;
let dpr = Math.min(window.devicePixelRatio || 1, 2);
let raf = 0;
let lastTime = 0;
let gameState = 'ready';
let elapsed = 0;
let distance = 0;
let scroll = 0;
let spawnClock = 0;
let boostHeld = false;
let stars = [];
let particles = [];
let obstacles = [];
let nebulae = [];
let nextObstacleId = 0;

const rocket = { x: 0.2, y: 0.5, vy: 0, tilt: 0, trailClock: 0 };

function resize() {
  const rect = canvas.getBoundingClientRect();
  width = Math.max(rect.width, 320);
  height = Math.max(rect.height, 300);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  makeStars();
  makeNebulae();
}

function makeStars() {
  const count = Math.floor((width * height) / 5200);
  stars = Array.from({ length: count }, (_, i) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() * 1.5 + 0.25,
    alpha: Math.random() * 0.7 + 0.15,
    speed: Math.random() * 0.7 + 0.25,
    hue: i % 7 === 0 ? 190 : 0,
  }));
}

function makeNebulae() {
  nebulae = [
    { x: width * 0.76, y: height * 0.24, radius: width * 0.38, color: 'rgba(72, 40, 168, .13)' },
    { x: width * 0.23, y: height * 0.72, radius: width * 0.27, color: 'rgba(0, 135, 177, .11)' },
    { x: width * 0.96, y: height * 0.78, radius: width * 0.24, color: 'rgba(204, 44, 112, .09)' },
  ];
}

function resetGame() {
  elapsed = 0;
  distance = 0;
  scroll = 0;
  spawnClock = 0;
  particles = [];
  obstacles = [];
  rocket.y = 0.5;
  rocket.vy = 0;
  rocket.tilt = 0;
  rocket.trailClock = 0;
  nextObstacleId = 0;
  for (let i = 0; i < 4; i += 1) spawnObstacle(width * (0.9 + i * 0.56));
  updateHud();
}

function startGame() {
  resetGame();
  gameState = 'playing';
  introOverlay.classList.add('hidden');
  resultOverlay.classList.add('hidden');
  lastTime = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

function endGame(completed) {
  gameState = completed ? 'complete' : 'crashed';
  boostHeld = false;
  finalDistance.textContent = String(Math.floor(distance)).padStart(4, '0');
  resultStatus.textContent = completed ? 'MISSION COMPLETE' : 'SIGNAL LOST';
  resultStatus.classList.toggle('danger', !completed);
  resultCopy.textContent = completed
    ? 'You crossed the sector before the clock ran out.'
    : 'Your rocket clipped an obstacle. The nebula is still waiting.';
  resultOverlay.classList.remove('hidden');
  updateHud();
}

function spawnObstacle(x = width + 100) {
  const difficulty = Math.min(elapsed / GAME_LENGTH, 1);
  const lane = Math.random();
  const gap = Math.max(130 - difficulty * 30, 94);
  const center = 0.25 + Math.random() * 0.5;
  const typeRoll = Math.random();
  if (typeRoll < 0.26) {
    obstacles.push({ id: nextObstacleId++, type: 'gate', x, gapY: center * height, gap, w: 48, hue: Math.random() > 0.5 ? 'violet' : 'cyan' });
  } else if (typeRoll < 0.53) {
    obstacles.push({ id: nextObstacleId++, type: 'spike', x, y: lane < 0.5 ? 0 : height - 42, edge: lane < 0.5 ? 'top' : 'bottom', w: 70, h: 90 + difficulty * 25 });
  } else if (typeRoll < 0.76) {
    obstacles.push({ id: nextObstacleId++, type: 'asteroid', x, y: 90 + Math.random() * (height - 180), r: 22 + Math.random() * 17, spin: Math.random() * TAU, hue: Math.random() > 0.5 ? 'pink' : 'gold' });
  } else {
    obstacles.push({ id: nextObstacleId++, type: 'laser', x, y: center * height, w: 22, h: 130 + Math.random() * 60, phase: Math.random() * TAU });
  }
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.04);
  lastTime = now;
  if (gameState === 'playing') update(dt);
  draw();
  if (gameState === 'playing') raf = requestAnimationFrame(loop);
}

function update(dt) {
  elapsed += dt;
  const speed = 250 + Math.min(elapsed * 1.65, 185);
  const distancePerSecond = speed / 29;
  distance += distancePerSecond * dt;
  scroll += speed * dt;
  spawnClock += dt;
  const spawnEvery = Math.max(0.62, 1.1 - elapsed / 600);
  if (spawnClock > spawnEvery) {
    spawnClock = 0;
    spawnObstacle();
  }

  const gravity = 0.88;
  const lift = boostHeld ? -1.7 : 0;
  rocket.vy += (gravity + lift) * dt;
  rocket.vy = Math.max(-0.92, Math.min(0.92, rocket.vy));
  rocket.y += rocket.vy * dt;
  rocket.tilt += ((rocket.vy * 0.72) - rocket.tilt) * Math.min(dt * 10, 1);
  rocket.trailClock += dt;
  if (rocket.trailClock > 0.035) {
    rocket.trailClock = 0;
    particles.push({ x: rocket.x * width - 22, y: rocket.y * height + (Math.random() - 0.5) * 8, life: 0.7, size: 3 + Math.random() * 4, color: Math.random() > 0.4 ? '#ffb643' : '#ff5d8f' });
  }

  obstacles.forEach((obstacle) => {
    obstacle.x -= speed * dt;
    if (obstacle.type === 'asteroid') obstacle.spin += dt * 1.6;
    if (obstacle.type === 'laser') obstacle.phase += dt * 2;
  });
  obstacles = obstacles.filter((obstacle) => obstacle.x > -130);
  particles.forEach((particle) => { particle.x -= speed * 0.65 * dt; particle.life -= dt; particle.size *= 0.99; });
  particles = particles.filter((particle) => particle.life > 0);

  if (rocket.y < 0.045 || rocket.y > 0.955 || collides()) endGame(false);
  if (elapsed >= GAME_LENGTH) endGame(true);
  updateHud();
}

function collides() {
  const rx = rocket.x * width;
  const ry = rocket.y * height;
  const rw = 30;
  const rh = 20;
  return obstacles.some((o) => {
    if (o.type === 'gate') {
      const inX = rx + rw > o.x && rx - rw < o.x + o.w;
      const outsideGap = ry - rh < o.gapY - o.gap / 2 || ry + rh > o.gapY + o.gap / 2;
      return inX && outsideGap;
    }
    if (o.type === 'spike') {
      const inX = rx + rw > o.x && rx - rw < o.x + o.w;
      const inY = o.edge === 'top' ? ry - rh < o.h : ry + rh > height - o.h;
      return inX && inY;
    }
    if (o.type === 'asteroid') return Math.hypot(rx - o.x, ry - o.y) < o.r + 17;
    const inX = rx + rw > o.x - o.w / 2 && rx - rw < o.x + o.w / 2;
    return inX && Math.abs(ry - o.y) < o.h / 2 + rh;
  });
}

function updateHud() {
  distanceValue.textContent = String(Math.floor(distance)).padStart(4, '0');
  finalDistance.textContent = String(Math.floor(distance)).padStart(4, '0');
  const remaining = Math.max(0, Math.ceil(GAME_LENGTH - elapsed));
  const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
  const secs = (remaining % 60).toString().padStart(2, '0');
  timerValue.textContent = `${mins}:${secs}`;
  timerValue.classList.toggle('urgent', remaining <= 20 && gameState === 'playing');
  progressFill.style.width = `${Math.min((elapsed / GAME_LENGTH) * 100, 100)}%`;
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  drawSpace();
  drawParticles();
  drawObstacles();
  drawRocket();
  if (gameState === 'ready') drawIdleMotif();
}

function drawSpace() {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#060817');
  gradient.addColorStop(0.48, '#080b23');
  gradient.addColorStop(1, '#0d071a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  nebulae.forEach((nebula) => {
    const g = ctx.createRadialGradient(nebula.x, nebula.y, 0, nebula.x, nebula.y, nebula.radius);
    g.addColorStop(0, nebula.color);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  });
  stars.forEach((star) => {
    const x = (star.x - scroll * 0.08 * star.speed) % (width + 20);
    const sx = x < 0 ? x + width + 20 : x;
    ctx.beginPath();
    ctx.arc(sx, star.y, star.r, 0, TAU);
    ctx.fillStyle = star.hue ? `rgba(120, 226, 255, ${star.alpha})` : `rgba(255,255,255,${star.alpha})`;
    ctx.fill();
  });
  ctx.strokeStyle = 'rgba(128, 154, 205, .07)';
  ctx.lineWidth = 1;
  for (let y = 44; y < height; y += 72) {
    const offset = (scroll * 0.14) % 90;
    ctx.beginPath(); ctx.moveTo(0, y + offset); ctx.lineTo(width, y + offset); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(2, 3, 14, .25)';
  ctx.fillRect(0, 0, width, 44);
  ctx.fillRect(0, height - 34, width, 34);
}

function drawParticles() {
  particles.forEach((p) => {
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    ctx.shadowBlur = 14;
    ctx.shadowColor = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
  });
  ctx.globalAlpha = 1;
}

function drawObstacles() {
  obstacles.forEach((o) => {
    if (o.type === 'gate') drawGate(o);
    if (o.type === 'spike') drawSpike(o);
    if (o.type === 'asteroid') drawAsteroid(o);
    if (o.type === 'laser') drawLaser(o);
  });
}

function glowStroke(color, blur = 16) { ctx.strokeStyle = color; ctx.shadowBlur = blur; ctx.shadowColor = color; }
function clearGlow() { ctx.shadowBlur = 0; }

function drawGate(o) {
  const color = o.hue === 'violet' ? '#c65dff' : '#44e5ff';
  ctx.fillStyle = o.hue === 'violet' ? 'rgba(146, 51, 211, .18)' : 'rgba(21, 158, 195, .18)';
  ctx.fillRect(o.x, 0, o.w, o.gapY - o.gap / 2);
  ctx.fillRect(o.x, o.gapY + o.gap / 2, o.w, height - (o.gapY + o.gap / 2));
  glowStroke(color, 20); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(o.x + 3, 0); ctx.lineTo(o.x + 3, o.gapY - o.gap / 2); ctx.moveTo(o.x + 3, o.gapY + o.gap / 2); ctx.lineTo(o.x + 3, height); ctx.stroke(); clearGlow();
  ctx.fillStyle = color; ctx.fillRect(o.x - 4, o.gapY - o.gap / 2 - 3, o.w + 8, 6); ctx.fillRect(o.x - 4, o.gapY + o.gap / 2 - 3, o.w + 8, 6);
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(o.x + 14, o.gapY - o.gap / 2 + 13, 2, 18); ctx.fillRect(o.x + 14, o.gapY + o.gap / 2 - 31, 2, 18);
}

function drawSpike(o) {
  const color = '#ff4f8b';
  ctx.fillStyle = 'rgba(221, 35, 114, .25)';
  ctx.fillRect(o.x, o.edge === 'top' ? 0 : height - o.h, o.w, o.h);
  ctx.fillStyle = color; ctx.shadowBlur = 18; ctx.shadowColor = color;
  ctx.beginPath();
  if (o.edge === 'top') { ctx.moveTo(o.x, 0); ctx.lineTo(o.x + o.w, 0); ctx.lineTo(o.x + o.w / 2, o.h); }
  else { ctx.moveTo(o.x, height); ctx.lineTo(o.x + o.w, height); ctx.lineTo(o.x + o.w / 2, height - o.h); }
  ctx.closePath(); ctx.fill(); clearGlow();
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(o.x + 7, o.edge === 'top' ? 8 : height - 8); ctx.lineTo(o.x + o.w - 7, o.edge === 'top' ? 8 : height - 8); ctx.stroke();
}

function drawAsteroid(o) {
  ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.spin);
  const color = o.hue === 'pink' ? '#ff6b9e' : '#ffbe5b';
  ctx.fillStyle = o.hue === 'pink' ? 'rgba(159, 42, 99, .55)' : 'rgba(168, 93, 32, .6)';
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowBlur = 15; ctx.shadowColor = color;
  ctx.beginPath();
  for (let i = 0; i < 9; i += 1) { const a = (i / 9) * TAU; const radius = o.r * (0.78 + ((i * 17) % 5) / 14); const px = Math.cos(a) * radius; const py = Math.sin(a) * radius; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
  ctx.closePath(); ctx.fill(); ctx.stroke(); clearGlow();
  ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.arc(-o.r * .25, -o.r * .25, o.r * .16, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawLaser(o) {
  const color = '#69e8ff';
  const pulse = Math.sin(o.phase) * 0.18 + 0.82;
  ctx.fillStyle = `rgba(57, 207, 239, ${0.12 * pulse})`;
  ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
  glowStroke(color, 22); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(o.x, o.y - o.h / 2); ctx.lineTo(o.x, o.y + o.h / 2); ctx.stroke(); clearGlow();
  ctx.fillStyle = '#d2fbff'; ctx.fillRect(o.x - 5, o.y - o.h / 2 - 5, 10, 10); ctx.fillRect(o.x - 5, o.y + o.h / 2 - 5, 10, 10);
}

function drawRocket() {
  const x = rocket.x * width;
  const y = rocket.y * height;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rocket.tilt * 0.45);
  ctx.fillStyle = 'rgba(255, 155, 61, .35)'; ctx.shadowBlur = 22; ctx.shadowColor = '#ff7b45';
  ctx.beginPath(); ctx.moveTo(-22, -6); ctx.lineTo(-43, 0); ctx.lineTo(-22, 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffae3d'; ctx.beginPath(); ctx.moveTo(-21, -4); ctx.lineTo(-35, 0); ctx.lineTo(-21, 4); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 17; ctx.shadowColor = '#c85cff';
  const body = ctx.createLinearGradient(-18, 0, 22, 0); body.addColorStop(0, '#7e3fff'); body.addColorStop(1, '#e9a8ff'); ctx.fillStyle = body;
  ctx.beginPath(); ctx.moveTo(-19, -11); ctx.lineTo(8, -10); ctx.quadraticCurveTo(20, -8, 28, 0); ctx.quadraticCurveTo(20, 8, 8, 10); ctx.lineTo(-19, 11); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f2c8ff'; ctx.beginPath(); ctx.arc(8, 0, 6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2b1b62'; ctx.beginPath(); ctx.arc(9, 0, 3.1, 0, TAU); ctx.fill();
  ctx.fillStyle = '#b46aff'; ctx.beginPath(); ctx.moveTo(-4, -10); ctx.lineTo(-11, -19); ctx.lineTo(6, -10); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(-4, 10); ctx.lineTo(-11, 19); ctx.lineTo(6, 10); ctx.closePath(); ctx.fill();
  clearGlow(); ctx.restore();
}

function drawIdleMotif() {
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = 'rgba(103, 232, 255, .22)'; ctx.setLineDash([5, 10]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(width * .2, height * .5, 54, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
}

function setBoost(value) { if (gameState === 'playing') boostHeld = value; }
startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', startGame);
window.addEventListener('keydown', (event) => { if (event.code === 'Space' || event.code === 'ArrowUp') { event.preventDefault(); if (gameState === 'ready' || gameState === 'complete' || gameState === 'crashed') startGame(); else setBoost(true); } });
window.addEventListener('keyup', (event) => { if (event.code === 'Space' || event.code === 'ArrowUp') setBoost(false); });
canvas.addEventListener('pointerdown', () => { if (gameState === 'ready' || gameState === 'complete' || gameState === 'crashed') startGame(); else setBoost(true); });
window.addEventListener('pointerup', () => setBoost(false));
window.addEventListener('resize', resize);

resize(); resetGame(); draw();
