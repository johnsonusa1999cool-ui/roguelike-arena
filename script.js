const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  health: document.getElementById("health"),
  healthFill: document.getElementById("health-fill"),
  level: document.getElementById("level"),
  xpFill: document.getElementById("xp-fill"),
  timer: document.getElementById("timer"),
  score: document.getElementById("score"),
  overlay: document.getElementById("upgrade-overlay"),
  upgradeList: document.getElementById("upgrade-list"),
};

const world = {
  width: canvas.width,
  height: canvas.height,
};

const keys = new Set();
const enemies = [];
const bullets = [];
const particles = [];
const xpOrbs = [];

const player = {
  x: world.width / 2,
  y: world.height / 2,
  radius: 14,
  speed: 230,
  health: 100,
  maxHealth: 100,
  fireCooldown: 0,
  vx: 0,
  vy: 0,
  shootPulse: 0,
  level: 1,
  xp: 0,
  xpToLevel: 100,
  damage: 34,
  fireRate: 0.35,
};

const gameState = {
  lastTime: 0,
  spawnTimer: 0,
  spawnInterval: 1.2,
  score: 0,
  elapsed: 0,
  difficultyLevel: 0,
  gameOver: false,
  paused: false,
};

const settings = {
  enemySpeed: 80,
  enemyRadius: 12,
  bulletSpeed: 440,
  bulletRadius: 4,
  playerAccel: 12,
  playerFriction: 10,
  difficultyInterval: 20,
  spawnRateScale: 0.1,
  enemySpeedScale: 6,
};

const upgrades = [
  {
    id: "fire-rate",
    label: "Increase fire rate",
    description: "Shoot faster.",
    apply: () => {
      player.fireRate = Math.max(0.18, player.fireRate * 0.85);
    },
  },
  {
    id: "speed",
    label: "Increase player speed",
    description: "Move faster.",
    apply: () => {
      player.speed += 25;
    },
  },
  {
    id: "damage",
    label: "Increase damage",
    description: "Shots hit harder.",
    apply: () => {
      player.damage += 8;
    },
  },
];

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
    speed:
      settings.enemySpeed +
      gameState.difficultyLevel * settings.enemySpeedScale +
      Math.random() * 40,
    health: 60,
    hitTimer: 0,
  });
}

function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 120;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 2,
      life: 0.4 + Math.random() * 0.3,
      ttl: 0.4 + Math.random() * 0.3,
      color,
    });
  }
}

function spawnXpOrb(x, y, amount) {
  xpOrbs.push({
    x,
    y,
    radius: 6,
    amount,
  });
}

function rgba(color, alpha) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function shootAt(target) {
  const angle = Math.atan2(target.y - player.y, target.x - player.x);
  bullets.push({
    x: player.x,
    y: player.y,
    vx: Math.cos(angle) * settings.bulletSpeed,
    vy: Math.sin(angle) * settings.bulletSpeed,
    radius: settings.bulletRadius,
    damage: player.damage,
  });
  player.shootPulse = 0.15;
}

function updatePlayer(delta) {
  let dx = 0;
  let dy = 0;

  if (keys.has("ArrowUp") || keys.has("KeyW")) dy -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) dy += 1;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) dx += 1;

  const length = Math.hypot(dx, dy);
  const targetVx = length ? (dx / length) * player.speed : 0;
  const targetVy = length ? (dy / length) * player.speed : 0;
  const accel = length ? settings.playerAccel : settings.playerFriction;

  player.vx += (targetVx - player.vx) * accel * delta;
  player.vy += (targetVy - player.vy) * accel * delta;

  player.x += player.vx * delta;
  player.y += player.vy * delta;

  player.x = clamp(player.x, player.radius, world.width - player.radius);
  player.y = clamp(player.y, player.radius, world.height - player.radius);

  player.shootPulse = Math.max(0, player.shootPulse - delta);
}

function updateEnemies(delta) {
  enemies.forEach((enemy) => {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    enemy.x += Math.cos(angle) * enemy.speed * delta;
    enemy.y += Math.sin(angle) * enemy.speed * delta;
    enemy.hitTimer = Math.max(0, enemy.hitTimer - delta);

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

function updateParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.life -= delta;
    particle.vx *= 0.96;
    particle.vy *= 0.96;

    if (particle.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function updateXpOrbs(delta) {
  xpOrbs.forEach((orb) => {
    const angle = Math.atan2(player.y - orb.y, player.x - orb.x);
    const pull = distance(player, orb) < 120 ? 140 : 0;
    orb.x += Math.cos(angle) * pull * delta;
    orb.y += Math.sin(angle) * pull * delta;
  });

  for (let i = xpOrbs.length - 1; i >= 0; i -= 1) {
    const orb = xpOrbs[i];
    if (distance(player, orb) < player.radius + orb.radius) {
      gainXp(orb.amount);
      xpOrbs.splice(i, 1);
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
        enemy.hitTimer = 0.12;
        spawnParticles(bullet.x, bullet.y, { r: 250, g: 204, b: 21 }, 6);
        bullets.splice(j, 1);
        if (enemy.health <= 0) {
          enemies.splice(i, 1);
          gameState.score += 1;
          spawnParticles(enemy.x, enemy.y, { r: 251, g: 146, b: 60 }, 10);
          spawnXpOrb(enemy.x, enemy.y, 20);
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
      player.fireCooldown = player.fireRate;
    }
  }
}

function updateDifficulty(delta) {
  gameState.elapsed += delta;
  const level = Math.floor(gameState.elapsed / settings.difficultyInterval);
  if (level > gameState.difficultyLevel) {
    gameState.difficultyLevel = level;
  }

  const spawnScale = 1 + gameState.difficultyLevel * settings.spawnRateScale;
  gameState.spawnInterval = 1.2 / spawnScale;
}

function drawCircle(x, y, radius, color) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawPlayer() {
  const gradient = ctx.createRadialGradient(
    player.x - player.radius * 0.3,
    player.y - player.radius * 0.3,
    player.radius * 0.4,
    player.x,
    player.y,
    player.radius
  );
  gradient.addColorStop(0, "#a7f3d0");
  gradient.addColorStop(1, "#14b8a6");

  ctx.save();
  ctx.shadowColor = "rgba(94, 234, 212, 0.5)";
  ctx.shadowBlur = 12;
  drawCircle(player.x, player.y, player.radius, gradient);
  ctx.restore();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius - 1, 0, Math.PI * 2);
  ctx.stroke();

  const angle = Math.atan2(player.vy, player.vx);
  if (Math.hypot(player.vx, player.vy) > 5) {
    ctx.beginPath();
    ctx.moveTo(
      player.x + Math.cos(angle) * player.radius,
      player.y + Math.sin(angle) * player.radius
    );
    ctx.lineTo(
      player.x + Math.cos(angle + 0.5) * player.radius * 0.6,
      player.y + Math.sin(angle + 0.5) * player.radius * 0.6
    );
    ctx.lineTo(
      player.x + Math.cos(angle - 0.5) * player.radius * 0.6,
      player.y + Math.sin(angle - 0.5) * player.radius * 0.6
    );
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fill();
  }
}

function drawEnemy(enemy) {
  const gradient = ctx.createRadialGradient(
    enemy.x - enemy.radius * 0.2,
    enemy.y - enemy.radius * 0.2,
    enemy.radius * 0.4,
    enemy.x,
    enemy.y,
    enemy.radius
  );
  if (enemy.hitTimer > 0) {
    gradient.addColorStop(0, "#fde68a");
    gradient.addColorStop(1, "#f59e0b");
  } else {
    gradient.addColorStop(0, "#fb7185");
    gradient.addColorStop(1, "#f97316");
  }

  ctx.save();
  ctx.shadowColor = "rgba(249, 115, 22, 0.5)";
  ctx.shadowBlur = 10;
  drawCircle(enemy.x, enemy.y, enemy.radius, gradient);
  ctx.restore();

  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, enemy.radius - 1, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBullet(bullet) {
  ctx.save();
  ctx.shadowColor = "rgba(250, 204, 21, 0.8)";
  ctx.shadowBlur = 8;
  drawCircle(bullet.x, bullet.y, bullet.radius + 1, "rgba(250, 204, 21, 0.4)");
  drawCircle(bullet.x, bullet.y, bullet.radius, "#facc15");
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, world.width, world.height);

  if (player.shootPulse > 0) {
    const pulseSize = player.radius + player.shootPulse * 40;
    ctx.beginPath();
    ctx.arc(player.x, player.y, pulseSize, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(250, 204, 21, ${player.shootPulse * 4})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawPlayer();

  bullets.forEach((bullet) => {
    drawBullet(bullet);
  });

  enemies.forEach((enemy) => {
    drawEnemy(enemy);
  });

  xpOrbs.forEach((orb) => {
    drawCircle(orb.x, orb.y, orb.radius, "#38bdf8");
  });

  particles.forEach((particle) => {
    const alpha = clamp(particle.life / particle.ttl, 0, 1);
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fillStyle = rgba(particle.color, alpha);
    ctx.fill();
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

function gainXp(amount) {
  player.xp += amount;
  while (player.xp >= player.xpToLevel) {
    player.xp -= player.xpToLevel;
    player.level += 1;
    player.xpToLevel = Math.round(player.xpToLevel * 1.2);
    openUpgradeMenu();
  }
}

function openUpgradeMenu() {
  gameState.paused = true;
  ui.overlay.classList.remove("hidden");
  ui.upgradeList.innerHTML = "";

  const choices = [...upgrades]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  choices.forEach((upgrade) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "upgrade-button";
    button.innerHTML = `<strong>${upgrade.label}</strong><br /><small>${upgrade.description}</small>`;
    button.addEventListener("click", () => {
      upgrade.apply();
      closeUpgradeMenu();
    });
    ui.upgradeList.appendChild(button);
  });
}

function closeUpgradeMenu() {
  gameState.paused = false;
  ui.overlay.classList.add("hidden");
}

function update(delta) {
  if (gameState.gameOver || gameState.paused) return;

  updatePlayer(delta);
  updateEnemies(delta);
  updateBullets(delta);
  updateParticles(delta);
  updateXpOrbs(delta);
  handleCombat();
  autoShoot(delta);
  updateDifficulty(delta);

  gameState.spawnTimer += delta;
  if (gameState.spawnTimer >= gameState.spawnInterval) {
    spawnEnemy();
    gameState.spawnTimer = 0;
  }

  if (player.health <= 0) {
    player.health = 0;
    gameState.gameOver = true;
  }

  const healthPercent = clamp(player.health / player.maxHealth, 0, 1);
  const xpPercent = clamp(player.xp / player.xpToLevel, 0, 1);
  ui.health.textContent = `Health: ${Math.ceil(player.health)}`;
  ui.healthFill.style.width = `${healthPercent * 100}%`;
  ui.healthFill.style.background =
    healthPercent < 0.3
      ? "linear-gradient(90deg, #f97316, #ef4444)"
      : "linear-gradient(90deg, #22c55e, #4ade80)";
  ui.level.textContent = `Level: ${player.level}`;
  ui.xpFill.style.width = `${xpPercent * 100}%`;
  ui.timer.textContent = `Time: ${Math.floor(gameState.elapsed)}s`;
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
