const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  health: document.getElementById("health"),
  score: document.getElementById("score"),
};

const world = {
  width: canvas.width,
  height: canvas.height,
};

const keys = new Set();
const enemies = [];
const bullets = [];

const player = {
  x: world.width / 2,
  y: world.height / 2,
  radius: 14,
  speed: 220,
  health: 100,
  maxHealth: 100,
  fireCooldown: 0,
};

const gameState = {
  lastTime: 0,
  spawnTimer: 0,
  spawnInterval: 1.2,
  score: 0,
  gameOver: false,
};

const settings = {
  enemySpeed: 80,
  enemyRadius: 12,
  bulletSpeed: 420,
  bulletRadius: 4,
  bulletDamage: 34,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function spawnEnemy() {
  const edge = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;

  if (edge === 0) {
    x = Math.random() * world.width;
    y = -settings.enemyRadius * 2;
  } else if (edge === 1) {
    x = world.width + settings.enemyRadius * 2;
    y = Math.random() * world.height;
  } else if (edge === 2) {
    x = Math.random() * world.width;
    y = world.height + settings.enemyRadius * 2;
  } else {
    x = -settings.enemyRadius * 2;
    y = Math.random() * world.height;
  }

  enemies.push({
    x,
    y,
    radius: settings.enemyRadius,
    speed: settings.enemySpeed + Math.random() * 40,
    health: 60,
  });
}

function shootAt(target) {
  const angle = Math.atan2(target.y - player.y, target.x - player.x);
  bullets.push({
    x: player.x,
    y: player.y,
    vx: Math.cos(angle) * settings.bulletSpeed,
    vy: Math.sin(angle) * settings.bulletSpeed,
    radius: settings.bulletRadius,
    damage: settings.bulletDamage,
  });
}

function updatePlayer(delta) {
  let dx = 0;
  let dy = 0;

  if (keys.has("ArrowUp") || keys.has("KeyW")) dy -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) dy += 1;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) dx += 1;

  const length = Math.hypot(dx, dy) || 1;
  player.x += (dx / length) * player.speed * delta;
  player.y += (dy / length) * player.speed * delta;

  player.x = clamp(player.x, player.radius, world.width - player.radius);
  player.y = clamp(player.y, player.radius, world.height - player.radius);
}

function updateEnemies(delta) {
  enemies.forEach((enemy) => {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    enemy.x += Math.cos(angle) * enemy.speed * delta;
    enemy.y += Math.sin(angle) * enemy.speed * delta;

    if (distance(enemy, player) < enemy.radius + player.radius) {
      player.health -= 18 * delta;
    }
  });
}

function updateBullets(delta) {
  bullets.forEach((bullet) => {
    bullet.x += bullet.vx * delta;
    bullet.y += bullet.vy * delta;
  });

  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];
    const outOfBounds =
      bullet.x < -bullet.radius ||
      bullet.x > world.width + bullet.radius ||
      bullet.y < -bullet.radius ||
      bullet.y > world.height + bullet.radius;

    if (outOfBounds) {
      bullets.splice(i, 1);
    }
  }
}

function handleCombat() {
  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    for (let j = bullets.length - 1; j >= 0; j -= 1) {
      const bullet = bullets[j];
      if (distance(enemy, bullet) < enemy.radius + bullet.radius) {
        enemy.health -= bullet.damage;
        bullets.splice(j, 1);
        if (enemy.health <= 0) {
          enemies.splice(i, 1);
          gameState.score += 1;
        }
        break;
      }
    }
  }
}

function autoShoot(delta) {
  if (player.fireCooldown > 0) {
    player.fireCooldown -= delta;
  }

  if (player.fireCooldown <= 0 && enemies.length > 0) {
    const target = enemies.reduce((closest, enemy) => {
      if (!closest) return enemy;
      return distance(player, enemy) < distance(player, closest) ? enemy : closest;
    }, null);

    if (target) {
      shootAt(target);
      player.fireCooldown = 0.35;
    }
  }
}

function drawCircle(x, y, radius, color) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function render() {
  ctx.clearRect(0, 0, world.width, world.height);

  drawCircle(player.x, player.y, player.radius, "#5eead4");

  bullets.forEach((bullet) => {
    drawCircle(bullet.x, bullet.y, bullet.radius, "#facc15");
  });

  enemies.forEach((enemy) => {
    drawCircle(enemy.x, enemy.y, enemy.radius, "#f97316");
  });

  const healthBarWidth = 160;
  const healthBarHeight = 10;
  const healthRatio = clamp(player.health / player.maxHealth, 0, 1);
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(20, 20, healthBarWidth, healthBarHeight);
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(20, 20, healthBarWidth * healthRatio, healthBarHeight);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.strokeRect(20, 20, healthBarWidth, healthBarHeight);

  if (gameState.gameOver) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, world.width, world.height);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "32px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText("Game Over", world.width / 2, world.height / 2 - 10);
    ctx.font = "18px Segoe UI";
    ctx.fillText("Refresh to try again", world.width / 2, world.height / 2 + 24);
  }
}

function update(delta) {
  if (gameState.gameOver) return;

  updatePlayer(delta);
  updateEnemies(delta);
  updateBullets(delta);
  handleCombat();
  autoShoot(delta);

  gameState.spawnTimer += delta;
  if (gameState.spawnTimer >= gameState.spawnInterval) {
    spawnEnemy();
    gameState.spawnTimer = 0;
  }

  if (player.health <= 0) {
    player.health = 0;
    gameState.gameOver = true;
  }

  ui.health.textContent = `Health: ${Math.ceil(player.health)}`;
  ui.score.textContent = `Score: ${gameState.score}`;
}

function gameLoop(timestamp) {
  const delta = (timestamp - gameState.lastTime) / 1000 || 0;
  gameState.lastTime = timestamp;

  update(delta);
  render();
  requestAnimationFrame(gameLoop);
}

window.addEventListener("keydown", (event) => {
  keys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

spawnEnemy();
requestAnimationFrame(gameLoop);
