'use strict';

const config = require('../config');

let nextPlayerId = 1;

class Player {
  constructor(ws) {
    this.id = nextPlayerId++;
    this.ws = ws;
    this.snake = null;
    this.snakeId = null;
    this.state = 'connected';
    this.lastPing = Date.now();
    this.wantEtm = false;
    this.wantSeq = false;
    this.gotVersion = false;
    this.gotRandomId = false;
    this.protocolVersion = config.PROTOCOL_VERSION;
    this.needsPrefix = false;
    this.clientType = 'standard';
    this.deathPos = null;
    this.visibleSnakes = new Set();

    this._sendQueue = [];
    this._sendTimer = null;
  }

  send(data) {
    if (this.ws.readyState !== 1) return;
    try {
      if (this.needsPrefix) {
        const prefixed = new Uint8Array(2 + data.length);
        prefixed[0] = 0;
        prefixed[1] = 0;
        prefixed.set(data instanceof Uint8Array ? data : new Uint8Array(data), 2);
        this.ws.send(prefixed);
      } else {
        this.ws.send(data);
      }
    } catch (e) {
    }
  }

  // Batch send
  queueSend(data) {
    this._sendQueue.push(data);
    if (!this._sendTimer) {
      this._sendTimer = setImmediate(() => {
        this._flushQueue();
      });
    }
  }

  _flushQueue() {
    this._sendTimer = null;
    if (this._sendQueue.length === 0) return;
    if (this.ws.readyState !== 1) {
      this._sendQueue.length = 0;
      return;
    }

    // Bundle packets
    if (this._sendQueue.length === 1) {
      try {
        this.ws.send(this._sendQueue[0]);
      } catch (e) {}
    } else {
      const { bundlePackets } = require('../protocol/encoder');
      try {
        this.ws.send(bundlePackets(this._sendQueue));
      } catch (e) {}
    }
    this._sendQueue.length = 0;
  }

  cleanup() {
    if (this._sendTimer) {
      clearImmediate(this._sendTimer);
      this._sendTimer = null;
    }
    this._sendQueue.length = 0;
  }
}

module.exports = Player;
