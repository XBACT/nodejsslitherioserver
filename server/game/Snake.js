'use strict';

const config = require('../config');
const { PI2, normalizeAngle, angleDiff } = require('../utils/math');

class Snake {
  constructor(id, x, y, name, skin) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.name = name || '';
    this.skin = skin || 0;

    this.angle = Math.round(Math.random() * 256) / 256 * PI2;
    this.wantAngle = this.angle;
    this.dir = 0;
    this.speed = config.NSP1 + config.NSP2;
    this.boosting = false;
    this.wantBoost = false;
    this.fam = config.INITIAL_FAM;
    this.sct = 0;
    this.sc = 1;
    this.scang = 1;
    this.spang = 1;
    this.killCount = 0;
    this.rsc = 0;

    this.alive = true;
    this.spawnTime = Date.now();

    this.prevX = x;
    this.prevY = y;

    this.body = [];
    this._initBody();

    this.distSinceLastPt = 0;

    this.pendingBodyPoints = [];
    this.pendingTailRemoves = 0;
    this.pendingBoostDrops = [];

    this.player = null;

    this.growthBuffer = 0;
    this.prevTl = null;

    this.maxBodyDist = 0;
  }

  _initBody() {
    const msl = config.DEFAULT_MSL;
    const segs = config.INITIAL_SEGMENTS;
    const backAngle = normalizeAngle(this.angle + Math.PI);
    this.body = [];
    for (let i = segs - 1; i >= 0; i--) {
      const px = this.x + Math.cos(backAngle) * msl * i;
      const py = this.y + Math.sin(backAngle) * msl * i;
      const a = (i === 0) ? this.angle : normalizeAngle(
        Math.atan2(this.y - py, this.x - px)
      );
      this.body.push({
        x: px,
        y: py,
        iang: Math.round(a / PI2 * 65536) & 0xFFFF,
      });
    }
    this.sct = segs;
    this._updateDerived();
    this.visualBody = this.body.map(pt => ({ x: pt.x, y: pt.y, tx: pt.x, ty: pt.y }));
  }

  _applyCST() {
    const vb = this.visualBody;
    const n = vb.length;
    const refIdx = n - 3;
    if (refIdx < 1) return;

    let ref = vb[refIdx];
    let w = 0;
    let cnt = 0;
    for (let q = refIdx - 1; q >= 0; q--) {
      const pt = vb[q];
      cnt++;
      if (cnt <= 4) w = config.CST * cnt / 4;
      pt.tx += (ref.tx - pt.tx) * w;
      pt.ty += (ref.ty - pt.ty) * w;
      ref = pt;
    }
  }

  easeVisualBody() {
    const rate = 0.12;
    for (const pt of this.visualBody) {
      pt.x += (pt.tx - pt.x) * rate;
      pt.y += (pt.ty - pt.y) * rate;
    }
  }

  _updateDerived() {
    this.sc = Math.min(6, 1 + (this.sct - 2) / 106);
    this.scang = 0.13 + 0.87 * Math.pow((7 - this.sc) / 6, 2);
    const spangdv = config.SPANGDV;
    this.spang = Math.min(1, this._getBaseSpeed() / spangdv);
  }

  _getBaseSpeed() {
    return config.NSP1 + config.NSP2 * this.sc;
  }

  _getBoostSpeed() {
    return this._getBaseSpeed() + config.NSP3;
  }

  setWantAngle(angle) {
    const normalized = normalizeAngle(angle);
    this.wantAngle = Math.round(normalized / PI2 * 256) / 256 * PI2;
  }

  setBoost(active) {
    this.wantBoost = active;
  }

  _canBoost() {
    return this.getScore() >= 12 && (this.fam > 0 || this.sct > 1);
  }

  update(dt) {
    if (!this.alive) return null;

    if (this.wantBoost && this._canBoost()) {
      this.boosting = true;
    } else if (!this.wantBoost || !this._canBoost()) {
      this.boosting = false;
    }

    const baseSpeed = this._getBaseSpeed();
    const targetSpeed = Math.min(this.boosting ? this._getBoostSpeed() : baseSpeed, 14.0);
    this.speed += (targetSpeed - this.speed) * 0.15;
    this.speed = Math.round(this.speed * 18) / 18;

    const vfr = dt / 8;
    const turnAmount = config.MAMU * vfr * this.scang * this.spang;

    const diff = angleDiff(this.angle, this.wantAngle);
    if (Math.abs(diff) < 0.001) {
      this.dir = 0;
      this.angle = this.wantAngle;
    } else if (diff > 0) {
      this.dir = 2;
      if (diff < turnAmount) {
        this.angle = this.wantAngle;
      } else {
        this.angle = normalizeAngle(this.angle + turnAmount);
      }
    } else {
      this.dir = 1;
      if (-diff < turnAmount) {
        this.angle = this.wantAngle;
      } else {
        this.angle = normalizeAngle(this.angle - turnAmount);
      }
    }

    this.angle = Math.round(this.angle / PI2 * 256) / 256 * PI2;

    const msl = config.DEFAULT_MSL;
    const csp = Math.min(this.speed * vfr / 4, msl);

    this.prevX = this.x;
    this.prevY = this.y;
    this.x += Math.cos(this.angle) * csp;
    this.y += Math.sin(this.angle) * csp;

    const cx = config.GAME_CENTER;
    const cy = config.GAME_CENTER;
    const dx = this.x - cx;
    const dy = this.y - cy;
    const distFromCenter = Math.sqrt(dx * dx + dy * dy);
    const fluxGrd = config.GAME_RADIUS * 0.98;
    if (distFromCenter > fluxGrd) {
      this.alive = false;
      return 'boundary';
    }

    if (this.boosting) {
      this.fam -= config.BOOST_FAM_LOSS;
      while (this.fam <= 0) {
        if (this.sct <= 1) {
          this.fam = 0;
          this.boosting = false;
          break;
        }
        this.fam += 1.0;
        this.body.shift();
        this.visualBody.shift();
        this.sct--;
        this._updateDerived();
        this.pendingTailRemoves++;
      }
      // Drop food from tail every tick while boosting
      if (this.body.length > 0) {
        const tail = this.body[0];
        const spread = this.getBodyRadius() * 0.6;
        const dropAngle = Math.random() * PI2;
        this.pendingBoostDrops.push({
          x: tail.x + Math.cos(dropAngle) * spread * Math.random(),
          y: tail.y + Math.sin(dropAngle) * spread * Math.random(),
        });
      }
    }

    this.distSinceLastPt += csp;

    if (this.distSinceLastPt >= msl) {
      this.distSinceLastPt -= msl;

      const lastPt = this.body[this.body.length - 1];
      const dxPt = this.x - lastPt.x;
      const dyPt = this.y - lastPt.y;
      const dist = Math.sqrt(dxPt * dxPt + dyPt * dyPt);
      const ptAngle = dist > 0.1 ? normalizeAngle(Math.atan2(dyPt, dxPt)) : normalizeAngle(this.angle);
      const ptIang = Math.round(ptAngle / PI2 * 65536) & 0xFFFF;

      const decodedAngle = ptIang * PI2 / 65536;
      const newPt = {
        x: lastPt.x + Math.cos(decodedAngle) * msl,
        y: lastPt.y + Math.sin(decodedAngle) * msl,
        iang: ptIang,
      };

      this.body.push(newPt);

      const lastVisualPt = this.visualBody[this.visualBody.length - 1];
      const newVx = lastVisualPt.tx + Math.cos(decodedAngle) * msl;
      const newVy = lastVisualPt.ty + Math.sin(decodedAngle) * msl;
      this.visualBody.push({
        x: newVx, y: newVy, tx: newVx, ty: newVy,
      });

      let isGrow = false;
      if (this.fam >= 1.0) {
        this.fam -= 1.0;
        this.sct++;
        this._updateDerived();
        isGrow = true;
      } else {
        this.body.shift();
        this.visualBody.shift();
      }

      this._applyCST();

      this.x = newPt.x + Math.cos(this.angle) * this.distSinceLastPt;
      this.y = newPt.y + Math.sin(this.angle) * this.distSinceLastPt;

      this.pendingBodyPoints.push({
        iang: ptIang,
        xx: Math.round(newPt.x) & 0xFFFF,
        yy: Math.round(newPt.y) & 0xFFFF,
        isGrow,
      });
    }

    return null;
  }

  grow() {
    const msl = config.DEFAULT_MSL;
    const lastPt = this.body[this.body.length - 1];
    const dxPt = this.x - lastPt.x;
    const dyPt = this.y - lastPt.y;
    const dist = Math.sqrt(dxPt * dxPt + dyPt * dyPt);
    const ptAngle = dist > 0.1 ? normalizeAngle(Math.atan2(dyPt, dxPt)) : normalizeAngle(this.angle);
    const ptIang = Math.round(ptAngle / PI2 * 65536) & 0xFFFF;

    const decodedAngle = ptIang * PI2 / 65536;
    const newPt = {
      x: lastPt.x + Math.cos(decodedAngle) * msl,
      y: lastPt.y + Math.sin(decodedAngle) * msl,
      iang: ptIang,
    };
    this.body.push(newPt);

    const lastVisualPt = this.visualBody[this.visualBody.length - 1];
    const newVx = lastVisualPt.tx + Math.cos(decodedAngle) * msl;
    const newVy = lastVisualPt.ty + Math.sin(decodedAngle) * msl;
    this.visualBody.push({
      x: newVx, y: newVy, tx: newVx, ty: newVy,
    });
    this._applyCST();

    this.sct++;
    this._updateDerived();

    this.pendingBodyPoints.push({
      iang: ptIang,
      xx: Math.round(newPt.x) & 0xFFFF,
      yy: Math.round(newPt.y) & 0xFFFF,
      isGrow: true,
    });
  }

  updateGrowthBuffer() {
    const newTl = this.sct + Math.min(1, this.fam);
    if (this.prevTl === null) {
      this.prevTl = newTl;
      return;
    }

    this.growthBuffer = Math.max(0, this.growthBuffer - 0.08);

    const d = newTl - this.prevTl;
    if (d > 0) {
      this.growthBuffer += d;
    } else if (d < 0) {
      this.growthBuffer = Math.max(0, this.growthBuffer + d);
    }
    this.prevTl = newTl;
  }

  getHeadRadius() {
    return this.sc * 18;
  }

  getBodyRadius() {
    return this.sc * 17;
  }

  getScore() {
    const { calcScore } = require('../protocol/encoder');
    return calcScore(this.sct, this.fam);
  }

  getSectorX() {
    return Math.floor(this.x / config.SECTOR_SIZE);
  }

  getSectorY() {
    return Math.floor(this.y / config.SECTOR_SIZE);
  }
}

module.exports = Snake;
