'use strict';

const config = require('../config');
const { calcScore } = require('../protocol/encoder');

class Leaderboard {
  constructor() {
    this.entries = [];
    this.lastUpdate = 0;
  }

  update(snakes) {
    const now = Date.now();
    if (now - this.lastUpdate < config.LEADERBOARD_INTERVAL) return false;
    this.lastUpdate = now;

    const scored = [];
    for (const snake of snakes) {
      if (!snake.alive || snake.isBot) continue;
      scored.push({
        snake,
        score: calcScore(snake.sct, snake.fam),
        sct: snake.sct,
        fam: snake.fam,
        cv: snake.skin,
        name: snake.name,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    this.entries = scored.slice(0, config.LEADERBOARD_SIZE);
    return true;
  }

  getRank(snakeId) {
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i].snake.id === snakeId) return i + 1;
    }
    return this.entries.length + 1;
  }

  getMyPosition(snakeId) {
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i].snake.id === snakeId) return i + 1;
    }
    return 0;
  }
}

module.exports = Leaderboard;
