'use strict';

const config = require('../config');
const { distance, normalizeAngle, PI2 } = require('../utils/math');

class BotManager {
  constructor(engine) {
    this.engine = engine;
    this.bots = new Map();
    this.pendingRespawns = [];
  }

  start() {
    for (let i = 0; i < config.BOT_CHASER_COUNT; i++) {
      this.spawnBot(i, 'chaser');
    }
    for (let i = 0; i < config.BOT_NORMAL_COUNT; i++) {
      this.spawnBot(i, 'normal');
    }
  }

  spawnBot(index, type) {
    const names = type === 'chaser' ? config.BOT_CHASER_NAMES : config.BOT_NORMAL_NAMES;
    const name = names[index % names.length];
    const skin = index % 9;
    const id = this.engine.snakeIdPool.acquire();
    if (id === null) return;

    const Snake = require('./Snake');
    const pos = this.engine._findSafeSpawnPos();
    const snake = new Snake(id, pos.x, pos.y, name + ' (bot)', skin);
    snake.isBot = true;
    snake.fam = 0.5;

    this.engine.snakes.set(id, snake);
    this.bots.set(id, { index, type, snake });
  }

  update() {
    const now = Date.now();

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
        this.pendingRespawns.push({
          index: bot.index,
          type: bot.type,
          time: now + config.BOT_RESPAWN_DELAY,
        });
        continue;
      }

      if (bot.type === 'chaser') {
        this._updateChaser(snakeId, snake);
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
    const cx = config.GAME_RADIUS;
    const cy = config.GAME_RADIUS;
    const score = snake.getScore();

    // Suicide mode
    if (score >= config.BOT_NORMAL_SUICIDE_SCORE) {
      const dx = snake.x - cx;
      const dy = snake.y - cy;
      const distToCenter = Math.sqrt(dx * dx + dy * dy);
      if (distToCenter < 1) {
        snake.setWantAngle(Math.random() * PI2);
      } else {
        snake.setWantAngle(normalizeAngle(Math.atan2(dy, dx)));
      }
      snake.setBoost(false);
      return;
    }

    snake.setBoost(false);

    // Check for nearby snakes
    let nearestSnakeDist = Infinity;
    let nearestSnakeAngle = 0;
    const avoidRange = 200;
    for (const other of this.engine.snakes.values()) {
      if (other.id === snakeId || !other.alive) continue;
      const d = distance(snake.x, snake.y, other.x, other.y);
      if (d < avoidRange && d < nearestSnakeDist) {
        nearestSnakeDist = d;
        nearestSnakeAngle = Math.atan2(other.y - snake.y, other.x - snake.x);
      }
    }

    // Avoid snakes
    if (nearestSnakeDist < avoidRange) {
      const fleeAngle = normalizeAngle(nearestSnakeAngle + Math.PI);
      snake.setWantAngle(fleeAngle);
      if (nearestSnakeDist < 100) {
        snake.setBoost(false);
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

    // No food nearby — wander toward center
    this._wanderToCenter(snake);
  }

  _wanderToCenter(snake) {
    const cx = config.GAME_RADIUS;
    const cy = config.GAME_RADIUS;
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
