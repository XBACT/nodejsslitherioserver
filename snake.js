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
const ANGLE_MAX = 16777215;
const ANGLE_TO_RAD = (Math.PI * 2) / ANGLE_MAX;
const RAD_TO_ANGLE = ANGLE_MAX / (Math.PI * 2);
const HALF_ANGLE_MAX = ANGLE_MAX / 2;

function wrapAngleUnits(a) {
    // Keep in [0, ANGLE_MAX)
    a = a % ANGLE_MAX;
    if (a < 0) a += ANGLE_MAX;
    return a;
}

function shortestDiffUnits(target, current) {
    let diff = target - current;
    if (diff > HALF_ANGLE_MAX) diff -= ANGLE_MAX;
    else if (diff < -HALF_ANGLE_MAX) diff += ANGLE_MAX;
    return diff;
}

class Snake {
    constructor(id, name, skin, x, y) {
        this.id = id;
        this.name = name || '';
        this.skin = skin || 0;
        this.customSkin = null;
        
       
        this.x = x;
        this.y = y;
        this.angle = Math.random() * Math.PI * 2;
        this.wantedAngle = this.angle;

        this.ehang = this.angle * RAD_TO_ANGLE;
        this.wang = this.ehang;
        this.speed = Constants.NSP1 / 100;         
        this.boosting = false;
        
       
        this.parts = [];
        this.sct = 10; 
        this.fam = 0.5;
        
       
        this.score = Constants.INITIAL_SCORE;
        this.kills = 0;
        
       
        this.lastMoveTime = Date.now();
        this.lastAngleUpdate = Date.now();
        
       
        this.initBody();
    }
    
    initBody() {
       
        const tailAngle = this.angle + Math.PI; 
        const spacing = 42; 
        
       
        this.parts = [];
        for (let i = 0; i < this.sct; i++) {
            const dist = (i + 1) * spacing;
            this.parts.push({
                x: this.x + Math.cos(tailAngle) * dist,
                y: this.y + Math.sin(tailAngle) * dist,
                dying: false,
                sp: 0
            });
        }
        
       
        if (this.parts.length > 0) {
            this.lastSentPtsEnd = { x: this.parts[0].x, y: this.parts[0].y };
        } else {
            this.lastSentPtsEnd = { x: this.x, y: this.y };
        }
    }
    
    getScale() {
        return Math.min(6, 1 + (this.sct - 2) / 106);
    }
    
    getScang() {
        const sc = this.getScale();
        return 0.28 + 0.72 * Math.pow((7 - sc) / 6, 1.5);
    }
    
    getSpang() {
        const spangdv = Constants.SPANGDV / 10; 
        const spang = this.speed / spangdv;
        return Math.min(1, spang);
    }
    
    getBaseSpeed() {
        const sc = this.getScale();
        const nsp1 = Constants.NSP1 / 100; 
        const nsp2 = Constants.NSP2 / 100; 
        return nsp1 + nsp2 * sc;
    }
    
    getBoostSpeed() {
        return Constants.NSP3 / 100; 
    }
    
    getCurrentSpeed() {
        return this.boosting ? this.getBoostSpeed() : this.getBaseSpeed();
    }

    update(deltaTime, isPlayerControlled = false) {
        const mamu = Constants.MAMU / 1000;
        const scang = this.getScang();
        const spang = this.getSpang();

        const vfr = deltaTime / 8;

        const maxTurnRad = mamu * vfr * scang * spang;
        const maxTurnUnits = maxTurnRad * RAD_TO_ANGLE;

        const diffUnits = shortestDiffUnits(this.wang, this.ehang);

        const deadzoneUnits = 0.0001 * RAD_TO_ANGLE;

        if (Math.abs(diffUnits) > deadzoneUnits) {
            if (Math.abs(diffUnits) <= maxTurnUnits) {
                this.ehang = wrapAngleUnits(this.wang);
            } else {
                this.ehang = wrapAngleUnits(this.ehang + Math.sign(diffUnits) * maxTurnUnits);
            }
        }

        this.angle = this.ehang * ANGLE_TO_RAD;
        this.wantedAngle = this.wang * ANGLE_TO_RAD;

        this.speed = this.boosting ? this.getBoostSpeed() : this.getBaseSpeed();
    }

    move() {
        const moveDistance = Constants.MOVE_DISTANCE; 
        
        const newX = this.x + Math.cos(this.angle) * moveDistance;
        const newY = this.y + Math.sin(this.angle) * moveDistance;
        
       
       
        this.updateBodyParts();
        
       
        this.x = newX;
        this.y = newY;
        
       
        this.droppedFood = null;
        
       
       
       
        if (this.boosting && this.sct > 2) {
            this.fam -= 1.0;
            if (this.fam < 0) {
                this.fam += 1;
                if (this.sct > 2) {
                   
                    if (this.parts.length > 0) {
                        const tailPart = this.parts[this.parts.length - 1];
                        this.droppedFood = { x: tailPart.x, y: tailPart.y };
                        this.parts.pop();
                    }
                    this.sct--;
                }
            }
        }
        
        return { x: newX, y: newY };
    }
    
   
   
    updateBodyParts() {
        if (this.parts.length === 0) return;
        
       
       
        for (let i = this.parts.length - 1; i > 0; i--) {
            this.parts[i].x = this.parts[i - 1].x;
            this.parts[i].y = this.parts[i - 1].y;
        }
        
       
        this.parts[0].x = this.x;
        this.parts[0].y = this.y;
    }
    
    setWantedAngle(angleByte, isOwnSnake = false) {
        this.wang = (angleByte / 251) * ANGLE_MAX;
        this.wantedAngle = this.wang * ANGLE_TO_RAD;
    }
    
    setBoost(boosting) {
        if (this.sct > 2 || !boosting) {
            this.boosting = boosting;
        }
    }
    
   
   
    addFamFromFood(foodSize) {
       
        const famIncrease = (foodSize * foodSize * 46 * 46) / 16777216;
        this.fam += famIncrease;
        
       
        while (this.fam >= 1.0 && this.sct < Constants.MAX_SNAKE_PARTS) {
            this.fam -= 1.0;
            this.sct++;
            
           
            this.pendingGrowth = (this.pendingGrowth || 0) + 1;
        }
    }
    
    addScore(amount) {
       
        this.fam += amount * 0.01; 
        
        while (this.fam >= 1.0 && this.sct < Constants.MAX_SNAKE_PARTS) {
            this.fam -= 1.0;
            this.sct++;
            this.pendingGrowth = (this.pendingGrowth || 0) + 1;
        }
    }
    
   
    getScore() {
        const fpsls = Snake.getFpsls(this.sct);
        const fmlts = Snake.getFmlts(this.sct);
        return Math.floor(15 * (fpsls + this.fam / fmlts - 1) - 5);
    }
    
    static getFpsls(sct) {
        let sum = 0;
        for (let i = 1; i <= sct; i++) {
            sum += 1 / Snake.getFmlts(i - 1);
        }
        return sum;
    }
    
    static getFmlts(sct) {
        const mscps = Constants.MAX_SNAKE_PARTS; 
        if (sct >= mscps) return Snake.getFmlts(mscps - 1);
        return Math.pow(1 - sct / mscps, 2.25);
    }
    
    hasPendingGrowth() {
        return (this.pendingGrowth || 0) > 0;
    }
    
    consumeOnePendingGrowth() {
        if (this.pendingGrowth > 0) {
            this.pendingGrowth--;
        }
    }
    
    getHeadRadius() {
       
        return 14.5 * this.getScale();
    }
    
    getBodyRadius() {
        return 14.5 * this.getScale();
    }
    
    isPointOnBody(x, y, headRadius = 0, excludeHead = false) {
       
        const bodyRadius = this.getBodyRadius();
        const collisionDist = headRadius + bodyRadius;
        const collisionDistSq = collisionDist * collisionDist;
        
       
        const partsCount = this.parts.length;
        
       
       
        const startIdx = excludeHead ? Math.min(10, Math.floor(partsCount * 0.3)) : 0;
        
        for (let i = startIdx; i < partsCount; i++) {
            const part = this.parts[i];
            const dx = x - part.x;
            const dy = y - part.y;
            
            if (dx * dx + dy * dy < collisionDistSq) {
                return true;
            }
        }
        return false;
    }
    
    collidesWithSnake(otherSnake) {
        if (otherSnake.id === this.id) return false;
        
       
        const myHeadRadius = this.getHeadRadius() * 0.8; 
        
        return otherSnake.isPointOnBody(this.x, this.y, myHeadRadius, false);
    }
    
    hitBoundary() {
        const center = Constants.GAME_RADIUS;
        const dx = this.x - center;
        const dy = this.y - center;
        const distSq = dx * dx + dy * dy;
        return distSq >= Constants.PLAY_RADIUS * Constants.PLAY_RADIUS;
    }
    
    getDistanceFromCenter() {
        return Math.sqrt(
            Math.pow(this.x - Constants.GAME_RADIUS, 2) + 
            Math.pow(this.y - Constants.GAME_RADIUS, 2)
        );
    }
    
    calculateScore() {
        return this.getScore();
    }
    
    toSpawnData() {
        return {
            id: this.id,
            name: this.name,
            skin: this.skin,
            x: this.x,
            y: this.y,
            angle: this.angle,
            wantedAngle: this.wantedAngle,
            ehang: this.ehang,
            wang: this.wang,
            speed: this.speed,
            sct: this.sct,
            fam: this.fam,
            parts: this.parts.slice(),
            customSkin: this.customSkin
        };
    }
}
module.exports = Snake;
