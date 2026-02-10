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
  baseWidth: 900,
  baseHeight: 600,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

const keys = new Set();
const enemies = [];
const bullets = [];
const enemyBullets = [];
const particles = [];
const xpOrbs = [];
const boosts = [];

const stars = Array.from({ length: 90 }, () => ({
  x: Math.random() * world.width,
  y: Math.random() * world.height,
  r: Math.random() * 1.8 + 0.4,
  speed: 8 + Math.random() * 18,
}));

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
  defense: 0,
  boostTimers: {
    speed: 0,
    damage: 0,
    shield: 0,
  },
  angle: -Math.PI / 2,
  animTime: 0,
};

const uiState = {
  displayedHealth: player.health,
  displayedScore: 0,
};

const gameState = {
  lastTime: 0,
  spawnTimer: 0,
  boostSpawnTimer: 0,
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
  enemyBulletSpeed: 220,
  enemyBulletRadius: 4,
  playerAccel: 12,
  playerFriction: 10,
  difficultyInterval: 20,
  spawnRateScale: 0.1,
  enemySpeedScale: 6,
  boostDuration: 10,
  boostSpawnInterval: 12,
};

const upgrades = [
  {
    id: "fire-rate",
    label: "Increase fire rate",
    description: "Shoot faster.",
    apply: () => {
      player.fireRate = Math.max(0.16, player.fireRate * 0.85);
      player.fireRate = Math.max(0.18, player.fireRate * 0.85);
    },
  },
  {
    id: "speed",
    label: "Increase player speed",
    description: "Move faster.",
    apply: () => {
      player.speed += 24;
      player.speed += 25;
    },
  },
  {
    id: "health",
    label: "Increase max health",
    description: "Boost survivability.",
    apply: () => {
      player.maxHealth += 20;
      player.health = Math.min(player.maxHealth, player.health + 20);
    },
  },
  {
    id: "defense",
    label: "Increase defense",
    description: "Reduce incoming damage.",
    apply: () => {
      player.defense = Math.min(0.6, player.defense + 0.08);
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

const boostTypes = {
  speed: { label: "Speed Boost", color: "#22d3ee" },
  damage: { label: "Damage Boost", color: "#f59e0b" },
  shield: { label: "Shield Boost", color: "#a78bfa" },
};

const audioState = {
  context: null,
  musicTimer: 0,
  started: false,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const scaleX = canvas.width / world.baseWidth;
  const scaleY = canvas.height / world.baseHeight;
  world.scale = Math.min(scaleX, scaleY);
  world.width = world.baseWidth;
  world.height = world.baseHeight;
  world.offsetX = (canvas.width - world.width * world.scale) / 2;
  world.offsetY = (canvas.height - world.height * world.scale) / 2;
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getMoveSpeed() {
  return player.speed * (player.boostTimers.speed > 0 ? 1.35 : 1);
}

function getBulletDamage() {
  return player.damage * (player.boostTimers.damage > 0 ? 1.35 : 1);
}

function getDefense() {
  return clamp(player.defense + (player.boostTimers.shield > 0 ? 0.25 : 0), 0, 0.8);
}

function ensureAudio() {
  if (!audioState.context) {
    audioState.context = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioState.context.state === "suspended") {
    audioState.context.resume();
  }
  audioState.started = true;
}

function playTone(freq, duration, type = "sine", gain = 0.05, when = 0) {
  if (!audioState.context) return;
  const now = audioState.context.currentTime + when;
  const osc = audioState.context.createOscillator();
  const amp = audioState.context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(amp);
  amp.connect(audioState.context.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playSfx(name) {
  if (!audioState.started) return;
  if (name === "shoot") playTone(560, 0.08, "triangle", 0.035);
  if (name === "hit") playTone(220, 0.09, "sawtooth", 0.04);
  if (name === "boost") {
    playTone(440, 0.1, "triangle", 0.05);
    playTone(660, 0.12, "triangle", 0.04, 0.06);
  }
  if (name === "level") {
    playTone(523, 0.13, "sine", 0.06);
    playTone(659, 0.13, "sine", 0.05, 0.11);
    playTone(784, 0.16, "sine", 0.045, 0.22);
  }
}

function updateMusic(delta) {
  if (!audioState.started || gameState.paused || gameState.gameOver) return;
  audioState.musicTimer -= delta;
  if (audioState.musicTimer <= 0) {
    audioState.musicTimer = 0.6;
    const note = 100 + ((Math.floor(gameState.elapsed) % 4) * 18);
    playTone(note, 0.5, "sine", 0.015);
  }
}

function applyDamage(amount) {
  const mitigated = amount * (1 - getDefense());
function applyDamage(amount) {
  const mitigated = amount * (1 - player.defense);
  player.health -= mitigated;
}

function createEnemy(type, x, y) {
  const baseSpeed =
    settings.enemySpeed + gameState.difficultyLevel * settings.enemySpeedScale + Math.random() * 40;
  const types = {
    grunt: { radius: settings.enemyRadius, speed: baseSpeed, health: 60 },
    settings.enemySpeed +
    gameState.difficultyLevel * settings.enemySpeedScale +
    Math.random() * 40;
  const types = {
    grunt: {
      radius: settings.enemyRadius,
      speed: baseSpeed,
      health: 60,
    },
    sprinter: {
      radius: settings.enemyRadius - 2,
      speed: baseSpeed + 40,
      health: 40,
      zigzagPhase: Math.random() * Math.PI * 2,
    },
    tank: { radius: settings.enemyRadius + 4, speed: baseSpeed - 20, health: 120 },
    tank: {
      radius: settings.enemyRadius + 4,
      speed: baseSpeed - 20,
      health: 120,
    },
    shooter: {
      radius: settings.enemyRadius,
      speed: baseSpeed - 10,
      health: 70,
      shootCooldown: 1.2,
    },
    charger: {
      radius: settings.enemyRadius + 2,
      speed: baseSpeed,
      health: 80,
      dashTimer: 2,
      dashSpeed: 240,
    },
  };

  const data = types[type] || types.grunt;
  return {
    x,
    y,
    radius: data.radius,
    speed: data.speed,
    health: data.health,
    type,
    hitTimer: 0,
    zigzagPhase: data.zigzagPhase ?? 0,
    shootCooldown: data.shootCooldown ?? 0,
    dashTimer: data.dashTimer ?? 0,
    dashSpeed: data.dashSpeed ?? 0,
    angle: -Math.PI / 2,
    animTime: Math.random() * Math.PI * 2,
  };
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

  const roll = Math.random();
  let type = "grunt";
  if (gameState.difficultyLevel >= 4 && roll > 0.78) type = "charger";
  else if (gameState.difficultyLevel >= 3 && roll > 0.62) type = "shooter";
  else if (gameState.difficultyLevel >= 2 && roll > 0.48) type = "tank";
  else if (gameState.difficultyLevel >= 1 && roll > 0.32) type = "sprinter";
  if (gameState.difficultyLevel >= 1 && roll > 0.8) {
    type = "sprinter";
  } else if (gameState.difficultyLevel >= 2 && roll > 0.6) {
    type = "tank";
  } else if (gameState.difficultyLevel >= 3 && roll > 0.45) {
    type = "shooter";
  } else if (gameState.difficultyLevel >= 4 && roll > 0.3) {
    type = "charger";
  }

  enemies.push(createEnemy(type, x, y));
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
  xpOrbs.push({ x, y, radius: 6, amount });
}

function spawnBoost() {
  const typeKeys = Object.keys(boostTypes);
  const type = typeKeys[Math.floor(Math.random() * typeKeys.length)];
  boosts.push({
    x: 50 + Math.random() * (world.width - 100),
    y: 50 + Math.random() * (world.height - 100),
    radius: 10,
    type,
    spin: Math.random() * Math.PI * 2,
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
    damage: getBulletDamage(),
  });
  player.shootPulse = 0.15;
  playSfx("shoot");
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

  const speed = getMoveSpeed();
  const length = Math.hypot(dx, dy);
  const targetVx = length ? (dx / length) * speed : 0;
  const targetVy = length ? (dy / length) * speed : 0;
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

  const moveMag = Math.hypot(player.vx, player.vy);
  if (moveMag > 5) {
    const targetAngle = Math.atan2(player.vy, player.vx);
    const angleDelta = Math.atan2(Math.sin(targetAngle - player.angle), Math.cos(targetAngle - player.angle));
    player.angle += angleDelta * clamp(delta * 12, 0, 1);
    player.animTime += delta * (4 + moveMag / 60);
  }
}

function updateEnemies(delta) {
  enemies.forEach((enemy) => {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    let speed = enemy.speed;

    if (enemy.type === "sprinter") {
      enemy.zigzagPhase += delta * 6;
      speed += Math.sin(enemy.zigzagPhase) * 20;
    }

    if (enemy.type === "charger") {
      enemy.dashTimer -= delta;
      if (enemy.dashTimer <= 0) {
        enemy.dashTimer = 2.2;
        speed = enemy.dashSpeed;
      }
    }

    enemy.x += Math.cos(angle) * speed * delta;
    enemy.y += Math.sin(angle) * speed * delta;
    enemy.hitTimer = Math.max(0, enemy.hitTimer - delta);

    const angleDelta = Math.atan2(Math.sin(angle - enemy.angle), Math.cos(angle - enemy.angle));
    enemy.angle += angleDelta * clamp(delta * 10, 0, 1);
    enemy.animTime += delta * (3 + speed / 90);

    if (distance(enemy, player) < enemy.radius + player.radius) {
      applyDamage(18 * delta);
    }

    if (enemy.type === "shooter") {
      enemy.shootCooldown -= delta;
      if (enemy.shootCooldown <= 0) {
        enemy.shootCooldown = 1.6;
        enemyBullets.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle) * settings.enemyBulletSpeed,
          vy: Math.sin(angle) * settings.enemyBulletSpeed,
          radius: settings.enemyBulletRadius,
          damage: 12,
        });
      }
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

    if (outOfBounds) bullets.splice(i, 1);
    if (outOfBounds) {
      bullets.splice(i, 1);
    }
  }
}

function updateEnemyBullets(delta) {
  enemyBullets.forEach((bullet) => {
    bullet.x += bullet.vx * delta;
    bullet.y += bullet.vy * delta;
  });

  for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
    const bullet = enemyBullets[i];
    const outOfBounds =
      bullet.x < -bullet.radius ||
      bullet.x > world.width + bullet.radius ||
      bullet.y < -bullet.radius ||
      bullet.y > world.height + bullet.radius;

    if (outOfBounds) {
      enemyBullets.splice(i, 1);
      continue;
    }

    if (distance(player, bullet) < player.radius + bullet.radius) {
      applyDamage(bullet.damage);
      spawnParticles(bullet.x, bullet.y, { r: 147, g: 197, b: 253 }, 6);
      enemyBullets.splice(i, 1);
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

    if (particle.life <= 0) particles.splice(i, 1);
    if (particle.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function updateXpOrbs(delta) {
  xpOrbs.forEach((orb) => {
    const angle = Math.atan2(player.y - orb.y, player.x - orb.x);
    const pull = distance(player, orb) < 130 ? 140 : 0;
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

function updateBoosts(delta) {
  boosts.forEach((boost) => {
    boost.spin += delta * 4;
  });

  for (let i = boosts.length - 1; i >= 0; i -= 1) {
    const boost = boosts[i];
    if (distance(player, boost) < player.radius + boost.radius) {
      player.boostTimers[boost.type] = settings.boostDuration;
      spawnParticles(boost.x, boost.y, { r: 110, g: 231, b: 183 }, 10);
      playSfx("boost");
      boosts.splice(i, 1);
    }
  }

  Object.keys(player.boostTimers).forEach((key) => {
    player.boostTimers[key] = Math.max(0, player.boostTimers[key] - delta);
  });

  gameState.boostSpawnTimer += delta;
  if (gameState.boostSpawnTimer >= settings.boostSpawnInterval && boosts.length < 2) {
    spawnBoost();
    gameState.boostSpawnTimer = 0;
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
        playSfx("hit");
        bullets.splice(j, 1);
        if (enemy.health <= 0) {
          enemies.splice(i, 1);
          gameState.score += enemy.type === "tank" ? 3 : 1;
          spawnParticles(enemy.x, enemy.y, { r: 251, g: 146, b: 60 }, 10);
          spawnXpOrb(enemy.x, enemy.y, enemy.type === "tank" ? 35 : 20);
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
  if (player.fireCooldown > 0) player.fireCooldown -= delta;
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
  if (level > gameState.difficultyLevel) gameState.difficultyLevel = level;
  if (level > gameState.difficultyLevel) {
    gameState.difficultyLevel = level;
  }

  const spawnScale = 1 + gameState.difficultyLevel * settings.spawnRateScale;
  gameState.spawnInterval = 1.2 / spawnScale;
}

function drawBackground(delta) {
  ctx.fillStyle = "#05070f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(world.offsetX, world.offsetY);
  ctx.scale(world.scale, world.scale);

  const grd = ctx.createLinearGradient(0, 0, world.width, world.height);
  grd.addColorStop(0, "#0f1223");
  grd.addColorStop(1, "#090b14");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, world.width, world.height);

  stars.forEach((star) => {
    star.y += star.speed * delta;
    if (star.y > world.height) {
      star.y = -4;
      star.x = Math.random() * world.width;
    }
    drawCircle(star.x, star.y, star.r, "rgba(148, 163, 184, 0.8)");
  });

  ctx.strokeStyle = "rgba(34, 211, 238, 0.08)";
  for (let i = 0; i < world.width; i += 70) {
    ctx.beginPath();
    ctx.moveTo(i + ((gameState.elapsed * 12) % 70), 0);
    ctx.lineTo(i - 30 + ((gameState.elapsed * 12) % 70), world.height);
    ctx.stroke();
  }

  ctx.restore();
}

function drawCircle(x, y, radius, color) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawPlayer() {
  const moveMag = Math.hypot(player.vx, player.vy);
  const bob = moveMag > 5 ? Math.sin(player.animTime * 6) * 1.4 : 0;
  const legSwing = moveMag > 5 ? Math.sin(player.animTime * 8) * 1.4 : 0;

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle + Math.PI / 2);

  ctx.shadowColor = "rgba(45, 212, 191, 0.45)";
  ctx.shadowBlur = 10;

  // body
  ctx.fillStyle = "#14b8a6";
  ctx.fillRect(-7, -6 + bob, 14, 14);

  // shoulders / armor accents
  ctx.fillStyle = "#22d3ee";
  ctx.fillRect(-9, -6 + bob, 3, 8);
  ctx.fillRect(6, -6 + bob, 3, 8);

  // visor
  ctx.fillStyle = "#67e8f9";
  ctx.fillRect(-4, -11 + bob, 8, 5);

  // head plate
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(-5, -14 + bob, 10, 4);

  // legs
  ctx.fillStyle = "#334155";
  ctx.fillRect(-6, 8 + bob + legSwing * 0.3, 5, 7);
  ctx.fillRect(1, 8 + bob - legSwing * 0.3, 5, 7);

  // thruster / direction marker
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.moveTo(0, -18 + bob);
  ctx.lineTo(-3, -13 + bob);
  ctx.lineTo(3, -13 + bob);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}


function drawEnemy(enemy) {
  const bob = Math.sin(enemy.animTime * 6) * 1.0;
  const armSwing = Math.sin(enemy.animTime * 5) * 0.6;

  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(enemy.angle + Math.PI / 2);

  const suitColor =
    enemy.type === "tank" ? "#1f7a2e" : enemy.type === "shooter" ? "#2e7d32" : "#22c55e";
  const armorColor = enemy.hitTimer > 0 ? "#facc15" : "#14532d";

  // body
  ctx.fillStyle = suitColor;
  ctx.fillRect(-7, -5 + bob, 14, 16);

  // chest armor
  ctx.fillStyle = armorColor;
  ctx.fillRect(-5, -4 + bob, 10, 8);

  // arms
  ctx.fillStyle = "#c08457";
  ctx.fillRect(-10, -3 + bob + armSwing, 3, 9);
  ctx.fillRect(7, -3 + bob - armSwing, 3, 9);

  // helmet
  ctx.fillStyle = "#8b5e3c";
  ctx.fillRect(-6, -12 + bob, 12, 6);

  // visor
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(-4, -10 + bob, 8, 3);

  // boots
  ctx.fillStyle = "#3f3f46";
  ctx.fillRect(-6, 11 + bob, 5, 5);
  ctx.fillRect(1, 11 + bob, 5, 5);

  // weapon
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(-2, -16 + bob, 4, 7);

  ctx.restore();
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
  } else if (enemy.type === "tank") {
    gradient.addColorStop(0, "#fca5a5");
    gradient.addColorStop(1, "#b91c1c");
  } else if (enemy.type === "shooter") {
    gradient.addColorStop(0, "#c4b5fd");
    gradient.addColorStop(1, "#7c3aed");
  if (enemy.hitTimer > 0) {
    gradient.addColorStop(0, "#fde68a");
    gradient.addColorStop(1, "#f59e0b");
  } else {
    gradient.addColorStop(0, "#fb7185");
    gradient.addColorStop(1, "#f97316");
  }

  drawCircle(enemy.x, enemy.y, enemy.radius, gradient);
}

function drawBullet(bullet) {
  drawCircle(bullet.x, bullet.y, bullet.radius + 1, "rgba(250, 204, 21, 0.35)");
  drawCircle(bullet.x, bullet.y, bullet.radius, "#facc15");
}

function drawEnemyBullet(bullet) {
  drawCircle(bullet.x, bullet.y, bullet.radius + 1, "rgba(129, 140, 248, 0.35)");
  drawCircle(bullet.x, bullet.y, bullet.radius, "#818cf8");
}

function drawBoost(boost) {
  const color = boostTypes[boost.type].color;
  drawCircle(boost.x, boost.y, boost.radius + 2, "rgba(255, 255, 255, 0.15)");
  drawCircle(boost.x, boost.y, boost.radius, color);
  ctx.beginPath();
  ctx.moveTo(boost.x, boost.y - 5);
  ctx.lineTo(boost.x + 5, boost.y);
  ctx.lineTo(boost.x, boost.y + 5);
  ctx.lineTo(boost.x - 5, boost.y);
  ctx.closePath();
  ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
  ctx.fill();
}

function render(delta) {
  drawBackground(delta);

  ctx.save();
  ctx.translate(world.offsetX, world.offsetY);
  ctx.scale(world.scale, world.scale);
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

function drawEnemyBullet(bullet) {
  ctx.save();
  ctx.shadowColor = "rgba(129, 140, 248, 0.8)";
  ctx.shadowBlur = 8;
  drawCircle(bullet.x, bullet.y, bullet.radius + 1, "rgba(129, 140, 248, 0.4)");
  drawCircle(bullet.x, bullet.y, bullet.radius, "#818cf8");
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, world.width, world.height);

  if (player.shootPulse > 0) {
    const pulseSize = player.radius + player.shootPulse * 40;
    ctx.beginPath();
    ctx.arc(player.x, player.y, pulseSize, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(250, 204, 21, ${player.shootPulse * 3})`;
    ctx.strokeStyle = `rgba(250, 204, 21, ${player.shootPulse * 4})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  boosts.forEach(drawBoost);
  drawPlayer();
  bullets.forEach(drawBullet);
  enemyBullets.forEach(drawEnemyBullet);
  enemies.forEach(drawEnemy);
  xpOrbs.forEach((orb) => drawCircle(orb.x, orb.y, orb.radius, "#38bdf8"));

  particles.forEach((particle) => {
    const alpha = clamp(particle.life / particle.ttl, 0, 1);
    drawCircle(particle.x, particle.y, particle.radius, rgba(particle.color, alpha));
  });

  drawPlayer();

  bullets.forEach((bullet) => {
    drawBullet(bullet);
  });

  enemyBullets.forEach((bullet) => {
    drawEnemyBullet(bullet);
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

  ctx.restore();
}

function gainXp(amount) {
  player.xp += amount;
  while (player.xp >= player.xpToLevel) {
    player.xp -= player.xpToLevel;
    player.level += 1;
    player.xpToLevel = Math.round(player.xpToLevel * 1.2);
    playSfx("level");
    openUpgradeMenu();
  }
}

function openUpgradeMenu() {
  gameState.paused = true;
  ui.overlay.classList.remove("hidden");
  ui.upgradeList.innerHTML = "";

  const choices = [...upgrades].sort(() => Math.random() - 0.5).slice(0, 3);

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

function updateHud(delta) {
  const healthPercent = clamp(player.health / player.maxHealth, 0, 1);
  const xpPercent = clamp(player.xp / player.xpToLevel, 0, 1);
  uiState.displayedHealth = lerp(uiState.displayedHealth, player.health, clamp(delta * 8, 0, 1));
  uiState.displayedScore = lerp(uiState.displayedScore, gameState.score, clamp(delta * 8, 0, 1));

  ui.health.textContent = `Health: ${Math.ceil(uiState.displayedHealth)}`;
  ui.healthFill.style.width = `${healthPercent * 100}%`;
  ui.healthFill.style.background = "linear-gradient(90deg, #dc2626, #f87171)";
  ui.level.textContent = `Level: ${player.level}`;
  ui.xpFill.style.width = `${xpPercent * 100}%`;
  ui.timer.textContent = `Time: ${Math.floor(gameState.elapsed)}s`;
  ui.score.textContent = `Score: ${Math.floor(uiState.displayedScore)}`;
}

function update(delta) {
  if (gameState.gameOver || gameState.paused) {
    updateHud(delta);
    return;
  }

  updatePlayer(delta);
  updateEnemies(delta);
  updateBullets(delta);
  updateEnemyBullets(delta);
  updateParticles(delta);
  updateXpOrbs(delta);
  updateBoosts(delta);
  handleCombat();
  autoShoot(delta);
  updateDifficulty(delta);
  updateMusic(delta);
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

  updateHud(delta);
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
  render(delta);
  render();
  requestAnimationFrame(gameLoop);
}

window.addEventListener("keydown", (event) => {
  ensureAudio();
  keys.add(event.code);
});

window.addEventListener("pointerdown", ensureAudio);

  keys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("resize", resizeCanvas);

resizeCanvas();
spawnEnemy();
requestAnimationFrame(gameLoop);
