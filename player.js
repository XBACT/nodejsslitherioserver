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

const Constants = require('./constants');
const { PacketBuilder, PacketReader } = require('./packet');


const STATE = {
    CONNECTED: 0,
    GOT_PROTOCOL_MODE: 1,
    WAITING_SECRET: 2,
    PLAYING: 3
};

class Player {
    constructor(ws, game) {
        this.ws = ws;
        this.game = game;
        this.snake = null;
        
       
        this.state = STATE.CONNECTED;
        this.authenticated = false;
        this.name = '';
        this.skin = 0;
        this.customSkin = null;
        
       
       
        this.wantEtmS = false;
        
       
        this.secret = null;
        
       
        this.lastPacketTime = Date.now();
        this.lastPingSent = 0;
        this.lastSentTime = Date.now();
        
       
        this.visibleSnakes = new Set();
        this.visibleSectors = new Set();
        
       
        this.viewRange = 3000;
    }
    
    handleMessage(data) {
        if (data.length === 0) return;
        
        const firstByte = data[0];
        
       
        if (this.state === STATE.CONNECTED) {
            if (firstByte === 1) {
                this.wantEtmS = false;
                this.state = STATE.GOT_PROTOCOL_MODE;
                console.log('Client selected: no time header mode');
            } else if (firstByte === 2) {
               
               
                this.wantEtmS = true;
                this.state = STATE.GOT_PROTOCOL_MODE;
                console.log('Client selected: time header mode');
            } else if (firstByte === 99) {
                this.wantEtmS = false;
                this.sendPreInit();
                this.state = STATE.WAITING_SECRET;
                console.log('Sent pre-init (6) packet');
            }
            return;
        }
        
        if (this.state === STATE.GOT_PROTOCOL_MODE) {
            if (firstByte === 99 || data.toString().startsWith('c')) {
                this.sendPreInit();
                this.state = STATE.WAITING_SECRET;
                console.log('Sent pre-init (6) packet');
            }
            return;
        }
        
        if (this.state === STATE.WAITING_SECRET) {
            let isSecretResponse = data.length >= 20 && firstByte >= 65 && firstByte <= 122;
            
            if (isSecretResponse && firstByte !== Constants.CLIENT_PACKET.SET_USERNAME) {
                console.log(`Received secret response (${data.length} bytes)`);
                return;
            }
            
            if (firstByte === Constants.CLIENT_PACKET.SET_USERNAME) {
                this.handleSetUsername(data);
                console.log('Spawning player immediately...');
                this.spawn();
                this.state = STATE.PLAYING;
                console.log('Player is now PLAYING');
            }
            return;
        }
        
       
        switch (firstByte) {
            case Constants.CLIENT_PACKET.PING:
                this.handlePing();
                break;
                
            case Constants.CLIENT_PACKET.TURN:
                if (this.snake && data.length >= 2) {
                    const turnValue = data[1];
                    if (turnValue < 128) {
                        this.snake.angle -= 0.05 * (128 - turnValue) / 128;
                    } else {
                        this.snake.angle += 0.05 * (turnValue - 128) / 128;
                    }
                }
                break;
                
            case Constants.CLIENT_PACKET.BOOST_START:
                if (this.snake) {
                    this.snake.setBoost(true);
                }
                break;
                
            case Constants.CLIENT_PACKET.BOOST_END:
                if (this.snake) {
                    this.snake.setBoost(false);
                }
                break;
                
            case Constants.CLIENT_PACKET.CLOSE:
                this.disconnect();
                break;
                
            default:
                if (firstByte <= 250 && this.snake) {
                    this.snake.setWantedAngle(firstByte, true);
                }
                break;
        }
        
        this.lastPacketTime = Date.now();
    }
    
    createPacket(cmd, dataSize = 64) {
        const builder = new PacketBuilder(dataSize + 3);
        if (this.wantEtmS) {
            builder.writeUInt16(this.getTimeSinceLast());
        }
        builder.writeUInt8(cmd);
        return builder;
    }
    
    createRawPacket(cmd, size) {
        const headerSize = this.wantEtmS ? 3 : 1; 
        const buf = Buffer.alloc(headerSize + size);
        let offset = 0;
        
        if (this.wantEtmS) {
            const timeSince = this.getTimeSinceLast();
            buf.writeUInt16BE(timeSince, offset);
            offset += 2;
        }
        buf[offset++] = cmd;
        
        return { buf, offset };
    }
    
    sendPreInit() {
        this.secret = this.generateSecret();
        
        const builder = this.createPacket(Constants.PACKET.PRE_INIT, 50);
        builder.writeBytes(this.secret);
        
        this.send(builder.build());
    }
    
    generateSecret() {
        const length = 30;
        const secret = Buffer.alloc(length);
        
        for (let i = 0; i < length; i++) {
            if (i % 2 === 0) {
                secret[i] = 65 + (i % 26); 
            } else {
                secret[i] = 97 + (i % 26); 
            }
        }
        
        return secret;
    }
    
    handleSetUsername(data) {
        if (data.length < 26) return;
        
        const reader = new PacketReader(data);
        reader.readUInt8(); 
        reader.readUInt8(); 
        reader.readUInt16();
        reader.skip(20);    
        
        this.skin = reader.readUInt8(); 
        const nameLength = reader.readUInt8();
        
        if (nameLength > 0 && reader.remaining >= nameLength) {
            this.name = reader.readString(nameLength);
        }
        
       
        if (reader.remaining >= 2) {
            reader.readUInt8(); 
            reader.readUInt8(); 
        }
        
       
        if (reader.remaining > 0) {
            this.customSkin = reader.readBytes(reader.remaining);
            console.log(`Custom skin data: ${this.customSkin.length} bytes`);
        }
        
        console.log(`Player joining: "${this.name}" skin=${this.skin}`);
        this.authenticated = true;
    }
    
    handlePing() {
        this.lastPingSent = Date.now();
        const builder = this.createPacket(Constants.PACKET.PONG);
        this.send(builder.build());
    }
    
    spawn() {
        try {
            this.snake = this.game.spawnSnake(this.name, this.skin, this.customSkin);
            this.game.players.set(this.ws, this);
            
            console.log(`Snake spawned: id=${this.snake.id} at (${this.snake.x.toFixed(0)}, ${this.snake.y.toFixed(0)}) with ${this.snake.parts.length} parts`);
            
           
            console.log('Sending initial setup (a)...');
            this.sendInitialSetup();
            
           
            console.log('Sending own snake (s)...');
            this.sendOwnSnake();
            
           
            console.log('Sending world state...');
            this.sendWorldState();
            
           
            this.notifyOtherPlayersOfSpawn();
            
            console.log('Spawn complete!');
        } catch (e) {
            console.error('Error in spawn():', e);
        }
    }
    
    notifyOtherPlayersOfSpawn() {
        if (!this.snake) return;
        
        for (const [ws, otherPlayer] of this.game.players) {
            if (ws === this.ws) continue;
            if (!otherPlayer.snake) continue;
            
            const dx = this.snake.x - otherPlayer.snake.x;
            const dy = this.snake.y - otherPlayer.snake.y;
            const distSq = dx * dx + dy * dy;
            
            if (distSq <= otherPlayer.viewRange * otherPlayer.viewRange) {
                console.log(`Notifying player ${otherPlayer.snake.id} about new snake ${this.snake.id}`);
                otherPlayer.sendSnakeSpawn(this.snake);
            }
        }
    }
    
    sendInitialSetup() {
        const builder = this.createPacket(Constants.PACKET.INITIAL_SETUP, 32);
        
        builder.writeUInt24(Constants.GAME_RADIUS);
        builder.writeUInt16(Constants.MAX_SNAKE_PARTS);
        builder.writeUInt16(Constants.SECTOR_SIZE);
        builder.writeUInt16(Constants.SECTOR_COUNT);
        builder.writeUInt8(Constants.SPANGDV);
        builder.writeUInt16(Constants.NSP1);
        builder.writeUInt16(Constants.NSP2);
        builder.writeUInt16(Constants.NSP3);
        builder.writeUInt16(Constants.MAMU);
        builder.writeUInt16(Constants.MANU2);
        builder.writeUInt16(Constants.CST);
        builder.writeUInt8(Constants.PROTOCOL_VERSION);
        
        this.send(builder.build());
    }
    
    sendOwnSnake() {
        if (!this.snake) return;
        this.sendSnakeSpawn(this.snake);
    }
    
    sendWorldState() {
        if (!this.snake) return;
        
       
        const nearbySnakes = this.game.getSnakesInRange(this.snake.x, this.snake.y, this.viewRange);
        for (const snake of nearbySnakes) {
            if (snake.id !== this.snake.id && !this.visibleSnakes.has(snake.id)) {
                this.sendSnakeSpawn(snake);
            }
        }
        
       
        const nearbyFood = this.game.getFoodInRange(this.snake.x, this.snake.y, this.viewRange);
        this.sendFoodBatch(nearbyFood);
        
       
        const nearbyPrey = this.game.getPreyInRange(this.snake.x, this.snake.y, this.viewRange);
        for (const prey of nearbyPrey) {
            this.sendPreySpawn(prey);
        }
        
       
        this.sendActiveSectors();
        
       
        this.sendLeaderboard();
        
       
        this.sendHighscore();
    }
    
    sendSnakeSpawn(snake) {
        const nameBytes = Buffer.from(snake.name || '', 'utf8');
        const customSkinData = snake.customSkin || Buffer.alloc(0);
        
       
        const numParts = snake.parts.length;
        
        const size = 64 + nameBytes.length + customSkinData.length + (numParts + 1) * 2;
        
        const builder = this.createPacket(Constants.PACKET.SNAKE, size);
        
       
        builder.writeUInt16(snake.id);
        
       
        const angValue = Math.floor(snake.angle * 16777215 / (2 * Math.PI)) & 0xFFFFFF;
        builder.writeUInt24(angValue);
        
       
        builder.writeUInt8(48);
        
       
        const wangValue = Math.floor(snake.wantedAngle * 16777215 / (2 * Math.PI)) & 0xFFFFFF;
        builder.writeUInt24(wangValue);
        
       
        builder.writeUInt16(Math.floor(snake.speed * 1000));
        
       
        builder.writeUInt24(Math.floor(snake.fam * 16777215) & 0xFFFFFF);
        
       
        builder.writeUInt8(snake.skin);
        
       
        builder.writeUInt24(Math.floor(snake.x * 5));
        
       
        builder.writeUInt24(Math.floor(snake.y * 5));
        
       
        builder.writeUInt8(nameBytes.length);
        if (nameBytes.length > 0) {
            builder.writeBytes(nameBytes);
        }
        
       
        builder.writeUInt8(customSkinData.length);
        if (customSkinData.length > 0) {
            builder.writeBytes(customSkinData);
        }
        
       
       
        if (numParts === 0) {
           
            const tailX = snake.x - Math.cos(snake.angle) * 42;
            const tailY = snake.y - Math.sin(snake.angle) * 42;
            builder.writeUInt24(Math.floor(tailX * 5));
            builder.writeUInt24(Math.floor(tailY * 5));
            
           
            snake.lastSentPtsEnd = { x: tailX, y: tailY };
        } else {
           
           
            const tail = snake.parts[numParts - 1];
            
           
            builder.writeUInt24(Math.floor(tail.x * 5));
            builder.writeUInt24(Math.floor(tail.y * 5));
            
           
            let prevX = tail.x;
            let prevY = tail.y;
            
            for (let i = numParts - 2; i >= 0; i--) {
                const part = snake.parts[i];
                const dx = Math.round((part.x - prevX) * 2) + 127;
                const dy = Math.round((part.y - prevY) * 2) + 127;
                builder.writeUInt8(Math.max(0, Math.min(255, dx)));
                builder.writeUInt8(Math.max(0, Math.min(255, dy)));
                prevX = part.x;
                prevY = part.y;
            }
            
           
            snake.lastSentPtsEnd = { x: snake.parts[0].x, y: snake.parts[0].y };
        }
        
        this.send(builder.build());
        this.visibleSnakes.add(snake.id);
    }
    
    sendSnakeRemove(snakeId, died = false) {
        const builder = this.createPacket(Constants.PACKET.SNAKE);
        builder.writeUInt16(snakeId);
        builder.writeUInt8(died ? 1 : 0);
        
        this.send(builder.build());
        this.visibleSnakes.delete(snakeId);
    }
    
   
    sendSnakeMove(snake, prevX, prevY) {
        const isOwnSnake = this.snake && snake.id === this.snake.id;
        
        const newX = Math.floor(snake.x) & 0xFFFF;
        const newY = Math.floor(snake.y) & 0xFFFF;
        
        const cmd = 0x67;
        const dataSize = isOwnSnake ? 4 : 6;
        const { buf, offset: startOffset } = this.createRawPacket(cmd, dataSize); 
        
        let offset = startOffset;
        
        if (!isOwnSnake) {
            buf.writeUInt16BE(snake.id, offset);
            offset += 2;
        }
        
        buf.writeUInt16BE(newX, offset);
        offset += 2;
        buf.writeUInt16BE(newY, offset);
        offset += 2;
        
        this.send(buf.slice(0, offset));
    }
    
    sendSnakeIncrease(snake, prevX, prevY) {
        const isOwnSnake = this.snake && snake.id === this.snake.id;
        
        const newX = Math.floor(snake.x) & 0xFFFF;
        const newY = Math.floor(snake.y) & 0xFFFF;
        const famValue = Math.floor(snake.fam * 16777215) & 0xFFFFFF;
        const cmd = 0x6E;
        const dataSize = isOwnSnake ? 7 : 9;
        const { buf, offset: startOffset } = this.createRawPacket(cmd, dataSize); 
        
        let offset = startOffset;
        
        if (!isOwnSnake) {
            buf.writeUInt16BE(snake.id, offset);
            offset += 2;
        }
        
        buf.writeUInt16BE(newX, offset);
        offset += 2;
        buf.writeUInt16BE(newY, offset);
        offset += 2;
        
        buf[offset++] = (famValue >> 16) & 0xFF;
        buf[offset++] = (famValue >> 8) & 0xFF;
        buf[offset++] = famValue & 0xFF;
        
        this.send(buf.slice(0, offset));
    }
    
   
    sendSnakeRotation(snake) {
        if (!snake) return;

        const toAngByte = (rad) => {
            const twoPi = Math.PI * 2;
            let v = Math.floor((rad % twoPi + twoPi) % twoPi * 256 / twoPi) & 0xFF;
            return v;
        };

        const twoPi = Math.PI * 2;
        let diff = (snake.wantedAngle - snake.angle) % twoPi;
        if (diff < -Math.PI) diff += twoPi;
        else if (diff > Math.PI) diff -= twoPi;

        const ang256 = toAngByte(snake.angle);
        const wang256 = toAngByte(snake.wantedAngle);

        const sp = (typeof snake.getCurrentSpeed === 'function') ? snake.getCurrentSpeed() : (snake.speed ?? snake.getBaseSpeed?.() ?? (Constants.NSP1 / 100));
        let speed18 = Math.round(sp * 18);
        if (speed18 < 0) speed18 = 0;
        if (speed18 > 255) speed18 = 255;

        const cmd = (diff < 0) ? 0x65 /* 'e' */ : 0x34 /* '4' */;
        const { buf, offset: startOffset } = this.createRawPacket(cmd, 5);
        let offset = startOffset;

        buf.writeUInt16BE(snake.id, offset);
        offset += 2;
        buf[offset++] = ang256;
        buf[offset++] = wang256;
        buf[offset++] = speed18;

        this.send(buf);
    }
    
    sendSnakeShrink(snake) {
        const famValue = Math.floor(snake.fam * 16777215) & 0xFFFFFF;
        
        const dataSize = 5; 
        const { buf, offset: startOffset } = this.createRawPacket(0x72, dataSize); 
        let offset = startOffset;
        buf.writeUInt16BE(snake.id, offset);
        offset += 2;
        buf[offset++] = (famValue >> 16) & 0xFF;
        buf[offset++] = (famValue >> 8) & 0xFF;
        buf[offset++] = famValue & 0xFF;
        
        this.send(buf.slice(0, offset));
    }
    
    sendFoodBatch(foods) {
        if (foods.length === 0) return;
        
        const chunkSize = 100;
        for (let i = 0; i < foods.length; i += chunkSize) {
            const chunk = foods.slice(i, i + chunkSize);
            const builder = this.createPacket(Constants.PACKET.FOOD_F, chunk.length * 6 + 10);
            
            for (const food of chunk) {
                builder.writeUInt8(food.color);
                builder.writeUInt16(Math.floor(food.x) & 0xFFFF);
                builder.writeUInt16(Math.floor(food.y) & 0xFFFF);
                builder.writeUInt8(Math.floor(food.size / 5));
            }
            
            this.send(builder.build());
        }
    }
    
    sendFoodSpawn(food, type = 'f') {
        const cmd = type === 'b' ? Constants.PACKET.FOOD_B : Constants.PACKET.FOOD_F2;
        const builder = this.createPacket(cmd);
        builder.writeUInt8(food.color);
        builder.writeUInt16(Math.floor(food.x) & 0xFFFF);
        builder.writeUInt16(Math.floor(food.y) & 0xFFFF);
        builder.writeUInt8(Math.floor(food.size / 5));
        
        this.send(builder.build());
    }
    
    sendFoodEaten(x, y, eaterId) {
        const builder = this.createPacket(Constants.PACKET.EAT_FOOD);
        builder.writeUInt16(Math.floor(x) & 0xFFFF);
        builder.writeUInt16(Math.floor(y) & 0xFFFF);
        if (eaterId !== undefined) {
            builder.writeUInt16(eaterId);
        }
        
        this.send(builder.build());
    }
    
    sendPreySpawn(prey) {
        const builder = this.createPacket(Constants.PACKET.PREY, 25);
        builder.writeUInt16(prey.id);
        builder.writeUInt8(prey.color);
        builder.writeUInt24(Math.floor(prey.x * 5));
        builder.writeUInt24(Math.floor(prey.y * 5));
        builder.writeUInt8(Math.floor(prey.size / 5));
        builder.writeUInt8(prey.direction + 48);
        builder.writeUInt24(Math.floor(prey.wantedAngle * 16777215 / (2 * Math.PI)) & 0xFFFFFF);
        builder.writeUInt24(Math.floor(prey.angle * 16777215 / (2 * Math.PI)) & 0xFFFFFF);
        builder.writeUInt16(Math.floor(prey.speed * 1000));
        
        this.send(builder.build());
    }
    
    sendPreyRemove(preyId) {
        const builder = this.createPacket(Constants.PACKET.PREY);
        builder.writeUInt16(preyId);
        this.send(builder.build());
    }
    
    sendPreyEaten(preyId, eaterId) {
        const builder = this.createPacket(Constants.PACKET.PREY);
        builder.writeUInt16(preyId);
        builder.writeUInt16(eaterId);
        this.send(builder.build());
    }
    
    sendActiveSectors() {
        if (!this.snake) return;
        
        const sectorX = Math.floor(this.snake.x / Constants.SECTOR_SIZE);
        const sectorY = Math.floor(this.snake.y / Constants.SECTOR_SIZE);
        
        const range = 5;
        for (let dy = -range; dy <= range; dy++) {
            for (let dx = -range; dx <= range; dx++) {
                const sx = sectorX + dx;
                const sy = sectorY + dy;
                
                if (sx < 0 || sy < 0 || sx >= Constants.SECTOR_COUNT || sy >= Constants.SECTOR_COUNT) {
                    continue;
                }
                
                const sectorKey = `${sx},${sy}`;
                
                if (!this.visibleSectors.has(sectorKey)) {
                    const builder = this.createPacket(Constants.PACKET.ADD_SECTOR);
                    builder.writeUInt8(sx);
                    builder.writeUInt8(sy);
                    this.send(builder.build());
                    this.visibleSectors.add(sectorKey);
                }
            }
        }
    }
    
    sendLeaderboard() {
        const leaders = this.game.getLeaderboard(10);
        const playerRank = this.snake ? this.game.getPlayerRank(this.snake.id) : 0;
        
        const builder = this.createPacket(Constants.PACKET.LEADERBOARD, 512);
        
        builder.writeUInt8(playerRank <= 10 ? playerRank : 0);
        builder.writeUInt16(playerRank);
        builder.writeUInt16(this.game.snakes.size);
        
        for (const snake of leaders) {
           
           
            const displaySct = snake.sct - (snake.pendingGrowth || 0);
            builder.writeUInt16(Math.max(2, displaySct));
            builder.writeUInt24(Math.floor(snake.fam * 16777215) & 0xFFFFFF);
            builder.writeUInt8(0);
            
            const nameBytes = Buffer.from(snake.name || '', 'utf8');
            builder.writeUInt8(nameBytes.length);
            if (nameBytes.length > 0) {
                builder.writeBytes(nameBytes);
            }
        }
        
        this.send(builder.build());
    }
    
    sendHighscore() {
        const leaders = this.game.getLeaderboard(1);
        const topSnake = leaders[0];
        
        if (!topSnake) return;
        
        const builder = this.createPacket(Constants.PACKET.HIGHSCORE, 128);
        
        builder.writeUInt24(topSnake.sct);
        builder.writeUInt24(Math.floor(topSnake.fam * 16777215) & 0xFFFFFF);
        
        const nameBytes = Buffer.from(topSnake.name || '', 'utf8');
        builder.writeUInt8(nameBytes.length);
        if (nameBytes.length > 0) {
            builder.writeBytes(nameBytes);
        }
        
       
        builder.writeUInt8(0);
        
        this.send(builder.build());
    }
    
    sendDeath(deathType = 0) {
        const builder = this.createPacket(Constants.PACKET.DEATH);
        builder.writeUInt8(deathType);
        this.send(builder.build());
    }
    
    sendMinimap() {
        if (!this.snake) return;
        
        const builder = this.createPacket(Constants.PACKET.MINIMAP, 512);
        
        const mapSize = 80;
        const worldSize = Constants.GAME_RADIUS * 2;
        const cellSize = worldSize / mapSize;
        
        const bitmap = new Array(mapSize * mapSize).fill(false);
        
        for (const snake of this.game.snakes.values()) {
            const mx = Math.floor(snake.x / cellSize);
            const my = Math.floor(snake.y / cellSize);
            if (mx >= 0 && mx < mapSize && my >= 0 && my < mapSize) {
                bitmap[my * mapSize + mx] = true;
            }
            
           
            for (let i = 0; i < snake.parts.length; i += 3) {
                const part = snake.parts[i];
                const px = Math.floor(part.x / cellSize);
                const py = Math.floor(part.y / cellSize);
                if (px >= 0 && px < mapSize && py >= 0 && py < mapSize) {
                    bitmap[py * mapSize + px] = true;
                }
            }
        }
        
        let i = 0;
        while (i < bitmap.length) {
            let emptyCount = 0;
            while (i + emptyCount < bitmap.length && !bitmap[i + emptyCount] && emptyCount < 127) {
                emptyCount++;
            }
            
            if (emptyCount > 0) {
                builder.writeUInt8(128 + emptyCount);
                i += emptyCount;
            } else {
                let bits = 0;
                let count = 0;
                while (count < 7 && i < bitmap.length) {
                    bits = (bits << 1) | (bitmap[i] ? 1 : 0);
                    i++;
                    count++;
                }
                while (count < 7) {
                    bits = bits << 1;
                    count++;
                }
                builder.writeUInt8(bits & 0x7F);
            }
        }
        
        this.send(builder.build());
    }
    
    sendFamUpdate(snake) {
        const famValue = Math.floor(snake.fam * 16777215) & 0xFFFFFF;
        
        const dataSize = 5; 
        const { buf, offset: startOffset } = this.createRawPacket(Constants.PACKET.UPDATE_FAM, dataSize); 
        let offset = startOffset;
        buf.writeUInt16BE(snake.id, offset);
        offset += 2;
        buf[offset++] = (famValue >> 16) & 0xFF;
        buf[offset++] = (famValue >> 8) & 0xFF;
        buf[offset++] = famValue & 0xFF;
        
        this.send(buf.slice(0, offset));
    }
    
    getTimeSinceLast() {
        const now = Date.now();
        const diff = Math.min(65535, now - this.lastSentTime);
        this.lastSentTime = now;
        return diff;
    }
    
    send(data) {
        if (this.ws.readyState === 1) {
            try {
                this.ws.send(data);
            } catch (e) {
                console.error('Send error:', e);
            }
        }
    }
    
    update() {
        if (!this.snake || this.state !== STATE.PLAYING) return;
        this.updateVisibility();
    }
    
    updateVisibility() {
        if (!this.snake) return;
        
        const viewRange = this.viewRange;
        
        for (const snake of this.game.snakes.values()) {
            if (snake.id === this.snake.id) continue;
            
            const dx = snake.x - this.snake.x;
            const dy = snake.y - this.snake.y;
            const distSq = dx * dx + dy * dy;
            const inRange = distSq <= viewRange * viewRange;
            
            if (inRange && !this.visibleSnakes.has(snake.id)) {
                this.sendSnakeSpawn(snake);
            } else if (!inRange && this.visibleSnakes.has(snake.id)) {
                this.sendSnakeRemove(snake.id, false);
            }
        }
        
        this.sendActiveSectors();
    }
    
    disconnect() {
        if (this.snake) {
            this.game.removeSnake(this.snake.id, true);
            this.game.players.delete(this.ws);
        }
        
        try {
            this.ws.close();
        } catch (e) {
           
        }
    }
}

module.exports = Player;
