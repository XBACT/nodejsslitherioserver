'use strict';

const WebSocket = require('ws');
const config = require('../config');
const Player = require('./Player');
const encoder = require('../protocol/encoder');
const decoder = require('../protocol/decoder');

class WsServer {
  constructor(gameEngine) {
    this.game = gameEngine;
    this.wss = null;
  }

  start(port, host) {
    this.wss = new WebSocket.Server({
      port,
      host,
      path: '/slither',
      perMessageDeflate: false,
      maxPayload: 4096,
    });

    this.wss.on('listening', () => {
      const addr = this.wss.address();
      console.log(`WebSocket server listening on ${addr.address}:${addr.port}/slither`);
    });

    this.wss.on('connection', (ws, req) => {
      this._handleConnection(ws, req);
    });

    this.wss.on('error', (err) => {
      console.error('WebSocket server error:', err.message);
    });
  }

  _handleConnection(ws, req) {
    ws.binaryType = 'arraybuffer';
    const player = new Player(ws);
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[Connect] Player ${player.id} from ${ip}`);

    ws.on('message', (data) => {
      this._handleMessage(player, data);
    });

    ws.on('close', () => {
      console.log(`[Disconnect] Player ${player.id}`);
      this.game.removePlayer(player.id);
      player.cleanup();
    });

    ws.on('error', (err) => {
      console.error(`[Error] Player ${player.id}: ${err.message}`);
    });
  }

  _handleMessage(player, rawData) {
    const data = new Uint8Array(rawData);
    if (data.length === 0) return;

    switch (player.state) {
      case 'connected':
        this._handleHandshake(player, data);
        break;
      case 'handshake':
        this._handlePreLogin(player, data);
        break;
      case 'playing':
        this._handleInput(player, data);
        break;
    }
  }

  _handleHandshake(player, data) {

    if (data.length === 1 && (data[0] === 0x01 || data[0] === 0x02)) {
      if (data[0] === 0x02) {
        player.wantSeq = true;
      }
      player.wantEtm = true;
      return;
    }

    if (!player.wantEtm) {
      player.needsPrefix = true;
      if (data.length >= 2 && data[1] === 0x04) {
        player.clientType = 'precise';
        player.protocolVersion = 13;
      } else {
        player.clientType = 'ntl';
        player.protocolVersion = 11;
      }
    } else {
      player.needsPrefix = false;
      player.clientType = 'ntl';
      player.protocolVersion = 15;
    }

    player.send(encoder.encodeServerVersion(config.NTL_SECRET));
    player.state = 'handshake';
  }

  _handlePreLogin(player, data) {

    if (!player.gotRandomId) {
      if (data[0] === 0x73 && data.length > 6 && data[1] < 65) {
        this._processLogin(player, data);
        return;
      }
      player.gotRandomId = true;
      return;
    }

    if (data[0] === 0x73) {
      this._processLogin(player, data);
    }
  }

  _processLogin(player, data) {
    const login = decoder.decodeLoginPacket(data);
    if (!login) {
      console.log(`[Login] Player ${player.id}: invalid login packet`);
      player.ws.close();
      return;
    }
    if (!login.precise && player.clientType === 'precise') {
      player.clientType = 'ntl';
      player.protocolVersion = 15;
    }

    console.log(`[Login] Player ${player.id}: name="${login.name}" skin=${login.skin} proto=${player.protocolVersion}`);

    // Add player
    this.game.addPlayer(player);

    // Send init packet
    const initPkt = encoder.encodeInitPacket({
      sid: player.id,
      protocolVersion: player.protocolVersion,
    });
    player.send(initPkt);

    // Spawn snake
    const snake = this.game.spawnSnake(player, login.name, login.skin);
    if (!snake) {
      console.log(`[Login] Player ${player.id}: failed to spawn snake`);
      player.ws.close();
      return;
    }

    player.state = 'playing';

    // Send initial game state
    this.game.sendInitialState(player);

    console.log(`[Login] Player ${player.id}: playing! snake=${snake.id} pos=(${Math.round(snake.x)},${Math.round(snake.y)})`);
  }

  _handleInput(player, data) {
    if (data.length === 1 && data[0] === 0xFB) {
      player.lastPing = Date.now();
      player.send(encoder.encodePong());
      return;
    }

    // Dead player trying to re-login
    if (!player.snake || !player.snake.alive) {
      if (data[0] === 0x73 && data.length > 6) {
        this._handleReLogin(player, data);
      }
      return;
    }

    const input = decoder.decodeInput(data);
    if (!input) return;

    switch (input.type) {
      case 'angle':
        player.snake.setWantAngle(input.angle);
        break;
      case 'boost':
        player.snake.setBoost(input.active);
        break;
      case 'turn':
        if (input.direction === 'left') {
          player.snake.setWantAngle(
            player.snake.wantAngle - input.amount * 0.01
          );
        } else {
          player.snake.setWantAngle(
            player.snake.wantAngle + input.amount * 0.01
          );
        }
        break;
      case 'ping':
        player.lastPing = Date.now();
        player.send(encoder.encodePong());
        break;
    }
  }

  _handleReLogin(player, data) {
    const login = decoder.decodeLoginPacket(data);
    if (!login) return;

    console.log(`[ReLogin] Player ${player.id}: name="${login.name}"`);

    // Send init
    const initPkt = encoder.encodeInitPacket({
      sid: player.id,
      protocolVersion: player.protocolVersion,
    });
    player.send(initPkt);

    // Spawn new snake
    const snake = this.game.spawnSnake(player, login.name, login.skin);
    if (!snake) return;

    this.game.sendInitialState(player);
  }

  getConnectionCount() {
    return this.wss ? this.wss.clients.size : 0;
  }
}

module.exports = WsServer;
