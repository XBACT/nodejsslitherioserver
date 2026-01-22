/*
 * Copyright (C) 2026 xbact
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * LICENSE file for more details.
 */

const WebSocket = require('ws');
const http = require('http');
const Constants = require('./constants');
const Game = require('./game');
const Player = require('./player');
const { PacketBuilder } = require('./packet');

class SlitherServer {
    constructor(port = 8080) {
        this.port = port;
        this.game = new Game();
        this.players = new Map(); 
        
       
        this.snakePositions = new Map(); 
        
       
        this.game.players = this.players;
        
       
        this.setupGameBroadcasts();
        
       
        this.httpServer = http.createServer((req, res) => {
            if (req.url === '/slither' || req.url === '/') {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Slither.io Server Running - Protocol v11');
            } else {
                res.writeHead(404);
                res.end();
            }
        });
        
       
        this.wss = new WebSocket.Server({ 
            server: this.httpServer,
            path: '/slither'
        });
        
        this.setupWebSocket();
        
       
        this.startGameLoop();
    }
    
    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            const ip = req.socket.remoteAddress;
            console.log(`New connection from ${ip}`);
            
            const player = new Player(ws, this.game);
            this.players.set(ws, player);
            
            ws.on('message', (data) => {
                try {
                    const buffer = Buffer.from(data);
                    player.handleMessage(buffer);
                } catch (e) {
                    console.error('Message handling error:', e);
                }
            });
            
            ws.on('close', () => {
                console.log(`Connection closed: ${ip}`);
                if (player.snake) {
                    this.snakePositions.delete(player.snake.id);
                }
                player.disconnect();
                this.players.delete(ws);
            });
            
            ws.on('error', (err) => {
                console.error('WebSocket error:', err.message);
                if (player.snake) {
                    this.snakePositions.delete(player.snake.id);
                }
                player.disconnect();
                this.players.delete(ws);
            });
        });
        
        this.wss.on('error', (err) => {
            console.error('Server error:', err);
        });
    }
    
    setupGameBroadcasts() {
       
        this.game.broadcastFoodSpawn = (food, type) => {
            this.broadcastInRange(food.x, food.y, 3000, (player) => {
                player.sendFoodSpawn(food, type);
            });
        };
        
        this.game.broadcastFoodEaten = (x, y, eaterId) => {
            this.broadcastInRange(x, y, 3000, (player) => {
                player.sendFoodEaten(x, y, eaterId);
            });
        };
        
        this.game.broadcastPreyEaten = (preyId, eaterId) => {
            this.broadcastAll((player) => {
                player.sendPreyEaten(preyId, eaterId);
            });
        };
        
        this.game.broadcastSnakeDeath = (snakeId) => {
            this.snakePositions.delete(snakeId);
            
            this.broadcastAll((player) => {
                if (player.visibleSnakes.has(snakeId)) {
                    player.sendSnakeRemove(snakeId, true);
                }
                if (player.snake && player.snake.id === snakeId) {
                    player.sendDeath(0);
                }
            });
        };
        
        this.game.broadcastLeaderboard = () => {
            this.broadcastAll((player) => {
                player.sendLeaderboard();
            });
        };
        
        this.game.broadcastMinimap = () => {
            this.broadcastAll((player) => {
                player.sendMinimap();
            });
        };
        
        this.game.sendKillNotification = (targetPlayer, kills) => {
            if (targetPlayer && targetPlayer.snake) {
                const builder = new PacketBuilder();
                builder.writeUInt16(0);
                builder.writeUInt8(Constants.PACKET.KILL);
                builder.writeUInt16(targetPlayer.snake.id);
                builder.writeUInt24(kills);
                targetPlayer.send(builder.build());
            }
        };
    }
    
    broadcastAll(callback) {
        for (const player of this.players.values()) {
            if (player.snake) {
                try {
                    callback(player);
                } catch (e) {
                    console.error('Broadcast error:', e);
                }
            }
        }
    }
    
    broadcastInRange(x, y, range, callback) {
        const rangeSq = range * range;
        for (const player of this.players.values()) {
            if (player.snake) {
                const dx = player.snake.x - x;
                const dy = player.snake.y - y;
                if (dx * dx + dy * dy <= rangeSq) {
                    try {
                        callback(player);
                    } catch (e) {
                        console.error('Broadcast error:', e);
                    }
                }
            }
        }
    }
    
    startGameLoop() {
       
        setInterval(() => {
            this.game.tick();
            
           
            for (const player of this.players.values()) {
                player.update();
            }
        }, Constants.TICK_RATE);
        
        // Unified snake update loop - process both angles and movements together
        // This ensures consistent timing between angle updates and position updates
        setInterval(() => {
            this.processSnakeUpdates();
        }, 8); // 8ms for smooth updates (125 Hz)
        
        console.log(`Game loop started (${Constants.TICK_RATE}ms ticks)`);
    }
    
    processSnakeUpdates() {
        const now = Date.now();
        
        // Process both angle updates and movements in one unified loop
        for (const snake of this.game.snakes.values()) {
            // Initialize timing values
            if (!snake.lastUpdateTime) {
                snake.lastUpdateTime = now;
            }
            if (!snake.lastMoveTime) {
                snake.lastMoveTime = now;
            }
            if (!snake.lastRotationSent) {
                snake.lastRotationSent = now;
                snake.lastSentAngle = snake.angle;
            }
            
            const deltaTime = now - snake.lastUpdateTime;
            snake.lastUpdateTime = now;
            
            // Update snake angle (turning physics)
            snake.update(deltaTime);
            
            // Calculate move interval based on current speed
            // Client formula: csp = sp * vfr / 4, where vfr = deltaTime / 8
            // So in 1 second: sp * (1000/8) / 4 = sp * 31.25 units
            // Time to move MOVE_DISTANCE: MOVE_DISTANCE / (sp * 31.25) * 1000 = MOVE_DISTANCE * 32 / sp
            const sp = snake.getCurrentSpeed();
            let moveInterval = (Constants.MOVE_DISTANCE * 32) / Math.max(0.001, sp);
            moveInterval = Math.max(30, Math.min(500, moveInterval));
            
            // Check if it's time to send a new move packet
            const timeSinceMove = now - snake.lastMoveTime;
            
            if (timeSinceMove >= moveInterval) {
                const prevX = snake.x;
                const prevY = snake.y;
                const prevFam = snake.fam;
                const shouldGrow = snake.hasPendingGrowth();
                
                // Move the snake FIRST (shifts body parts)
                snake.move();
                snake.lastMoveTime = now;
                
                // THEN add tail part if growing (after shift, so it doesn't get overwritten)
                if (shouldGrow && snake.parts.length > 0) {
                    const tail = snake.parts[snake.parts.length - 1];
                    const prev = snake.parts.length > 1 ? snake.parts[snake.parts.length - 2] : { x: snake.x, y: snake.y };
                    const ang = Math.atan2(tail.y - prev.y, tail.x - prev.x);
                    snake.parts.push({
                        x: tail.x + Math.cos(ang) * Constants.MOVE_DISTANCE,
                        y: tail.y + Math.sin(ang) * Constants.MOVE_DISTANCE,
                        dying: false,
                        sp: 0
                    });
                }
                
                // Handle boost food dropping
                if (snake.droppedFood) {
                    const { Food } = require('./food');
                    const worldSize = Constants.GAME_RADIUS * 2;
                    const x = Math.max(50, Math.min(worldSize - 50, snake.droppedFood.x));
                    const y = Math.max(50, Math.min(worldSize - 50, snake.droppedFood.y));
                    
                    const sc = snake.getScale();
                    const baseSize = 24 + Math.floor(sc * 2);
                    const sizeVariation = Math.floor(Math.random() * 2);
                    const foodSize = baseSize + sizeVariation;
                    
                    const food = new Food(x, y, Math.floor(Math.random() * 9), foodSize);
                    this.game.foods.set(food.id, food);
                    this.game.broadcastFoodSpawn(food, 'b');
                }
                
                // Send movement packets to all relevant players
                for (const player of this.players.values()) {
                    if (!player.snake) continue;
                    
                    if (player.visibleSnakes.has(snake.id) || player.snake.id === snake.id) {
                        if (shouldGrow) {
                            player.sendSnakeIncrease(snake, prevX, prevY);
                        } else {
                            player.sendSnakeMove(snake, prevX, prevY);
                            
                            if (Math.abs(snake.fam - prevFam) > 0.001) {
                                player.sendFamUpdate(snake);
                            }
                        }
                    }
                }
                
                if (shouldGrow) {
                    snake.consumeOnePendingGrowth();
                }
                
                this.snakePositions.set(snake.id, {
                    x: snake.x,
                    y: snake.y,
                    sct: snake.sct
                });
            }
            
            // Send rotation packets when angle changes significantly
            // But not too frequently - only when there's meaningful change
            const timeSinceRotation = now - snake.lastRotationSent;
            const angleDiff = Math.abs(snake.angle - (snake.lastSentAngle || 0));
            
            // Send rotation update if:
            // - Significant angle change (> 0.02 radians ≈ 1 degree)
            // - Or periodic update every 150ms to keep client in sync
            if (angleDiff > 0.02 || (timeSinceRotation >= 150 && angleDiff > 0.001)) {
                snake.lastRotationSent = now;
                snake.lastSentAngle = snake.angle;
                
                for (const player of this.players.values()) {
                    if (!player.snake) continue;
                    
                    const isVisible = player.visibleSnakes.has(snake.id) || 
                                     player.snake.id === snake.id;
                    
                    if (isVisible) {
                        player.sendSnakeRotation(snake);
                    }
                }
            }
        }
    }
    
    start() {
        this.httpServer.listen(this.port, '0.0.0.0', () => {
            console.log(`
╔═══════════════════════════════════════════════════════════╗
║           Slither.io Server - Protocol v11                ║
╠═══════════════════════════════════════════════════════════╣
║  Server running on port ${String(this.port).padEnd(5)}                          ║
║  WebSocket path: /slither                                 ║
║                                                           ║
║  World size: ${Constants.GAME_RADIUS * 2} x ${Constants.GAME_RADIUS * 2}                         ║
║  Play area radius: ${Constants.PLAY_RADIUS}                            ║
║  Sector size: ${Constants.SECTOR_SIZE}                                   ║
║  Max snake parts: ${Constants.MAX_SNAKE_PARTS}                               ║
║                                                           ║
║  Initial food: ${String(this.game.foods.size).padEnd(4)}                               ║
║  Initial prey: ${String(this.game.preys.size).padEnd(2)}                                 ║
║                                                           ║
║  Bot settings:                                            ║
║    Min players: ${Constants.MIN_PLAYERS}                                    ║
║    Max bots: ${Constants.MAX_BOTS}                                       ║
╚═══════════════════════════════════════════════════════════╝

Connect with: ws://localhost:${this.port}/slither
            `);
        });
    }
    
    stop() {
       
        for (const [ws, player] of this.players) {
            player.disconnect();
        }
        this.players.clear();
        
        this.wss.close();
        this.httpServer.close();
        console.log('Server stopped');
    }
}


const PORT = parseInt(process.env.PORT) || 8080;
const server = new SlitherServer(PORT);
server.start();


process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    server.stop();
    process.exit(0);
});

module.exports = SlitherServer;
