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
const Snake = require('./snake');
const { Food, Prey, FoodSpawner } = require('./food');

function setSnakeWantedAngleRad(snake, angleRad) {
    const TWO_PI = Math.PI * 2;
    let a = angleRad;
    a = ((a % TWO_PI) + TWO_PI) % TWO_PI;

    const ANGLE_MAX = 16777215;
    const RAD_TO_ANGLE = ANGLE_MAX / TWO_PI;

    snake.wantedAngle = a;
    snake.wang = a * RAD_TO_ANGLE;
}



class Bot {
    constructor(snake, game) {
        this.snake = snake;
        this.game = game;
        this.isBot = true;
        this.lastUpdate = Date.now();
        this.targetFood = null;
        this.avoidDirection = null;
        this.avoidUntil = 0;
        this.wanderAngle = Math.random() * Math.PI * 2;
    }
    
    update() {
        if (!this.snake) return;
        
        const now = Date.now();
        if (now - this.lastUpdate < 100) return;
        this.lastUpdate = now;
        
       
        const nearbySnakes = this.game.getSnakesInRange(this.snake.x, this.snake.y, 200);
        let danger = null;
        let minDangerDist = Infinity;
        
        for (const other of nearbySnakes) {
            if (other.id === this.snake.id) continue;
            
           
            const headDx = other.x - this.snake.x;
            const headDy = other.y - this.snake.y;
            const headDist = Math.sqrt(headDx * headDx + headDy * headDy);
            
            if (headDist < 80 && headDist < minDangerDist) {
                danger = { x: other.x, y: other.y, dist: headDist };
                minDangerDist = headDist;
            }
            
           
            for (const part of other.parts) {
                const dx = part.x - this.snake.x;
                const dy = part.y - this.snake.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 60 && dist < minDangerDist) {
                    danger = { x: part.x, y: part.y, dist };
                    minDangerDist = dist;
                }
            }
        }
        
       
        if (danger) {
            const awayAngle = Math.atan2(this.snake.y - danger.y, this.snake.x - danger.x);
            const randomOffset = (Math.random() - 0.5) * 0.5;
            setSnakeWantedAngleRad(this.snake, awayAngle + randomOffset);
            this.avoidUntil = now + 500;
            return;
        }
        
       
        const centerX = Constants.GAME_RADIUS;
        const centerY = Constants.GAME_RADIUS;
        const distFromCenter = Math.sqrt(
            Math.pow(this.snake.x - centerX, 2) +
            Math.pow(this.snake.y - centerY, 2)
        );
        
        if (distFromCenter > Constants.PLAY_RADIUS * 0.80) {
            const toCenter = Math.atan2(centerY - this.snake.y, centerX - this.snake.x);
            setSnakeWantedAngleRad(this.snake, toCenter);
            return;
        }
        
       
        const searchRange = 150;
        if (!this.targetFood || Math.random() < 0.1) {
            const nearbyFood = this.game.getFoodInRange(this.snake.x, this.snake.y, searchRange);
            if (nearbyFood.length > 0) {
                let minDist = Infinity;
                for (const food of nearbyFood) {
                    const dx = food.x - this.snake.x;
                    const dy = food.y - this.snake.y;
                    const dist = dx * dx + dy * dy;
                    if (dist < minDist) {
                        minDist = dist;
                        this.targetFood = food;
                    }
                }
            } else {
                this.targetFood = null;
            }
        }
        
       
        if (this.targetFood) {
            const dx = this.targetFood.x - this.snake.x;
            const dy = this.targetFood.y - this.snake.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 30 || !this.game.foods.has(this.targetFood.id)) {
                this.targetFood = null;
            } else {
                setSnakeWantedAngleRad(this.snake, Math.atan2(dy, dx));
                return;
            }
        }
        
       
        if (Math.random() < 0.03) {
            this.wanderAngle += (Math.random() - 0.5) * 0.5;
            while (this.wanderAngle < 0) this.wanderAngle += Math.PI * 2;
            while (this.wanderAngle >= Math.PI * 2) this.wanderAngle -= Math.PI * 2;
        }
        setSnakeWantedAngleRad(this.snake, this.wanderAngle);
        
       
        if (this.snake.sct > 20 && Math.random() < 0.005) {
            this.snake.boosting = true;
            setTimeout(() => {
                if (this.snake) this.snake.boosting = false;
            }, 300);
        }
    }
}

class Game {
    constructor() {
        this.snakes = new Map();      
        this.foods = new Map();       
        this.preys = new Map();       
        this.players = new Map();     
        this.bots = new Map();        
        
        this.nextSnakeId = 1;
        this.nextPreyId = 1;
        
        this.foodSpawner = new FoodSpawner(Constants.GAME_RADIUS, Constants.PLAY_RADIUS);
        
        this.lastTick = Date.now();
        this.tickCount = 0;
        
       
        this.initializeWorld();
    }
    
    initializeWorld() {
       
        for (let i = 0; i < Constants.INITIAL_FOOD_COUNT; i++) {
            const food = this.foodSpawner.spawnNaturalFood();
            this.foods.set(food.id, food);
        }
        
       
        for (let i = 0; i < 5; i++) {
            this.spawnPrey();
        }
        
        console.log(`World initialized with ${this.foods.size} food and ${this.preys.size} prey`);
    }
    
    tick() {
        const now = Date.now();
        const deltaTime = now - this.lastTick;
        this.lastTick = now;
        this.tickCount++;
        
        for (const snake of this.snakes.values()) {
           
            this.checkFoodCollisions(snake);
            
           
            this.checkPreyCollisions(snake);
        }
        
       
        for (const bot of this.bots.values()) {
            bot.update();
        }
        
       
        for (const prey of this.preys.values()) {
            prey.update(deltaTime);
        }
        
       
        this.checkSnakeCollisions();
        
       
        this.checkBoundaryCollisions();
        
       
        const foodInterval = Constants.FOOD_SPAWN_INTERVAL || 3;
        if (this.tickCount % foodInterval === 0 && this.foods.size < Constants.MAX_FOOD_COUNT) {
            for (let i = 0; i < 3; i++) {
                const food = this.foodSpawner.spawnNaturalFood();
                this.foods.set(food.id, food);
                this.broadcastFoodSpawn(food, 'f');
            }
        }
        
       
        if (Math.random() < Constants.PREY_SPAWN_CHANCE && this.preys.size < Constants.MAX_PREY_COUNT) {
            this.spawnPrey();
        }
        
       
        if (this.tickCount % 10 === 0) {
            this.broadcastLeaderboard();
        }
        
       
        if (this.tickCount % 10 === 0) {
            this.broadcastMinimap();
        }
        
       
        if (this.tickCount % 50 === 0) {
            this.manageBots();
        }
    }
    
    getRealPlayerCount() {
        let count = 0;
        for (const [ws, player] of this.players) {
            if (player.snake && !this.bots.has(player.snake.id)) {
                count++;
            }
        }
        return count;
    }
    
    manageBots() {
        const realPlayers = this.getRealPlayerCount();
        const totalSnakes = this.snakes.size;
        const currentBots = this.bots.size;
        
       
        const neededTotal = Constants.MIN_PLAYERS;
        const botTarget = Math.min(Constants.MAX_BOTS, Math.max(0, neededTotal - realPlayers));
        
        if (currentBots < botTarget) {
           
            const botsToSpawn = Math.min(2, botTarget - currentBots);
            for (let i = 0; i < botsToSpawn; i++) {
                this.spawnBot();
            }
        } else if (currentBots > botTarget && realPlayers > 0) {
           
            const botsToRemove = Math.min(1, currentBots - botTarget);
            let removed = 0;
            for (const [snakeId, bot] of this.bots) {
                if (removed >= botsToRemove) break;
                this.removeBot(snakeId);
                removed++;
            }
        }
    }
    
    spawnBot() {
        const name = Constants.BOT_NAMES[Math.floor(Math.random() * Constants.BOT_NAMES.length)];
        const skin = Math.floor(Math.random() * 39);
        const snake = this.spawnSnake(name, skin, null);
        const bot = new Bot(snake, this);
        this.bots.set(snake.id, bot);
        
        console.log(`Bot spawned: id=${snake.id} name="${name}"`);
        
        for (const [ws, player] of this.players) {
            if (!player.snake) continue;
            const dx = snake.x - player.snake.x;
            const dy = snake.y - player.snake.y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= player.viewRange * player.viewRange) {
                player.sendSnakeSpawn(snake);
            }
        }
        
        return bot;
    }
    
    removeBot(snakeId) {
        const bot = this.bots.get(snakeId);
        if (bot) {
            console.log(`Bot removed: id=${snakeId}`);
            this.bots.delete(snakeId);
            this.removeSnake(snakeId, true);
        }
    }
    
    spawnSnake(name, skin, customSkin) {
        const id = this.nextSnakeId++;
        const pos = this.foodSpawner.getRandomPosition();
        const snake = new Snake(id, name, skin, pos.x, pos.y);
        snake.customSkin = customSkin;
        this.snakes.set(id, snake);
        return snake;
    }
    
    spawnPrey() {
        const id = this.nextPreyId++;
        const prey = this.foodSpawner.spawnPrey(id);
        this.preys.set(id, prey);
        return prey;
    }
    
    removeSnake(snakeId, dropFood = true) {
        const snake = this.snakes.get(snakeId);
        if (!snake) return;
        
        this.bots.delete(snakeId);
        
        if (dropFood && snake.sct > 2) {
           
            const foods = this.foodSpawner.spawnDeathFood(snake);
            console.log(`Spawning ${foods.length} death foods for snake ${snakeId}`);
            
            for (const food of foods) {
                if (food.x >= 0 && food.x <= Constants.GAME_RADIUS * 2 &&
                    food.y >= 0 && food.y <= Constants.GAME_RADIUS * 2) {
                    this.foods.set(food.id, food);
                   
                    this.broadcastFoodSpawn(food, 'b');
                }
            }
        }
        
        this.snakes.delete(snakeId);
        this.broadcastSnakeDeath(snakeId);
    }
    
    checkFoodCollisions(snake) {
        const eatRadius = snake.getHeadRadius() + 25;
        const eatRadiusSq = eatRadius * eatRadius;
        
        const foodsToRemove = [];
        
        for (const [foodId, food] of this.foods) {
            const dx = food.x - snake.x;
            const dy = food.y - snake.y;
            const distSq = dx * dx + dy * dy;
            
            if (distSq <= eatRadiusSq) {
                snake.addFamFromFood(food.size);
                foodsToRemove.push({ id: foodId, x: food.x, y: food.y });
            }
        }
        
       
        for (const { id, x, y } of foodsToRemove) {
            this.foods.delete(id);
            this.broadcastFoodEaten(x, y, snake.id);
        }
    }
    
    checkPreyCollisions(snake) {
        const eatRadius = snake.getHeadRadius() + 20;
        const eatRadiusSq = eatRadius * eatRadius;
        
        for (const [preyId, prey] of this.preys) {
            const dx = prey.x - snake.x;
            const dy = prey.y - snake.y;
            const distSq = dx * dx + dy * dy;
            
            if (distSq <= eatRadiusSq) {
                snake.addFamFromFood(prey.size);
                this.preys.delete(preyId);
                this.broadcastPreyEaten(preyId, snake.id);
            }
        }
    }
    
    checkSnakeCollisions() {
        const deadSnakes = [];
        
        for (const snake of this.snakes.values()) {
           
            if (deadSnakes.find(d => d.victim.id === snake.id)) continue;
            
            for (const otherSnake of this.snakes.values()) {
                if (snake.id === otherSnake.id) continue;
                
               
                if (snake.collidesWithSnake(otherSnake)) {
                    deadSnakes.push({ victim: snake, killer: otherSnake });
                    break;
                }
            }
        }
        
        for (const { victim, killer } of deadSnakes) {
            killer.kills++;
            console.log(`Snake ${victim.id} killed by ${killer.id}`);
            this.removeSnake(victim.id, true);
            
           
            const player = this.getPlayerBySnakeId(killer.id);
            if (player && !this.bots.has(killer.id)) {
                this.sendKillNotification(player, killer.kills);
            }
        }
    }
    
    checkBoundaryCollisions() {
        const deadSnakes = [];
        
        for (const snake of this.snakes.values()) {
            if (snake.hitBoundary()) {
                deadSnakes.push(snake.id);
            }
        }
        
        for (const snakeId of deadSnakes) {
            console.log(`Snake ${snakeId} hit boundary`);
            this.removeSnake(snakeId, false); 
        }
    }
    
    getPlayerBySnakeId(snakeId) {
        for (const [ws, player] of this.players) {
            if (player.snake && player.snake.id === snakeId) {
                return player;
            }
        }
        return null;
    }
    
    getSnakesInRange(x, y, range) {
        const result = [];
        const rangeSq = range * range;
        for (const snake of this.snakes.values()) {
            const dx = snake.x - x;
            const dy = snake.y - y;
            if (dx * dx + dy * dy <= rangeSq) {
                result.push(snake);
            }
        }
        return result;
    }
    
    getFoodInRange(x, y, range) {
        const result = [];
        const rangeSq = range * range;
        for (const food of this.foods.values()) {
            const dx = food.x - x;
            const dy = food.y - y;
            if (dx * dx + dy * dy <= rangeSq) {
                result.push(food);
            }
        }
        return result;
    }
    
    getPreyInRange(x, y, range) {
        const result = [];
        for (const prey of this.preys.values()) {
            if (prey.isInRange(x, y, range)) {
                result.push(prey);
            }
        }
        return result;
    }
    
    getLeaderboard(count = 10) {
        const sorted = Array.from(this.snakes.values())
            .sort((a, b) => b.calculateScore() - a.calculateScore())
            .slice(0, count);
        return sorted;
    }
    
    getPlayerRank(snakeId) {
        const sorted = Array.from(this.snakes.values())
            .sort((a, b) => b.calculateScore() - a.calculateScore());
        return sorted.findIndex(s => s.id === snakeId) + 1;
    }
    
    broadcastFoodSpawn(food, type) {
       
    }
    
    broadcastFoodEaten(x, y, eaterId) {
       
    }
    
    broadcastPreyEaten(preyId, eaterId) {
       
    }
    
    broadcastSnakeDeath(snakeId) {
       
    }
    
    broadcastLeaderboard() {
       
    }
    
    broadcastMinimap() {
       
    }
    
    sendKillNotification(player, kills) {
       
    }
}

module.exports = Game;
