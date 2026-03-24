'use strict';

const path = require('path');
const config = require('./config');
const GameEngine = require('./game/GameEngine');
const WsServer = require('./network/wsServer');
const createHttpServer = require('./httpServer');
const game = new GameEngine();
const wsServer = new WsServer(game);
game.start();
wsServer.start(config.PORT, config.HOST);
const rootDir = path.resolve(__dirname, '..');
createHttpServer(rootDir, 8888);

console.log('');
console.log('Open 127.0.0.1:8080');
console.log('');

// Logging
setInterval(() => {
  const conns = wsServer.getConnectionCount();
  const snakes = game.getSnakeCount();
  const foods = game.food.totalCount;
  const preys = game.prey.preys.size;
  console.log(`Stats: Connections: ${conns} | Snakes: ${snakes} | Foods: ${foods} | Preys: ${preys} | Radius: ${config.GAME_RADIUS}`);
}, 10000);

// Shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  game.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  game.stop();
  process.exit(0);
});
