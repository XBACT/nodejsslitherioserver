'use strict';

class IdPool {
  constructor(max = 65535) {
    this.max = max;
    this.next = 1;
    this.freed = [];
  }

  acquire() {
    if (this.freed.length > 0) return this.freed.pop();
    if (this.next > this.max) return null;
    return this.next++;
  }

  release(id) {
    this.freed.push(id);
  }
}

module.exports = IdPool;
