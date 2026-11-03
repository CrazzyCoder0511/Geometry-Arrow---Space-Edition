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
let planets = [];
let patternIndex = 0;
let nextObstacleId = 0;

const obstaclePatterns = [
  { type: 'gate', center: 0.50, gapRatio: 0.46 },
  { type: 'spike', edge: 'top', heightRatio: 0.19 },
  { type: 'gate', center: 0.38, gapRatio: 0.43 },
  { type: 'asteroid', y: 0.68, radius: 26 },
  { type: 'spike', edge: 'bottom', heightRatio: 0.2 },
  { type: 'gate', center: 0.62, gapRatio: 0.40 },
  { type: 'laser', center: 0.42, heightRatio: 0.31 },
  { type: 'asteroid', y: 0.32, radius: 29 },
];

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
  makePlanets();
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

function makePlanets() {
  planets = [
    { x: width * 0.88, y: height * 0.25, radius: Math.min(width * 0.15, 118), color: '#4c5279', ring: false },
    { x: width * 0.11, y: height * 0.78, radius: Math.min(width * 0.06, 48), color: '#4d6e82', ring: true },
    { x: width * 1.08, y: height * 0.84, radius: Math.min(width * 0.08, 62), color: '#704a70', ring: false },
  ];
}

function resetGame() {
  elapsed = 0;
  distance = 0;
  scroll = 0;
  spawnClock = 0;
  particles = [];
  obstacles = [];
  patternIndex = 0;
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
  const minimumSpawnGap = Math.max(160, Math.min(310, width * 0.38) - Math.min(elapsed * 0.35, 110));
  const obstacleTooClose = obstacles.some((obstacle) => obstacle.x > -130 && Math.abs(obstacle.x - x) < minimumSpawnGap);
  if (obstacleTooClose) return false;

  const difficulty = Math.min(elapsed / GAME_LENGTH, 1);
  const pattern = obstaclePatterns[patternIndex % obstaclePatterns.length];
  patternIndex += 1;
  const gap = Math.max(pattern.gapRatio * height - difficulty * 28, 94);
  const center = pattern.center ?? 0.5;

  if (pattern.type === 'gate') {
    obstacles.push({ id: nextObstacleId++, type: 'gate', x, gapY: center * height, gap, w: 48 });
  } else if (pattern.type === 'spike') {
    obstacles.push({ id: nextObstacleId++, type: 'spike', x, y: pattern.edge === 'top' ? 0 : height - 42, edge: pattern.edge, w: 70, h: pattern.heightRatio * height + difficulty * 25 });
  } else if (pattern.type === 'asteroid') {
    obstacles.push({ id: nextObstacleId++, type: 'asteroid', x, y: pattern.y * height, r: pattern.radius + difficulty * 5, spin: 0 });
  } else if (pattern.type === 'laser') {
    obstacles.push({ id: nextObstacleId++, type: 'laser', x, y: center * height, w: 22, h: pattern.heightRatio * height + difficulty * 30, phase: 0 });
  }
  return true;
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
  const speed = 290 + Math.min(elapsed * 1.8, 210);
  const distancePerSecond = speed / 29;
  distance += distancePerSecond * dt;
  scroll += speed * dt;
  spawnClock += dt;
  const spawnEvery = Math.max(0.62, 1.1 - elapsed / 600);
  if (spawnClock > spawnEvery) {
    spawnClock = 0;
    spawnObstacle();
  }

  const waveVelocity = boostHeld ? -0.78 : 0.78;
  rocket.vy += (waveVelocity - rocket.vy) * Math.min(dt * 22, 1);
  rocket.y += rocket.vy * dt;
  rocket.tilt += (((boostHeld ? -0.6 : 0.6) - rocket.tilt)) * Math.min(dt * 14, 1);
  rocket.trailClock += dt;
  if (rocket.trailClock > 0.035) {
    rocket.trailClock = 0;
    const trailX = rocket.x * width - 25;
    const trailY = rocket.y * height;
    particles.push({ x: trailX, y: trailY + (Math.random() - 0.5) * 6, life: 0.72, size: 4 + Math.random() * 4, color: '#ffb43d', kind: 'core' });
    particles.push({ x: trailX - 8, y: trailY + (Math.random() - 0.5) * 11, life: 0.52, size: 2 + Math.random() * 3, color: '#ff4f8d', kind: 'spark' });
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
  planets.forEach((planet) => {
    ctx.save();
    ctx.translate(planet.x - scroll * 0.035, planet.y);
    if (planet.ring) {
      ctx.strokeStyle = 'rgba(120, 215, 236, .23)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, planet.radius * 1.5, planet.radius * 0.32, -0.25, 0, TAU);
      ctx.stroke();
    }
    const planetGradient = ctx.createRadialGradient(-planet.radius * .35, -planet.radius * .38, planet.radius * .08, 0, 0, planet.radius);
    planetGradient.addColorStop(0, 'rgba(198, 211, 237, .55)');
    planetGradient.addColorStop(.36, planet.color);
    planetGradient.addColorStop(1, 'rgba(5, 6, 18, .96)');
    ctx.fillStyle = planetGradient;
    ctx.globalAlpha = 0.62;
    ctx.beginPath(); ctx.arc(0, 0, planet.radius, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = '#dce8ff';
    for (let crater = 0; crater < 4; crater += 1) {
      ctx.beginPath();
      ctx.arc((crater - 1.5) * planet.radius * .34, (crater % 2 ? .18 : -.2) * planet.radius, planet.radius * (.07 + crater * .01), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  });
  stars.forEach((star) => {
    const x = (star.x - scroll * 0.08 * star.speed) % (width + 20);
    const sx = x < 0 ? x + width + 20 : x;
    ctx.beginPath();
    ctx.arc(sx, star.y, star.r, 0, TAU);
    ctx.fillStyle = star.hue ? `rgba(120, 226, 255, ${star.alpha})` : `rgba(255,255,255,${star.alpha})`;
    ctx.fill();
  });
  ctx.fillStyle = 'rgba(2, 3, 14, .25)';
  ctx.fillRect(0, 0, width, 44);
  ctx.fillRect(0, height - 34, width, 34);
}

function drawParticles() {
  particles.forEach((p) => {
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    ctx.shadowBlur = p.kind === 'core' ? 20 : 12;
    ctx.shadowColor = p.color;
    ctx.beginPath();
    if (p.kind === 'core') {
      ctx.moveTo(p.x + p.size, p.y);
      ctx.lineTo(p.x - p.size, p.y - p.size * .55);
      ctx.lineTo(p.x - p.size * .55, p.y);
      ctx.lineTo(p.x - p.size, p.y + p.size * .55);
      ctx.closePath();
    } else {
      ctx.arc(p.x, p.y, p.size, 0, TAU);
    }
    ctx.fill();
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
  const color = '#ff3f56';
  ctx.fillStyle = 'rgba(112, 12, 34, .62)';
  ctx.fillRect(o.x, 0, o.w, o.gapY - o.gap / 2);
  ctx.fillRect(o.x, o.gapY + o.gap / 2, o.w, height - (o.gapY + o.gap / 2));
  glowStroke(color, 22); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(o.x + 3, 0); ctx.lineTo(o.x + 3, o.gapY - o.gap / 2); ctx.moveTo(o.x + 3, o.gapY + o.gap / 2); ctx.lineTo(o.x + 3, height); ctx.stroke(); clearGlow();
  ctx.fillStyle = color;
  ctx.fillRect(o.x - 5, o.gapY - o.gap / 2 - 4, o.w + 10, 8);
  ctx.fillRect(o.x - 5, o.gapY + o.gap / 2 - 4, o.w + 10, 8);
  ctx.fillStyle = 'rgba(255, 119, 131, .8)';
  ctx.fillRect(o.x + 10, 0, 3, Math.max(o.gapY - o.gap / 2 - 14, 0));
  ctx.fillRect(o.x + 10, o.gapY + o.gap / 2 + 14, 3, Math.max(height - o.gapY - o.gap / 2 - 14, 0));
  ctx.fillStyle = 'rgba(255, 235, 238, .72)';
  for (let y = 15; y < o.gapY - o.gap / 2 - 18; y += 27) {
    ctx.beginPath(); ctx.moveTo(o.x + o.w - 18, y); ctx.lineTo(o.x + o.w - 6, y + 6); ctx.lineTo(o.x + o.w - 18, y + 12); ctx.closePath(); ctx.fill();
  }
  for (let y = o.gapY + o.gap / 2 + 15; y < height - 12; y += 27) {
    ctx.beginPath(); ctx.moveTo(o.x + o.w - 18, y); ctx.lineTo(o.x + o.w - 6, y + 6); ctx.lineTo(o.x + o.w - 18, y + 12); ctx.closePath(); ctx.fill();
  }
}

function drawSpike(o) {
  const color = '#ff3f56';
  ctx.fillStyle = 'rgba(132, 15, 40, .58)';
  ctx.fillRect(o.x, o.edge === 'top' ? 0 : height - o.h, o.w, o.h);
  ctx.fillStyle = color; ctx.shadowBlur = 18; ctx.shadowColor = color;
  ctx.beginPath();
  if (o.edge === 'top') { ctx.moveTo(o.x, 0); ctx.lineTo(o.x + o.w, 0); ctx.lineTo(o.x + o.w / 2, o.h); }
  else { ctx.moveTo(o.x, height); ctx.lineTo(o.x + o.w, height); ctx.lineTo(o.x + o.w / 2, height - o.h); }
  ctx.closePath(); ctx.fill(); clearGlow();
  ctx.strokeStyle = 'rgba(255, 221, 225, .68)'; ctx.lineWidth = 2;
  ctx.beginPath();
  if (o.edge === 'top') { ctx.moveTo(o.x + 7, 9); ctx.lineTo(o.x + o.w / 2, o.h - 11); ctx.lineTo(o.x + o.w - 7, 9); }
  else { ctx.moveTo(o.x + 7, height - 9); ctx.lineTo(o.x + o.w / 2, height - o.h + 11); ctx.lineTo(o.x + o.w - 7, height - 9); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 238, 240, .65)';
  const stripeY = o.edge === 'top' ? Math.min(o.h * .38, 34) : height - Math.min(o.h * .38, 34);
  ctx.fillRect(o.x + 10, stripeY, o.w - 20, 3);
}

function drawAsteroid(o) {
  ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.spin);
  const color = '#ff3f56';
  ctx.fillStyle = 'rgba(156, 24, 45, .62)';
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowBlur = 15; ctx.shadowColor = color;
  ctx.beginPath();
  for (let i = 0; i < 9; i += 1) { const a = (i / 9) * TAU; const radius = o.r * (0.78 + ((i * 17) % 5) / 14); const px = Math.cos(a) * radius; const py = Math.sin(a) * radius; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
  ctx.closePath(); ctx.fill(); ctx.stroke(); clearGlow();
  ctx.fillStyle = 'rgba(255, 190, 198, .3)';
  ctx.beginPath(); ctx.moveTo(-o.r * .55, -o.r * .12); ctx.lineTo(-o.r * .08, -o.r * .58); ctx.lineTo(o.r * .08, -o.r * .08); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(65, 6, 24, .52)';
  ctx.beginPath(); ctx.moveTo(o.r * .05, -o.r * .08); ctx.lineTo(o.r * .5, -o.r * .32); ctx.lineTo(o.r * .35, o.r * .28); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255, 230, 232, .5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-o.r * .55, -o.r * .12); ctx.lineTo(-o.r * .08, -o.r * .58); ctx.lineTo(o.r * .08, -o.r * .08); ctx.stroke();
  ctx.restore();
}

function drawLaser(o) {
  const color = '#ff3f56';
  const pulse = Math.sin(o.phase) * 0.18 + 0.82;
  ctx.fillStyle = `rgba(255, 63, 86, ${0.14 * pulse})`;
  ctx.fillRect(o.x - o.w, o.y - o.h / 2, o.w * 2, o.h);
  glowStroke(color, 26); ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(o.x, o.y - o.h / 2); ctx.lineTo(o.x, o.y + o.h / 2); ctx.stroke(); clearGlow();
  ctx.strokeStyle = 'rgba(255, 226, 230, .8)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(o.x, o.y - o.h / 2 + 10); ctx.lineTo(o.x, o.y + o.h / 2 - 10); ctx.stroke();
  ctx.fillStyle = '#ffb9c1';
  ctx.beginPath(); ctx.moveTo(o.x - 9, o.y - o.h / 2 - 4); ctx.lineTo(o.x, o.y - o.h / 2 - 13); ctx.lineTo(o.x + 9, o.y - o.h / 2 - 4); ctx.lineTo(o.x + 9, o.y - o.h / 2 + 5); ctx.lineTo(o.x - 9, o.y - o.h / 2 + 5); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(o.x - 9, o.y + o.h / 2 + 4); ctx.lineTo(o.x, o.y + o.h / 2 + 13); ctx.lineTo(o.x + 9, o.y + o.h / 2 + 4); ctx.lineTo(o.x + 9, o.y + o.h / 2 - 5); ctx.lineTo(o.x - 9, o.y + o.h / 2 - 5); ctx.closePath(); ctx.fill();
}

function drawRocket() {
  const x = rocket.x * width;
  const y = rocket.y * height;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rocket.tilt * 0.45);
  ctx.shadowBlur = 26; ctx.shadowColor = '#ff9945';
  ctx.fillStyle = '#ffb43d';
  ctx.beginPath(); ctx.moveTo(-22, -6); ctx.lineTo(-48, 0); ctx.lineTo(-22, 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff0a8';
  ctx.beginPath(); ctx.moveTo(-23, -3); ctx.lineTo(-39, 0); ctx.lineTo(-23, 3); ctx.closePath(); ctx.fill();

  ctx.shadowBlur = 22; ctx.shadowColor = '#9b55ff';
  const body = ctx.createLinearGradient(-19, -12, 26, 12);
  body.addColorStop(0, '#6030c6'); body.addColorStop(.5, '#a55bff'); body.addColorStop(1, '#ead7ff');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-20, -12); ctx.lineTo(8, -12); ctx.lineTo(29, 0); ctx.lineTo(8, 12); ctx.lineTo(-20, 12); ctx.lineTo(-12, 0); ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,.52)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-10, -9); ctx.lineTo(8, -9); ctx.lineTo(22, 0); ctx.lineTo(8, 9); ctx.lineTo(-10, 9); ctx.stroke();

  ctx.fillStyle = '#b978ff';
  ctx.beginPath(); ctx.moveTo(-5, -11); ctx.lineTo(-14, -23); ctx.lineTo(8, -12); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-5, 11); ctx.lineTo(-14, 23); ctx.lineTo(8, 12); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#6d3ad4';
  ctx.beginPath(); ctx.moveTo(-14, -12); ctx.lineTo(-24, -18); ctx.lineTo(-19, -5); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-14, 12); ctx.lineTo(-24, 18); ctx.lineTo(-19, 5); ctx.closePath(); ctx.fill();

  ctx.shadowBlur = 12; ctx.shadowColor = '#59eaff';
  ctx.fillStyle = '#c8f9ff'; ctx.beginPath(); ctx.arc(10, 0, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = '#26347c'; ctx.beginPath(); ctx.arc(11, -1, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(9.5, -2.5, 1.4, 0, TAU); ctx.fill();
  clearGlow(); ctx.restore();
}

function drawIdleMotif() {
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = 'rgba(103, 232, 255, .22)'; ctx.setLineDash([5, 10]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(width * .2, height * .5, 54, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
}

function boostRocket() {
  if (gameState !== 'playing') return;
  boostHeld = true;
}

function setBoost(value) { if (gameState === 'playing') boostHeld = value; }
startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', startGame);
window.addEventListener('keydown', (event) => { if (event.code === 'Space' || event.code === 'ArrowUp') { event.preventDefault(); if (gameState === 'ready' || gameState === 'complete' || gameState === 'crashed') startGame(); else if (!event.repeat) boostRocket(); } });
window.addEventListener('keyup', (event) => { if (event.code === 'Space' || event.code === 'ArrowUp') setBoost(false); });
canvas.addEventListener('pointerdown', () => { if (gameState === 'ready' || gameState === 'complete' || gameState === 'crashed') startGame(); else boostRocket(); });
window.addEventListener('pointerup', () => setBoost(false));
window.addEventListener('resize', resize);

resize(); resetGame(); draw();
