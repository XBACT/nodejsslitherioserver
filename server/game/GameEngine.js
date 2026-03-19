'use strict';

const config = require('../config');
const Snake = require('./Snake');
const FoodManager = require('./FoodManager');
const PreyManager = require('./PreyManager');
const Leaderboard = require('./Leaderboard');
const SpatialGrid = require('./SpatialGrid');
const IdPool = require('../utils/IdPool');
const { distance, randomPosition, PI2 } = require('../utils/math');
const BotManager = require('./BotManager');
const encoder = require('../protocol/encoder');
const SNAKE_ENTER_RANGE = 2800;
const SNAKE_EXIT_RANGE = 3200;

class GameEngine {
  constructor() {
    this.snakes = new Map();
    this.players = new Map();
    this.food = new FoodManager();
    this.prey = new PreyManager();
    this.leaderboard = new Leaderboard();
    this.snakeIdPool = new IdPool(65535);
    this.botManager = new BotManager(this);
    this.bodyGrid = new SpatialGrid(
      config.GAME_CENTER * 2,
      config.SPATIAL_CELL_SIZE
    );
    this.tickCount = 0;
    this.lastTickTime = Date.now();
    this.running = false;
    this.tickInterval = null;

    // Pre-spawn food
    this.food.spawnRandomFood(2000);

    // Pre-spawn some prey
    for (let i = 0; i < 20; i++) {
      this.prey.spawnRandom();
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTickTime = Date.now();
    const expectedSnakes = config.BOT_NORMAL_COUNT + config.BOT_CHASER_COUNT;
    config.GAME_RADIUS = Math.max(
      config.GAME_RADIUS_MIN,
      Math.min(config.GAME_RADIUS_MAX, config.GAME_RADIUS_MIN + expectedSnakes * config.GAME_RADIUS_PER_SNAKE)
    );

    this.tickInterval = setInterval(() => this.tick(), config.TICK_INTERVAL);
    this.botManager.start();
    console.log(`Game engine started (${config.TICK_RATE} tps, radius=${config.GAME_RADIUS})`);
  }

  stop() {
    this.running = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  _updateGameRadius() {
    let aliveCount = 0;
    for (const snake of this.snakes.values()) {
      if (snake.alive) aliveCount++;
    }
    const target = Math.max(
      config.GAME_RADIUS_MIN,
      Math.min(
        config.GAME_RADIUS_MAX,
        config.GAME_RADIUS_MIN + aliveCount * config.GAME_RADIUS_PER_SNAKE
      )
    );
    const diff = target - config.GAME_RADIUS;
    if (Math.abs(diff) > 5) {
      config.GAME_RADIUS = Math.round(config.GAME_RADIUS + Math.sign(diff) * 5);
    } else {
      config.GAME_RADIUS = target;
    }
  }

  // Find a spawn position
  _findSafeSpawnPos() {
    const minDist = 300;
    const attempts = 20;

    let bestPos = null;
    let bestMinDist = -1;

    for (let i = 0; i < attempts; i++) {
      const pos = randomPosition(config.GAME_RADIUS, config.GAME_CENTER);
      let closest = Infinity;

      for (const snake of this.snakes.values()) {
        if (!snake.alive) continue;
        const d = distance(pos.x, pos.y, snake.x, snake.y);
        if (d < closest) closest = d;
      }

      if (closest >= minDist) return pos;

      if (closest > bestMinDist) {
        bestMinDist = closest;
        bestPos = pos;
      }
    }

    return bestPos || randomPosition(config.GAME_RADIUS, config.GAME_CENTER);
  }

  spawnSnake(player, name, skin) {
    const id = this.snakeIdPool.acquire();
    if (id === null) return null;

    const pos = this._findSafeSpawnPos();
    const snake = new Snake(id, pos.x, pos.y, name, skin);
    snake.player = player;
    this.snakes.set(id, snake);
    player.snake = snake;
    player.snakeId = id;
    player.deathPos = null;

    return snake;
  }

  removeSnake(snakeId, killedBy) {
    const snake = this.snakes.get(snakeId);
    if (!snake) return;

    snake.alive = false;
    const removePacket = encoder.encodeSnakeRemove(snakeId, 1);
    for (const player of this.players.values()) {
      if (player.snakeId === snakeId) continue;
      if (player.visibleSnakes.has(snakeId)) {
        player.send(removePacket);
      }
    }
    if (snake.player) {
      snake.player.send(encoder.encodeSnakeRemove(snakeId, 1));
      snake.player.send(encoder.encodeDeath(0));
      snake.player.deathPos = { x: snake.x, y: snake.y, time: Date.now() };
      snake.player.snake = null;
      snake.player.snakeId = null;
    }

    if (killedBy) {
      const deathFoods = [];
      const body = snake.body;
      const bodyRadius = snake.getBodyRadius();
      const skinCv = snake.skin % 9;
      const foodSpacing = 8;

      const fullPath = [];
      for (const pt of body) {
        fullPath.push({ x: pt.x, y: pt.y });
      }
      fullPath.push({ x: snake.x, y: snake.y });

      const sc = snake.sc;
      const foodRadiusBase = config.DEAD_FOOD_RADIUS * (0.5 + sc * 0.3);
      const spacingScale = Math.max(0.4, 1.0 - (sc - 1) * 0.1);

      for (let i = 0; i < fullPath.length - 1; i++) {
        const ax = fullPath[i].x, ay = fullPath[i].y;
        const bx = fullPath[i + 1].x, by = fullPath[i + 1].y;
        const segDx = bx - ax, segDy = by - ay;
        const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
        if (segLen < 0.1) continue;

        const px = -segDy / segLen, py = segDx / segLen;

        const steps = Math.max(1, Math.round(segLen / (foodSpacing * spacingScale)));
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          const cx = ax + segDx * t;
          const cy = ay + segDy * t;
          const spread = (Math.random() - 0.5) * bodyRadius * 1.2;
          const fx = cx + px * spread;
          const fy = cy + py * spread;
          const cv = (skinCv + Math.floor(Math.random() * 3)) % config.FOOD_COLORS;
          const radius = foodRadiusBase * (0.7 + Math.random() * 0.6);
          const food = this.food.spawnFood(fx, fy, cv, radius, true);
          if (food) deathFoods.push(food);
        }
      }

      {
        const food = this.food.spawnFood(snake.x, snake.y, skinCv, foodRadiusBase * 1.5, true);
        if (food) deathFoods.push(food);
      }

      for (const food of deathFoods) {
        this.broadcastNearVersioned(food.x, food.y, (pv) =>
          encoder.encodeFoodSpawn(food.sx, food.sy, food.rx, food.ry, food.cv, food.radius, pv)
        );
      }
    }

    // Update killer's kill count
    if (killedBy) {
      const killer = this.snakes.get(killedBy);
      if (killer) {
        killer.killCount++;
        this.broadcastNear(killer.x, killer.y, encoder.encodeKillCount(killedBy, killer.killCount));
      }
    }

    // Clean up from all players' visibility tracking
    for (const player of this.players.values()) {
      player.visibleSnakes.delete(snakeId);
    }

    this.snakes.delete(snakeId);
    this.snakeIdPool.release(snakeId);
  }

  tick() {
    const now = Date.now();
    const dt = now - this.lastTickTime;
    this.lastTickTime = now;
    this.tickCount++;
    this._updateGameRadius();
    this.botManager.update();
    this._updateSnakeVisibility();
    this._updateSnakes(dt);
    for (const snake of this.snakes.values()) {
      if (snake.alive) snake.updateGrowthBuffer();
    }
    for (const snake of this.snakes.values()) {
      if (snake.alive) snake.easeVisualBody();
    }
    this._rebuildBodyGrid();
    this._checkCollisions();
    this._checkFoodEating();
    this._checkPreyEating();
    this._flushPendingBodyPoints();
    if (this.tickCount % 5 === 0) {
      this._spawnFoodNearLowScorePlayers();
      this.food.spawnRandomFood(config.FOOD_SPAWN_RATE);
    }

    // Update prey
    this.prey.update(dt, Array.from(this.snakes.values()));
    if (this.tickCount % Math.round(config.PREY_SPAWN_INTERVAL / config.TICK_INTERVAL) === 0) {
      const newPrey = this.prey.spawnRandom();
      if (newPrey) {
        this._broadcastPreySpawn(newPrey);
      }
    }

    // Send prey position updates so client stays in sync
    if (this.tickCount % 4 === 0) {
      for (const prey of this.prey.preys.values()) {
        const pkt = encoder.encodePreyUpdate(prey);
        this.broadcastNear(prey.x, prey.y, pkt);
      }
    }

    // Send periodic updates
    this._sendUpdates();

    // Leaderboard + highscore
    if (this.leaderboard.update(Array.from(this.snakes.values()))) {
      this._sendLeaderboard();
      this.broadcast(this._makeHighscorePacket());
    }

    // Minimap
    if (this.tickCount % Math.round(config.MINIMAP_INTERVAL / config.TICK_INTERVAL) === 0) {
      this._sendMinimap();
    }

    // Expire deathPos
    for (const player of this.players.values()) {
      if (player.deathPos && now - player.deathPos.time > 2500) {
        player.deathPos = null;
      }
    }
  }

  _spawnFoodNearLowScorePlayers() {
    if (this.snakes.size === 0) return;

    // Find the average score
    let totalScore = 0;
    let count = 0;
    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      totalScore += snake.getScore();
      count++;
    }
    if (count === 0) return;
    const avgScore = totalScore / count;

    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      const score = snake.getScore();
      if (score < avgScore || score <= 15) {
        const foodCount = Math.min(8, Math.max(3, Math.ceil((avgScore - score) / 5)));
        for (let i = 0; i < foodCount; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 40 + Math.random() * 160;
          const fx = snake.x + Math.cos(angle) * dist;
          const fy = snake.y + Math.sin(angle) * dist;
          const cv = Math.floor(Math.random() * config.FOOD_COLORS);
          const radius = 1.5 + Math.random() * 2.5;
          const food = this.food.spawnFood(fx, fy, cv, radius);
          if (food) {
            this.broadcastNearVersioned(food.x, food.y, (pv) =>
              encoder.encodeFoodSpawn(food.sx, food.sy, food.rx, food.ry, food.cv, food.radius, pv)
            );
          }
        }
      }
    }
  }

  _flushPendingBodyPoints() {
    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      if (snake.pendingBodyPoints.length === 0) continue;
      for (const evt of snake.pendingBodyPoints) {
        this._broadcastBodyPoint(snake, evt);
      }
      snake.pendingBodyPoints.length = 0;
      if (snake.player) {
        snake.player.send(encoder.encodeFamUpdate(snake.id, snake.fam));
      }
    }
  }

  _updateSnakes(dt) {
    const deadSnakes = [];
    for (const [id, snake] of this.snakes) {
      const result = snake.update(dt);
      if (result === 'boundary') {
        deadSnakes.push({ id, killedBy: null });
        continue;
      }

      for (const evt of snake.pendingBodyPoints) {
        this._broadcastBodyPoint(snake, evt);
      }
      snake.pendingBodyPoints.length = 0;

      while (snake.pendingTailRemoves > 0) {
        snake.pendingTailRemoves--;
        if (snake.player) {
          snake.player.send(encoder.encodeTailRemoveSelf(snake.id));
        }
        const tailPkt = encoder.encodeTailRemove(snake.id, snake.fam);
        this._broadcastToVisible(snake, tailPkt);
      }
      for (const drop of snake.pendingBoostDrops) {
        const skinCv = snake.skin % 9;
        const radius = config.BOOST_DROP_RADIUS * (0.5 + snake.sc * 0.2);
        const cv = (skinCv + Math.floor(Math.random() * 3)) % config.FOOD_COLORS;
        const food = this.food.spawnFood(drop.x, drop.y, cv, radius, true);
        if (food) {
          this.broadcastNearVersioned(food.x, food.y, (pv) =>
            encoder.encodeFoodSpawn(food.sx, food.sy, food.rx, food.ry, food.cv, food.radius, pv)
          );
        }
      }
      snake.pendingBoostDrops.length = 0;

      this._broadcastAngle(snake);
    }

    for (const { id, killedBy } of deadSnakes) {
      this.removeSnake(id, killedBy);
    }
  }

  _broadcastBodyPoint(snake, evt) {
    if (snake.player) {
      const selfPkt = encoder.encodeBodyPointAdd(
        snake.id, evt.iang, evt.xx, evt.yy, snake.fam, true, evt.isGrow,
        snake.player.protocolVersion
      );
      snake.player.send(selfPkt);
    }

    for (const player of this.players.values()) {
      if (player.snake && player.snake.alive && player.snake.id !== snake.id) {
        if (player.visibleSnakes.has(snake.id)) {
          const otherPkt = encoder.encodeBodyPointAdd(
            snake.id, evt.iang, evt.xx, evt.yy, snake.fam, false, evt.isGrow,
            player.protocolVersion
          );
          player.send(otherPkt);
        }
      } else if (!player.snake && player.deathPos) {
        if (distance(player.deathPos.x, player.deathPos.y, snake.x, snake.y) < 2500) {
          const otherPkt = encoder.encodeBodyPointAdd(
            snake.id, evt.iang, evt.xx, evt.yy, snake.fam, false, evt.isGrow,
            player.protocolVersion
          );
          player.send(otherPkt);
        }
      }
    }
  }

  _broadcastAngle(snake) {
    if (!snake.alive) return;

    if (snake.player) {
      const selfPkt = encoder.encodeSelfAngleUpdate(
        snake.id, snake.angle, snake.wantAngle, snake.speed, snake.dir,
        snake.player.protocolVersion
      );
      snake.player.send(selfPkt);
    }

    const otherPkt = encoder.encodeAngleUpdate(
      snake.id, snake.angle, snake.wantAngle, snake.speed, snake.dir
    );
    for (const player of this.players.values()) {
      if (player.snake && player.snake.alive && player.snake.id !== snake.id) {
        if (player.visibleSnakes.has(snake.id)) {
          player.send(otherPkt);
        }
      } else if (!player.snake && player.deathPos) {
        if (distance(player.deathPos.x, player.deathPos.y, snake.x, snake.y) < 2500) {
          player.send(otherPkt);
        }
      }
    }
  }

  _updateSnakeVisibility() {
    for (const player of this.players.values()) {
      if (!player.snake || !player.snake.alive) continue;
      const px = player.snake.x;
      const py = player.snake.y;

      for (const [snakeId, snake] of this.snakes) {
        if (!snake.alive || snakeId === player.snake.id) continue;

        const d = distance(px, py, snake.x, snake.y);
        const bodyDist = snake.maxBodyDist || 0;

        if (player.visibleSnakes.has(snakeId)) {
          if (d > SNAKE_EXIT_RANGE + bodyDist) {
            player.visibleSnakes.delete(snakeId);
            player.send(encoder.encodeSnakeRemove(snakeId, 0));
          }
        } else {
          if (d < SNAKE_ENTER_RANGE + bodyDist) {
            player.visibleSnakes.add(snakeId);
            player.send(encoder.encodeSnakeSpawn(snake, player.protocolVersion));
          }
        }
      }

      for (const snakeId of player.visibleSnakes) {
        if (!this.snakes.has(snakeId) || !this.snakes.get(snakeId).alive) {
          player.visibleSnakes.delete(snakeId);
        }
      }
    }
  }

  _rebuildBodyGrid() {
    this.bodyGrid.clear();
    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      const bodyRadius = snake.getBodyRadius();
      const vb = snake.visualBody;
      const totalClip = Math.max(0, 0.6 - Math.min(1, snake.fam) + snake.growthBuffer);
      const startIdx = Math.min(Math.floor(totalClip), Math.max(0, vb.length - 2));
      let maxDistSq = 0;
      for (let i = startIdx; i < vb.length; i++) {
        const pt = vb[i];
        pt._snakeId = snake.id;
        pt._bodyIdx = i;
        this.bodyGrid.insert(pt, pt.x, pt.y, bodyRadius);
        const dx = pt.x - snake.x;
        const dy = pt.y - snake.y;
        const dSq = dx * dx + dy * dy;
        if (dSq > maxDistSq) maxDistSq = dSq;
      }
      snake.maxBodyDist = Math.sqrt(maxDistSq);
    }
  }

  _pointToSegDistSq(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < 0.01) {
      const dx = px - ax; const dy = py - ay;
      return dx * dx + dy * dy;
    }
    let t = ((px - ax) * abx + (py - ay) * aby) / lenSq;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = ax + t * abx;
    const cy = ay + t * aby;
    const dx = px - cx; const dy = py - cy;
    return dx * dx + dy * dy;
  }

  _checkCollisions() {
    const deadSnakes = [];
    const msl = config.DEFAULT_MSL;

    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      const nearby = this.bodyGrid.query(snake.x, snake.y, msl);

      const nearbySnakeIds = new Set();
      for (const pt of nearby) {
        if (pt._snakeId !== snake.id) {
          nearbySnakeIds.add(pt._snakeId);
        }
      }

      let killed = false;
      for (const otherSnakeId of nearbySnakeIds) {
        const otherSnake = this.snakes.get(otherSnakeId);
        if (!otherSnake || !otherSnake.alive) continue;

        const collisionDist = otherSnake.getBodyRadius();
        const collisionDistSq = collisionDist * collisionDist;
        const ob = otherSnake.visualBody;
        const n = ob.length;
        const totalTailClip = Math.max(0, 0.6 - Math.min(1, otherSnake.fam) + otherSnake.growthBuffer);
        const skipPts = Math.min(Math.floor(totalTailClip), Math.max(0, n - 2));
        const fracClip = totalTailClip - skipPts;
        const si = skipPts;
        const visN = n - si;

        if (visN >= 3) {
          let prevMidX = (ob[si].x + ob[si + 1].x) * 0.5;
          let prevMidY = (ob[si].y + ob[si + 1].y) * 0.5;

          if (fracClip < 0.5) {
            const tailX = ob[si].x + (ob[si + 1].x - ob[si].x) * fracClip;
            const tailY = ob[si].y + (ob[si + 1].y - ob[si].y) * fracClip;
            let dSq = this._pointToSegDistSq(
              snake.x, snake.y, tailX, tailY, prevMidX, prevMidY
            );
            if (dSq < collisionDistSq) {
              deadSnakes.push({ id: snake.id, killedBy: otherSnakeId });
              killed = true;
            }
          }

          for (let i = si + 1; i < n - 1 && !killed; i++) {
            const nextMidX = (ob[i].x + ob[i + 1].x) * 0.5;
            const nextMidY = (ob[i].y + ob[i + 1].y) * 0.5;
            const bmx = (prevMidX + 2 * ob[i].x + nextMidX) * 0.25;
            const bmy = (prevMidY + 2 * ob[i].y + nextMidY) * 0.25;

            let dSq = this._pointToSegDistSq(
              snake.x, snake.y, prevMidX, prevMidY, bmx, bmy
            );
            if (dSq < collisionDistSq) {
              deadSnakes.push({ id: snake.id, killedBy: otherSnakeId });
              killed = true;
              break;
            }
            dSq = this._pointToSegDistSq(
              snake.x, snake.y, bmx, bmy, nextMidX, nextMidY
            );
            if (dSq < collisionDistSq) {
              deadSnakes.push({ id: snake.id, killedBy: otherSnakeId });
              killed = true;
              break;
            }

            prevMidX = nextMidX;
            prevMidY = nextMidY;
          }

          if (!killed) {
            let dSq = this._pointToSegDistSq(
              snake.x, snake.y, prevMidX, prevMidY, ob[n - 1].x, ob[n - 1].y
            );
            if (dSq < collisionDistSq) {
              deadSnakes.push({ id: snake.id, killedBy: otherSnakeId });
              killed = true;
            }
          }
        } else if (visN === 2) {
          const dSq = this._pointToSegDistSq(
            snake.x, snake.y,
            ob[si].x, ob[si].y, ob[si + 1].x, ob[si + 1].y
          );
          if (dSq < collisionDistSq) {
            deadSnakes.push({ id: snake.id, killedBy: otherSnakeId });
            killed = true;
          }
        }

        if (killed) break;
      }

    }

    for (const { id, killedBy } of deadSnakes) {
      if (this.snakes.has(id)) {
        this.removeSnake(id, killedBy);
      }
    }
  }

  // Check if two line segments (p1-p2) and (p3-p4) intersect
  _segmentsIntersect(p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y) {
    const d1x = p2x - p1x;
    const d1y = p2y - p1y;
    const d2x = p4x - p3x;
    const d2y = p4y - p3y;
    const cross = d1x * d2y - d1y * d2x;
    if (Math.abs(cross) < 1e-10) return false;
    const dx = p3x - p1x;
    const dy = p3y - p1y;
    const t = (dx * d2y - dy * d2x) / cross;
    const u = (dx * d1y - dy * d1x) / cross;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  _checkSelfCollision(snake) {
    const body = snake.body;
    if (body.length < 4) return false;

    const hx0 = snake.prevX;
    const hy0 = snake.prevY;
    const hx1 = snake.x;
    const hy1 = snake.y;

    const mdx = hx1 - hx0;
    const mdy = hy1 - hy0;
    if (mdx * mdx + mdy * mdy < 0.01) return false;

    for (let i = 0; i < body.length - 3; i++) {
      if (this._segmentsIntersect(hx0, hy0, hx1, hy1,
        body[i].x, body[i].y, body[i + 1].x, body[i + 1].y)) {
        return true;
      }
    }
    return false;
  }

  _checkFoodEating() {
    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      const baseEatRadius = snake.getHeadRadius() + 40;
      const eatRadius = baseEatRadius;
      const nearFoods = this.food.findNear(snake.x, snake.y, eatRadius);

      for (const food of nearFoods) {
        snake.fam += config.FOOD_VALUE;

        this.broadcastNearVersioned(snake.x, snake.y, (pv) =>
          encoder.encodeFoodEat(food.sx, food.sy, food.rx, food.ry, snake.id, pv)
        );

        this.food.removeFood(food);
      }
    }
  }

  _checkPreyEating() {
    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      const basePreyEatRadius = snake.getHeadRadius() + 40;
      const eatRadius = snake.boosting ? basePreyEatRadius * 2 : basePreyEatRadius;

      for (const prey of this.prey.preys.values()) {
        const dx = snake.x - prey.x;
        const dy = snake.y - prey.y;
        if (dx * dx + dy * dy < eatRadius * eatRadius) {
          snake.fam += 0.05;
          this.broadcastNear(snake.x, snake.y, encoder.encodePreyEaten(prey.id, snake.id));
          this.prey.removePrey(prey.id);
          break;
        }
      }
    }
  }

  _broadcastPreySpawn(prey) {
    const buf = new Uint8Array(20);
    let m = 0;
    buf[m++] = 0x79;
    buf[m++] = (prey.id >> 8) & 0xFF;
    buf[m++] = prey.id & 0xFF;
    buf[m++] = prey.cv;
    const xx = Math.round(prey.x * 5);
    buf[m++] = (xx >> 16) & 0xFF;
    buf[m++] = (xx >> 8) & 0xFF;
    buf[m++] = xx & 0xFF;
    const yy = Math.round(prey.y * 5);
    buf[m++] = (yy >> 16) & 0xFF;
    buf[m++] = (yy >> 8) & 0xFF;
    buf[m++] = yy & 0xFF;
    buf[m++] = Math.round(prey.radius * 5);
    buf[m++] = prey.dir + 48;
    const wang = Math.round(prey.wantAngle / PI2 * 16777215) & 0xFFFFFF;
    buf[m++] = (wang >> 16) & 0xFF;
    buf[m++] = (wang >> 8) & 0xFF;
    buf[m++] = wang & 0xFF;
    const ang = Math.round(prey.angle / PI2 * 16777215) & 0xFFFFFF;
    buf[m++] = (ang >> 16) & 0xFF;
    buf[m++] = (ang >> 8) & 0xFF;
    buf[m++] = ang & 0xFF;
    const spd = Math.round(prey.speed * 1000);
    buf[m++] = (spd >> 8) & 0xFF;
    buf[m++] = spd & 0xFF;
    this.broadcastNear(prey.x, prey.y, buf.subarray(0, m));
  }

  _sendUpdates() {
    if (this.tickCount % 4 === 0) {
      for (const snake of this.snakes.values()) {
        if (!snake.alive) continue;
        const famPkt = encoder.encodeFamUpdate(snake.id, snake.fam);
        // Send fam update to self player
        if (snake.player) {
          snake.player.send(famPkt);
        }
        for (const player of this.players.values()) {
          if (!player.snake || !player.snake.alive) continue;
          if (player.visibleSnakes.has(snake.id)) {
            player.send(famPkt);
          }
        }
      }
    }
  }

  _sendLeaderboard() {
    const entries = this.leaderboard.entries.map(e => ({
      sct: e.snake.sct + e.snake.rsc,
      fam: e.snake.fam,
      cv: e.snake.skin,
      name: e.snake.name,
    }));

    for (const player of this.players.values()) {
      if (!player.snake || !player.snake.alive) continue;
      const myPos = this.leaderboard.getMyPosition(player.snake.id);
      const rank = this.leaderboard.getRank(player.snake.id);
      const pkt = encoder.encodeLeaderboard(
        myPos, rank, this.snakes.size, entries
      );
      player.send(pkt);
    }
  }

  _sendMinimap() {
    const size = config.MINIMAP_SIZE;
    const grd = config.GAME_CENTER;
    const diameter = grd * 2;
    const data = new Uint8Array(size * size);

    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      const hx = Math.floor(snake.x / diameter * size);
      const hy = Math.floor(snake.y / diameter * size);
      if (hx >= 0 && hx < size && hy >= 0 && hy < size) {
        data[hy * size + hx] = 1;
      }
      for (const pt of snake.body) {
        const bx = Math.floor(pt.x / diameter * size);
        const by = Math.floor(pt.y / diameter * size);
        if (bx >= 0 && bx < size && by >= 0 && by < size) {
          data[by * size + bx] = 1;
        }
      }
    }

    const pkt = encoder.encodeMinimap(size, data);
    this.broadcast(pkt);
  }

  sendInitialState(player) {
    const snake = player.snake;
    if (!snake) return;

    player.visibleSnakes = new Set();

    player.send(encoder.encodeSnakeSpawn(snake, player.protocolVersion));

    for (const other of this.snakes.values()) {
      if (!other.alive || other.id === snake.id) continue;
      const bodyDist = other.maxBodyDist || 0;
      if (distance(snake.x, snake.y, other.x, other.y) < SNAKE_ENTER_RANGE + bodyDist) {
        player.visibleSnakes.add(other.id);
        player.send(encoder.encodeSnakeSpawn(other, player.protocolVersion));
      }
    }

    // Send visible food sectors
    this._sendVisibleFood(player);

    // Send nearby prey only
    for (const prey of this.prey.preys.values()) {
      if (distance(snake.x, snake.y, prey.x, prey.y) < 2500) {
        this._sendPreyToPlayer(player, prey);
      }
    }

    // Send visible sectors
    const sx = snake.getSectorX();
    const sy = snake.getSectorY();
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        player.send(encoder.encodeSectorAdd(sx + dx, sy + dy));
      }
    }

    // Send highscore display
    player.send(this._makeHighscorePacket());
  }

  _makeHighscorePacket() {
    // Use the top player's score
    let sct = 10, fam = 0;
    if (this.leaderboard.entries.length > 0) {
      const top = this.leaderboard.entries[0];
      sct = top.snake.sct;
      fam = top.snake.fam;
    }
    return encoder.encodeHighscore(
      sct, fam, config.HIGHSCORE_NAME, config.HIGHSCORE_MSG
    );
  }

  _sendVisibleFood(player) {
    const snake = player.snake;
    if (!snake) return;
    const sx = snake.getSectorX();
    const sy = snake.getSectorY();

    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        const foods = this.food.getSectorFoods(sx + dx, sy + dy);
        if (foods.length > 0) {
          const pkt = encoder.encodeFoodSector(sx + dx, sy + dy, foods, player.protocolVersion);
          player.send(pkt);
        }
      }
    }
  }

  _sendPreyToPlayer(player, prey) {
    const buf = new Uint8Array(20);
    let m = 0;
    buf[m++] = 0x79;
    buf[m++] = (prey.id >> 8) & 0xFF;
    buf[m++] = prey.id & 0xFF;
    buf[m++] = prey.cv;
    const xx = Math.round(prey.x * 5);
    buf[m++] = (xx >> 16) & 0xFF;
    buf[m++] = (xx >> 8) & 0xFF;
    buf[m++] = xx & 0xFF;
    const yy = Math.round(prey.y * 5);
    buf[m++] = (yy >> 16) & 0xFF;
    buf[m++] = (yy >> 8) & 0xFF;
    buf[m++] = yy & 0xFF;
    buf[m++] = Math.round(prey.radius * 5);
    buf[m++] = prey.dir + 48;
    const wang = Math.round(prey.wantAngle / PI2 * 16777215) & 0xFFFFFF;
    buf[m++] = (wang >> 16) & 0xFF;
    buf[m++] = (wang >> 8) & 0xFF;
    buf[m++] = wang & 0xFF;
    const ang = Math.round(prey.angle / PI2 * 16777215) & 0xFFFFFF;
    buf[m++] = (ang >> 16) & 0xFF;
    buf[m++] = (ang >> 8) & 0xFF;
    buf[m++] = ang & 0xFF;
    const spd = Math.round(prey.speed * 1000);
    buf[m++] = (spd >> 8) & 0xFF;
    buf[m++] = spd & 0xFF;
    player.send(buf.subarray(0, m));
  }

  addPlayer(player) {
    this.players.set(player.id, player);
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player && player.snakeId) {
      this.removeSnake(player.snakeId, null);
    }
    this.players.delete(playerId);
  }

  broadcast(packet) {
    for (const player of this.players.values()) {
      player.send(packet);
    }
  }

  _broadcastToVisible(snake, packet) {
    for (const player of this.players.values()) {
      if (player.snake && player.snake.alive && player.snake.id !== snake.id) {
        if (player.visibleSnakes.has(snake.id)) {
          player.send(packet);
        }
      } else if (!player.snake && player.deathPos) {
        if (distance(player.deathPos.x, player.deathPos.y, snake.x, snake.y) < 2500) {
          player.send(packet);
        }
      }
    }
  }

  broadcastNear(x, y, packet, range = 2500) {
    for (const player of this.players.values()) {
      let px, py;
      if (player.snake && player.snake.alive) {
        px = player.snake.x;
        py = player.snake.y;
      } else if (player.deathPos) {
        px = player.deathPos.x;
        py = player.deathPos.y;
      } else {
        continue;
      }
      if (distance(px, py, x, y) < range) {
        player.send(packet);
      }
    }
  }

  broadcastNearVersioned(x, y, encodeFn, range = 2500) {
    for (const player of this.players.values()) {
      let px, py;
      if (player.snake && player.snake.alive) {
        px = player.snake.x;
        py = player.snake.y;
      } else if (player.deathPos) {
        px = player.deathPos.x;
        py = player.deathPos.y;
      } else {
        continue;
      }
      if (distance(px, py, x, y) < range) {
        player.send(encodeFn(player.protocolVersion));
      }
    }
  }

  getSnakeCount() {
    return this.snakes.size;
  }
}

module.exports = GameEngine;
