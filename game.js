const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const playerHealthEl = document.getElementById("player-health");
const enemyHealthEl = document.getElementById("enemy-health");
const statusEl = document.getElementById("status");
const restartBtn = document.getElementById("restart-btn");

const WORLD_MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 0, 0, 1, 1, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

const CONFIG = {
  fov: Math.PI / 3,
  moveSpeed: 2.5,
  rotateSpeed: 2.2,
  shotCooldownMs: 350,
  playerDamage: 25,
  enemyDamage: 10,
  enemyAttackCooldownMs: 900,
};

const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
};

let state = createInitialState();
let lastFrameMs = performance.now();

function createInitialState() {
  return {
    player: {
      x: 2,
      y: 2,
      angle: 0,
      health: 100,
      canShootAt: 0,
    },
    enemy: {
      x: 7.5,
      y: 7.5,
      angle: Math.PI,
      health: 100,
      attackAt: 0,
      strafeDir: 1,
    },
    over: false,
    winner: "",
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle) {
  let a = angle % (Math.PI * 2);
  if (a < -Math.PI) a += Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  return a;
}

function isWall(x, y) {
  const gridX = Math.floor(x);
  const gridY = Math.floor(y);
  if (gridY < 0 || gridY >= WORLD_MAP.length || gridX < 0 || gridX >= WORLD_MAP[0].length) {
    return true;
  }
  return WORLD_MAP[gridY][gridX] === 1;
}

function moveWithCollision(entity, dx, dy) {
  const nextX = entity.x + dx;
  const nextY = entity.y + dy;

  if (!isWall(nextX, entity.y)) {
    entity.x = nextX;
  }
  if (!isWall(entity.x, nextY)) {
    entity.y = nextY;
  }
}

function castRay(originX, originY, angle, maxDistance = 20) {
  const stepSize = 0.02;
  let distance = 0;
  while (distance < maxDistance) {
    distance += stepSize;
    const testX = originX + Math.cos(angle) * distance;
    const testY = originY + Math.sin(angle) * distance;
    if (isWall(testX, testY)) {
      return distance;
    }
  }
  return maxDistance;
}

function updatePlayer(dt, nowMs) {
  const player = state.player;
  const moveStep = CONFIG.moveSpeed * dt;
  const turnStep = CONFIG.rotateSpeed * dt;

  if (keys.ArrowLeft) player.angle -= turnStep;
  if (keys.ArrowRight) player.angle += turnStep;

  let dx = 0;
  let dy = 0;

  if (keys.ArrowUp) {
    dx += Math.cos(player.angle) * moveStep;
    dy += Math.sin(player.angle) * moveStep;
  }
  if (keys.ArrowDown) {
    dx -= Math.cos(player.angle) * moveStep;
    dy -= Math.sin(player.angle) * moveStep;
  }

  moveWithCollision(player, dx, dy);
  player.angle = normalizeAngle(player.angle);

  if (nowMs >= player.canShootAt) {
    statusEl.textContent = state.over ? statusEl.textContent : "Fight!";
  }
}

function enemyCanSeePlayer() {
  const enemy = state.enemy;
  const player = state.player;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy);
  const towardPlayer = Math.atan2(dy, dx);
  const wallDistance = castRay(enemy.x, enemy.y, towardPlayer, 20);
  return wallDistance >= distance - 0.1;
}

function updateEnemy(dt, nowMs) {
  const enemy = state.enemy;
  const player = state.player;
  if (enemy.health <= 0) return;

  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy);
  const angleToPlayer = Math.atan2(dy, dx);
  enemy.angle = angleToPlayer;

  const chaseSpeed = 1.5 * dt;
  const strafeSpeed = 1.1 * dt;

  // Enemy chases when far and strafes when near.
  if (distance > 2.2) {
    moveWithCollision(enemy, Math.cos(angleToPlayer) * chaseSpeed, Math.sin(angleToPlayer) * chaseSpeed);
  } else {
    const sideAngle = angleToPlayer + Math.PI / 2;
    moveWithCollision(enemy, Math.cos(sideAngle) * strafeSpeed * enemy.strafeDir, Math.sin(sideAngle) * strafeSpeed * enemy.strafeDir);
    if (Math.random() < 0.02) {
      enemy.strafeDir *= -1;
    }
  }

  if (distance <= 4.5 && enemyCanSeePlayer() && nowMs >= enemy.attackAt) {
    state.player.health = clamp(state.player.health - CONFIG.enemyDamage, 0, 100);
    enemy.attackAt = nowMs + CONFIG.enemyAttackCooldownMs;
    statusEl.textContent = "Enemy hit you!";
  }
}

function tryShoot(nowMs) {
  if (state.over) return;
  const player = state.player;
  if (nowMs < player.canShootAt) return;

  player.canShootAt = nowMs + CONFIG.shotCooldownMs;
  const enemy = state.enemy;

  const dx = enemy.x - player.x;
  const dy = enemy.y - player.y;
  const distance = Math.hypot(dx, dy);
  const angleToEnemy = Math.atan2(dy, dx);
  const angleDiff = Math.abs(normalizeAngle(angleToEnemy - player.angle));
  const wallDistance = castRay(player.x, player.y, player.angle, 20);

  const onTarget = angleDiff < 0.12 && distance < wallDistance + 0.05 && distance < 9;

  if (onTarget && enemy.health > 0) {
    enemy.health = clamp(enemy.health - CONFIG.playerDamage, 0, 100);
    statusEl.textContent = "Direct hit!";
  } else {
    statusEl.textContent = "Missed shot";
  }
}

function evaluateWinState() {
  if (state.over) return;
  if (state.enemy.health <= 0) {
    state.over = true;
    state.winner = "player";
    statusEl.textContent = "You Win!";
  } else if (state.player.health <= 0) {
    state.over = true;
    state.winner = "enemy";
    statusEl.textContent = "You Lose!";
  }
}

function drawBackground() {
  const { width, height } = canvas;
  ctx.fillStyle = "#4a6ea8";
  ctx.fillRect(0, 0, width, height / 2);
  ctx.fillStyle = "#2f3d24";
  ctx.fillRect(0, height / 2, width, height / 2);
}

function drawWalls(depthBuffer) {
  const { width, height } = canvas;

  for (let x = 0; x < width; x += 1) {
    const cameraX = (2 * x) / width - 1;
    const rayAngle = state.player.angle + Math.atan(cameraX * Math.tan(CONFIG.fov / 2));
    const rawDistance = castRay(state.player.x, state.player.y, rayAngle, 20);
    const distance = rawDistance * Math.cos(rayAngle - state.player.angle);
    depthBuffer[x] = distance;

    const wallHeight = clamp((height * 0.9) / distance, 0, height);
    const yStart = (height - wallHeight) / 2;
    const shade = Math.floor(clamp(230 - distance * 28, 20, 230));
    ctx.fillStyle = `rgb(${shade}, ${shade - 10}, ${shade - 25})`;
    ctx.fillRect(x, yStart, 1, wallHeight);
  }
}

function drawEnemy(depthBuffer) {
  const { width, height } = canvas;
  const player = state.player;
  const enemy = state.enemy;
  if (enemy.health <= 0) return;

  const dx = enemy.x - player.x;
  const dy = enemy.y - player.y;
  const distance = Math.hypot(dx, dy);
  const angleToEnemy = Math.atan2(dy, dx);
  const relAngle = normalizeAngle(angleToEnemy - player.angle);
  if (Math.abs(relAngle) > CONFIG.fov / 1.8) return;

  const wallInDirection = castRay(player.x, player.y, angleToEnemy, 20);
  if (wallInDirection < distance - 0.1) return;

  const spriteHeight = clamp((height * 0.8) / distance, 12, height * 0.95);
  const spriteWidth = spriteHeight * 0.6;
  const screenX = (relAngle / (CONFIG.fov / 2)) * (width / 2) + width / 2;
  const leftX = Math.floor(screenX - spriteWidth / 2);
  const rightX = Math.floor(screenX + spriteWidth / 2);
  const topY = Math.floor((height - spriteHeight) / 2);

  for (let x = leftX; x <= rightX; x += 1) {
    if (x < 0 || x >= width) continue;
    if (depthBuffer[x] < distance) continue;

    const bodyShade = Math.floor(clamp(255 - distance * 28, 45, 255));
    ctx.fillStyle = `rgb(${bodyShade}, 55, 55)`;
    ctx.fillRect(x, topY, 1, spriteHeight);
  }
}

function drawWeaponOverlay() {
  const { width, height } = canvas;
  const baseY = height - 6;
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.moveTo(width * 0.35, baseY);
  ctx.lineTo(width * 0.42, height * 0.68);
  ctx.lineTo(width * 0.58, height * 0.68);
  ctx.lineTo(width * 0.65, baseY);
  ctx.closePath();
  ctx.fill();
}

function render() {
  drawBackground();
  const depthBuffer = new Array(canvas.width).fill(999);
  drawWalls(depthBuffer);
  drawEnemy(depthBuffer);
  drawWeaponOverlay();
}

function updateHud() {
  playerHealthEl.textContent = `Player HP: ${Math.round(state.player.health)}`;
  enemyHealthEl.textContent = `Enemy HP: ${Math.round(state.enemy.health)}`;
}

function gameLoop(nowMs) {
  const dt = Math.min(0.05, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;

  if (!state.over) {
    updatePlayer(dt, nowMs);
    updateEnemy(dt, nowMs);
    evaluateWinState();
  }

  updateHud();
  render();
  requestAnimationFrame(gameLoop);
}

function resetGame() {
  state = createInitialState();
  updateHud();
  statusEl.textContent = "Fight!";
}

document.addEventListener("keydown", (event) => {
  if (event.code in keys) {
    keys[event.code] = true;
    event.preventDefault();
  }
  if (event.code === "Space") {
    tryShoot(performance.now());
    event.preventDefault();
  }
});

document.addEventListener("keyup", (event) => {
  if (event.code in keys) {
    keys[event.code] = false;
    event.preventDefault();
  }
});

restartBtn.addEventListener("click", resetGame);

updateHud();
requestAnimationFrame(gameLoop);
