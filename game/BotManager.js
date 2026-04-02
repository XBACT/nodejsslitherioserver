'use strict';

const config = require('../config');
const { distance, normalizeAngle, PI2 } = require('../utils/math');

class BotManager {
  constructor(engine) {
    this.engine = engine;
    this.bots = new Map();
    this.pendingRespawns = [];
    // Spawn ring for spiral bots — set in start() after game radius is finalized
    this.spiralRadius = 0;      // outer (max) radius
    this.spiralSpawnRadius = 0; // current spawn ring radius (moves inward over time)
    this.spiralSpawnAngle = 0;  // current spawn ring rotation
  }

  start() {
    // Initialize spiral radius now that config.GAME_RADIUS has been finalized
    this.spiralRadius = Math.min(config.BOT_SPIRAL_RADIUS, config.GAME_RADIUS * 0.85);
    this.spiralSpawnRadius = this.spiralRadius;
    this.spiralSpawnAngle = 0;
    // Compute count to fill exactly one circumference (spacing = DEFAULT_MSL * 3)
    this.spiralCount = Math.max(1, Math.floor(PI2 * this.spiralRadius / (config.DEFAULT_MSL * 3)));

    for (let i = 0; i < config.BOT_CHASER_COUNT; i++) {
      this.spawnBot(i, 'chaser');
    }
    for (let i = 0; i < config.BOT_NORMAL_COUNT; i++) {
      this.spawnBot(i, 'normal');
    }

    // Spawn multiple waves at evenly-spaced radii so the map is populated immediately
    if (!config.BOT_SPIRAL_ENABLED) return;
    const waveCount = config.BOT_SPIRAL_WAVE_COUNT || 1;
    for (let w = 0; w < waveCount; w++) {
      const waveRadius = this.spiralRadius * (waveCount - w) / waveCount;
      const waveAngle = w * (PI2 / waveCount / 2); // slight rotation per wave
      for (let i = 0; i < this.spiralCount; i++) {
        this.spawnBot(i, 'spiral', waveRadius, waveAngle);
      }
    }
    // Set spawn tracker so next wave fires after one wave-interval
    const waveInterval = this.spiralRadius / waveCount;
    this.spiralSpawnRadius = waveInterval;
  }

  spawnBot(index, type, overrideRadius, overrideAngle) {
    const names = type === 'chaser' ? config.BOT_CHASER_NAMES
      : type === 'spiral' ? config.BOT_SPIRAL_NAMES
        : config.BOT_NORMAL_NAMES;
    const name = names[index % names.length];
    const skin = index % 9;
    const id = this.engine.snakeIdPool.acquire();
    if (id === null) return;

    const Snake = require('./Snake');
    const cx = config.GAME_CENTER;
    const cy = config.GAME_CENTER;

    let pos;
    let initialAngle;
    if (type === 'spiral') {
      const total = this.spiralCount || 1;
      const baseAngle = overrideAngle !== undefined ? overrideAngle : this.spiralSpawnAngle;
      const spawnAngle = baseAngle + (index * PI2) / total;
      const r = overrideRadius !== undefined ? overrideRadius : this.spiralRadius;
      pos = { x: cx + Math.cos(spawnAngle) * r, y: cy + Math.sin(spawnAngle) * r };
      // Face the tangent + inward bias (same as _updateSpiral)
      const speed = config.NSP1 + config.NSP2;
      const inwardBias = Math.atan2(config.BOT_SPIRAL_SHRINK_RATE, speed);
      initialAngle = normalizeAngle(spawnAngle + Math.PI / 2 + inwardBias);
    } else {
      pos = this.engine._findSafeSpawnPos();
    }

    const snake = new Snake(id, pos.x, pos.y, name + ' (bot)', skin, initialAngle);
    snake.isBot = true;
    snake.fam = 0.5;

    this.engine.snakes.set(id, snake);
    this.bots.set(id, { index, type, snake });
  }

  update() {
    const now = Date.now();
    this._tickSpiral();

    // Process respawns
    for (let i = this.pendingRespawns.length - 1; i >= 0; i--) {
      const r = this.pendingRespawns[i];
      if (now >= r.time) {
        this.spawnBot(r.index, r.type);
        this.pendingRespawns.splice(i, 1);
      }
    }

    for (const [snakeId, bot] of this.bots) {
      const snake = bot.snake;
      if (!snake.alive) {
        this.bots.delete(snakeId);
        // Normal/chaser bots respawn; spiral bots are replaced by waves in _tickSpiral
        if (bot.type !== 'spiral') {
          this.pendingRespawns.push({
            index: bot.index,
            type: bot.type,
            time: now + config.BOT_RESPAWN_DELAY,
          });
        }
        continue;
      }

      if (bot.type === 'chaser') {
        this._updateChaser(snakeId, snake);
      } else if (bot.type === 'spiral') {
        this._updateSpiral(snakeId, snake, bot);
      } else {
        this._updateNormal(snakeId, snake);
      }
    }
  }

  // Chaser bot
  _updateChaser(snakeId, snake) {
    let target = null;
    let minDist = Infinity;
    for (const other of this.engine.snakes.values()) {
      if (other.id === snakeId || !other.alive || other.isBot) continue;
      const d = distance(snake.x, snake.y, other.x, other.y);
      if (d < minDist) {
        minDist = d;
        target = other;
      }
    }

    if (target) {
      const dx = target.x - snake.x;
      const dy = target.y - snake.y;
      snake.setWantAngle(normalizeAngle(Math.atan2(dy, dx)));
    } else {
      // No players — wander toward center
      this._wanderToCenter(snake);
    }
  }

  // Normal bot
  _updateNormal(snakeId, snake) {
    const cx = config.GAME_CENTER;
    const cy = config.GAME_CENTER;
    const score = snake.getScore();
    const isSuicide = score >= config.BOT_NORMAL_SUICIDE_SCORE;

    snake.setBoost(false);

    // Check for nearby snake body segments using spatial grid (always, even in suicide mode)
    const avoidRange = 300;
    const nearbyPts = this.engine.bodyGrid.query(snake.x, snake.y, avoidRange);
    let nearestBodyDist = Infinity;
    let nearestBodyAngle = 0;
    for (const pt of nearbyPts) {
      if (pt._snakeId === snakeId) continue;
      const ddx = pt.x - snake.x;
      const ddy = pt.y - snake.y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < nearestBodyDist) {
        nearestBodyDist = d;
        nearestBodyAngle = Math.atan2(ddy, ddx);
      }
    }

    // Avoid snake bodies (highest priority, even in suicide mode)
    if (nearestBodyDist < avoidRange) {
      snake.setWantAngle(normalizeAngle(nearestBodyAngle + Math.PI));
      return;
    }

    // Suicide mode: head toward wall
    if (isSuicide) {
      const dx = snake.x - cx;
      const dy = snake.y - cy;
      const distToCenter = Math.sqrt(dx * dx + dy * dy);
      if (distToCenter < 1) {
        snake.setWantAngle(Math.random() * PI2);
      } else {
        snake.setWantAngle(normalizeAngle(Math.atan2(dy, dx)));
      }
      return;
    }

    // Find nearest food
    const searchRadius = 300;
    const nearFoods = this.engine.food.findNear(snake.x, snake.y, searchRadius);
    if (nearFoods.length > 0) {
      // Pick food
      let bestFood = null;
      let bestDist = Infinity;
      for (const food of nearFoods) {
        const d = distance(snake.x, snake.y, food.x, food.y);
        if (d < bestDist) {
          bestDist = d;
          bestFood = food;
        }
      }
      if (bestFood) {
        const dx = bestFood.x - snake.x;
        const dy = bestFood.y - snake.y;
        snake.setWantAngle(normalizeAngle(Math.atan2(dy, dx)));
        return;
      }
    }
    this._wanderToCenter(snake);
  }

  _tickSpiral() {
    if (!config.BOT_SPIRAL_ENABLED) return;
    this.spiralRadius = Math.min(config.BOT_SPIRAL_RADIUS, config.GAME_RADIUS * 0.85);

    this.spiralSpawnRadius -= config.BOT_SPIRAL_SPAWN_RATE;
    if (this.spiralSpawnRadius <= 0) {
      this.spiralSpawnRadius = this.spiralRadius;
      this.spiralSpawnAngle += Math.PI;
      for (let i = 0; i < this.spiralCount; i++) {
        this.spawnBot(i, 'spiral');
      }
    }
  }

  _updateSpiral(snakeId, snake, bot) {
    const cx = config.GAME_CENTER;
    const cy = config.GAME_CENTER;
    const dx = snake.x - cx;
    const dy = snake.y - cy;
    const theta = Math.atan2(dy, dx);

    const speed = config.NSP1 + config.NSP2 * snake.sc;
    const inwardBias = Math.atan2(config.BOT_SPIRAL_SHRINK_RATE, speed);

    snake.setWantAngle(normalizeAngle(theta + Math.PI / 2 + inwardBias));
  }

  _wanderToCenter(snake) {
    const cx = config.GAME_CENTER;
    const cy = config.GAME_CENTER;
    const dx = cx - snake.x;
    const dy = cy - snake.y;
    const distToCenter = Math.sqrt(dx * dx + dy * dy);
    if (distToCenter > config.GAME_RADIUS * 0.5) {
      snake.setWantAngle(normalizeAngle(Math.atan2(dy, dx)));
    }
  }

  onSnakeRemoved(snakeId) {
  }
}

module.exports = BotManager;
