'use strict';

const config = require('../config');
const { PI2, normalizeAngle, randomInt, randomFloat, distance } = require('../utils/math');
const IdPool = require('../utils/IdPool');

class PreyManager {
  constructor() {
    this.preys = new Map();
    this.idPool = new IdPool(65535);
    this.lastSpawn = 0;
  }

  spawnPrey(x, y) {
    if (this.preys.size >= config.MAX_PREY) return null;
    const id = this.idPool.acquire();
    if (id === null) return null;

    const prey = {
      id,
      x, y,
      cv: randomInt(0, config.FOOD_COLORS - 1),
      radius: randomFloat(2.0, 5.0),
      angle: Math.random() * PI2,
      wantAngle: Math.random() * PI2,
      speed: config.PREY_SPEED,
      dir: 1,
      alive: true,
      fleeing: false,
    };
    this.preys.set(id, prey);
    return prey;
  }

  removePrey(id) {
    const prey = this.preys.get(id);
    if (prey) {
      this.preys.delete(id);
      this.idPool.release(id);
    }
    return prey;
  }

  update(dt, snakes) {
    const grd = config.GAME_RADIUS;
    const center = grd;
    const fleeRange = 400;
    const fleeSpeed = config.NSP1 + config.NSP2 * 6 + 1;

    for (const prey of this.preys.values()) {
      let nearestDist = Infinity;
      let fleeX = 0;
      let fleeY = 0;
      if (snakes) {
        for (const snake of snakes) {
          if (!snake.alive) continue;
          const d = distance(prey.x, prey.y, snake.x, snake.y);
          if (d < fleeRange && d < nearestDist) {
            nearestDist = d;
            fleeX = prey.x - snake.x;
            fleeY = prey.y - snake.y;
          }
        }
      }

      let targetSpeed;

      if (nearestDist < fleeRange) {
        prey.wantAngle = normalizeAngle(Math.atan2(fleeY, fleeX));
        const urgency = 1 - nearestDist / fleeRange;
        targetSpeed = config.PREY_SPEED + (fleeSpeed - config.PREY_SPEED) * urgency;
        prey.fleeing = true;
      } else {
        if (Math.random() < 0.02) {
          prey.wantAngle = Math.random() * PI2;
        }
        targetSpeed = config.PREY_SPEED;
        prey.fleeing = false;
      }

      prey.speed += (targetSpeed - prey.speed) * 0.1;

      const diff = ((prey.wantAngle - prey.angle) % PI2 + PI2 + Math.PI) % PI2 - Math.PI;
      const turnRate = prey.fleeing ? 0.08 : 0.05;
      if (Math.abs(diff) < turnRate) {
        prey.angle = prey.wantAngle;
      } else {
        prey.angle = normalizeAngle(prey.angle + Math.sign(diff) * turnRate);
      }

      // Move
      const move = prey.speed * dt / 1000;
      prey.x += Math.cos(prey.angle) * move;
      prey.y += Math.sin(prey.angle) * move;

      // Bounce off edges
      const dx = prey.x - center;
      const dy = prey.y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > grd * 0.7) {
        prey.wantAngle = Math.atan2(center - prey.y, center - prey.x);
      }
    }
  }

  spawnRandom() {
    const grd = config.GAME_RADIUS;
    const center = grd;
    const angle = Math.random() * PI2;
    const r = Math.sqrt(Math.random()) * grd * 0.7;
    return this.spawnPrey(
      center + Math.cos(angle) * r,
      center + Math.sin(angle) * r
    );
  }

  getAll() {
    return Array.from(this.preys.values());
  }

  get(id) {
    return this.preys.get(id);
  }
}

module.exports = PreyManager;
