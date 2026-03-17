'use strict';

const config = require('../config');
const { randomInt, randomFloat } = require('../utils/math');

class FoodManager {
  constructor() {
    // Foods stored by sector key "sx,sy"
    this.sectors = new Map();
    this.totalCount = 0;
  }

  _sectorKey(sx, sy) {
    return (sx << 8) | sy;
  }

  getSectorFoods(sx, sy) {
    return this.sectors.get(this._sectorKey(sx, sy)) || [];
  }

  spawnFood(x, y, cv, radius, force) {
    const sectorSize = config.SECTOR_SIZE;
    const ssd256 = sectorSize / 256;
    const sx = Math.floor(x / sectorSize);
    const sy = Math.floor(y / sectorSize);
    const rx = Math.floor((x - sx * sectorSize) / ssd256);
    const ry = Math.floor((y - sy * sectorSize) / ssd256);
    const qx = sx * sectorSize + rx * ssd256;
    const qy = sy * sectorSize + ry * ssd256;

    const food = {
      sx, sy, rx, ry, cv,
      radius: radius || config.FOOD_BASE_RADIUS,
      x: qx, y: qy,
      id: (sx << 24) | (sy << 16) | (rx << 8) | ry,
    };

    const key = this._sectorKey(sx, sy);
    let sector = this.sectors.get(key);
    if (!sector) {
      sector = [];
      this.sectors.set(key, sector);
    }
    if (force || sector.length < config.MAX_FOOD_PER_SECTOR) {
      sector.push(food);
      this.totalCount++;
      return food;
    }
    return null;
  }

  removeFood(food) {
    const key = this._sectorKey(food.sx, food.sy);
    const sector = this.sectors.get(key);
    if (!sector) return;
    const idx = sector.indexOf(food);
    if (idx !== -1) {
      sector[idx] = sector[sector.length - 1];
      sector.pop();
      this.totalCount--;
      if (sector.length === 0) this.sectors.delete(key);
    }
  }

  // Spawn random food across the map
  spawnRandomFood(count) {
    const spawned = [];
    const grd = config.GAME_RADIUS;
    const center = grd;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * grd * 0.7;
      const x = center + Math.cos(angle) * r;
      const y = center + Math.sin(angle) * r;
      const cv = randomInt(0, config.FOOD_COLORS - 1);
      const radius = randomFloat(1.5, 4.0);
      const food = this.spawnFood(x, y, cv, radius);
      if (food) spawned.push(food);
    }
    return spawned;
  }

  // Spawn food at a specific location
  spawnDeathFood(x, y, count, radius) {
    const spawned = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 80;
      const fx = x + Math.cos(angle) * dist;
      const fy = y + Math.sin(angle) * dist;
      const cv = randomInt(0, config.FOOD_COLORS - 1);
      const food = this.spawnFood(fx, fy, cv, radius || config.DEAD_FOOD_RADIUS);
      if (food) spawned.push(food);
    }
    return spawned;
  }

  // Find food near a point
  findNear(x, y, radius) {
    const sectorSize = config.SECTOR_SIZE;
    const sx0 = Math.floor((x - radius) / sectorSize);
    const sx1 = Math.floor((x + radius) / sectorSize);
    const sy0 = Math.floor((y - radius) / sectorSize);
    const sy1 = Math.floor((y + radius) / sectorSize);
    const results = [];

    for (let sx = sx0; sx <= sx1; sx++) {
      for (let sy = sy0; sy <= sy1; sy++) {
        const sector = this.sectors.get(this._sectorKey(sx, sy));
        if (!sector) continue;
        for (const food of sector) {
          const dx = food.x - x;
          const dy = food.y - y;
          if (dx * dx + dy * dy <= radius * radius) {
            results.push(food);
          }
        }
      }
    }
    return results;
  }

  clearSector(sx, sy) {
    const key = this._sectorKey(sx, sy);
    const sector = this.sectors.get(key);
    if (sector) {
      this.totalCount -= sector.length;
      this.sectors.delete(key);
    }
  }
}

module.exports = FoodManager;
