const Constants = require('./constants');

let nextFoodId = 1;

class Food {
    constructor(x, y, color, size, id = null) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = size;
        this.id = id || (nextFoodId++);
        
        if (nextFoodId > 2000000000) {
            nextFoodId = 1;
        }
    }
    
    getValue() {
        const base = Math.pow(this.size / 50, 2);
        return Math.max(1, Math.ceil(base * 5));
    }
}

class Prey {
    constructor(id, x, y, color, size) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = size;
        
       
        this.angle = Math.random() * Math.PI * 2;
        this.wantedAngle = this.angle;
        this.speed = 0.5 + Math.random() * 0.5;
        this.direction = 0;
        
       
        this.lastUpdate = Date.now();
        this.changeDirectionTime = Date.now() + Math.random() * 3000;
    }
    
    update(deltaTime) {
       
        if (Date.now() > this.changeDirectionTime) {
            this.direction = Math.floor(Math.random() * 3);
            if (this.direction !== 0) {
                this.wantedAngle = Math.random() * Math.PI * 2;
            }
            this.changeDirectionTime = Date.now() + 1000 + Math.random() * 3000;
        }
        
       
        const angularSpeed = Constants.MANU2 / 1000;
        if (this.direction === 1) {
            this.angle -= angularSpeed * deltaTime;
        } else if (this.direction === 2) {
            this.angle += angularSpeed * deltaTime;
        }
        
       
        while (this.angle < 0) this.angle += Math.PI * 2;
        while (this.angle >= Math.PI * 2) this.angle -= Math.PI * 2;
        
       
        this.x += Math.cos(this.angle) * this.speed * deltaTime * 0.1;
        this.y += Math.sin(this.angle) * this.speed * deltaTime * 0.1;
        
       
        const margin = 500;
        const worldSize = Constants.GAME_RADIUS * 2;
        if (this.x < margin || this.x > worldSize - margin) {
            this.angle = Math.PI - this.angle;
            this.x = Math.max(margin, Math.min(worldSize - margin, this.x));
        }
        if (this.y < margin || this.y > worldSize - margin) {
            this.angle = -this.angle;
            this.y = Math.max(margin, Math.min(worldSize - margin, this.y));
        }
    }
    
    getValue() {
        return Math.floor(this.size * 2);
    }
    
    isInRange(x, y, range) {
        const dx = this.x - x;
        const dy = this.y - y;
        return dx * dx + dy * dy <= range * range;
    }
}


class FoodSpawner {
    constructor(gameRadius, playRadius) {
        this.gameRadius = gameRadius;
        this.playRadius = playRadius;
    }
    
    clamp(x, y) {
        const dx = x - this.gameRadius;
        const dy = y - this.gameRadius;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > this.playRadius - 50) {
            const angle = Math.atan2(dy, dx);
            return {
                x: this.gameRadius + Math.cos(angle) * (this.playRadius - 100),
                y: this.gameRadius + Math.sin(angle) * (this.playRadius - 100)
            };
        }
        return { x, y };
    }

    spawnNaturalFood() {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * this.playRadius * 0.9;
        const x = this.gameRadius + Math.cos(angle) * r;
        const y = this.gameRadius + Math.sin(angle) * r;
        
        const color = Math.floor(Math.random() * Constants.FOOD_COLORS);
        const size = Constants.MIN_NATURAL_FOOD_SIZE + 
                     Math.floor(Math.random() * (Constants.MAX_NATURAL_FOOD_SIZE - Constants.MIN_NATURAL_FOOD_SIZE));
                     
        return new Food(x, y, color, size);
    }
    
    spawnFoodNear(x, y, size, isDeathFood = false) {
        const offset = 20 + Math.random() * 50;
        const angle = Math.random() * Math.PI * 2;
        let newX = x + Math.cos(angle) * offset;
        let newY = y + Math.sin(angle) * offset;
        
        const clamped = this.clamp(newX, newY);
        const color = Math.floor(Math.random() * Constants.FOOD_COLORS);
        
        return new Food(clamped.x, clamped.y, color, size);
    }
    
    spawnDeathFood(snake) {
        const foods = [];
        
        // Maximum food count = 2 * sct
        const maxFoodCount = snake.sct * 2;
        
        // Snake scale (1 to 6)
        const sc = Math.min(6, 1 + (snake.sct - 2) / 106);
        
        // Food size range based on snake size
        // Minimum: 68 
        // Maximum: scales with snake size
        const minSize = Constants.MIN_DEATH_FOOD_SIZE; // 68
        const maxSize = minSize + Math.floor(sc * 9); // 68-122 based on scale
        
        // Collect all positions along the snake (head + body parts)
        const positions = [];
        
        // Add head position
        positions.push({ x: snake.x, y: snake.y, isHead: true });
        
        // Add body part positions
        for (let i = 0; i < snake.parts.length; i++) {
            positions.push({ 
                x: snake.parts[i].x, 
                y: snake.parts[i].y, 
                isHead: false,
                progress: i / Math.max(1, snake.parts.length - 1) // 0 at head, 1 at tail
            });
        }
        
        // Calculate how many food items to place
        // Distribute evenly along the snake, up to maxFoodCount
        const foodCount = Math.min(maxFoodCount, positions.length * 2);
        
        // Calculate spacing between food items
        const totalLength = positions.length;
        const spacing = Math.max(1, totalLength / foodCount);
        
        let foodsPlaced = 0;
        let posIndex = 0;
        
        while (foodsPlaced < foodCount && posIndex < positions.length) {
            const pos = positions[Math.floor(posIndex)];
            
            // Size calculation: larger near head, smaller near tail
            // Head gets max size, tail gets min size
            const progress = pos.isHead ? 0 : (pos.progress || 0);
            const sizeRange = maxSize - minSize;
            const size = Math.floor(maxSize - sizeRange * progress * 0.6);
            
            // Clamp position to play area
            const clampedPos = this.clamp(pos.x, pos.y);
            
            // Add small random offset to prevent exact overlap
            const offsetAngle = Math.random() * Math.PI * 2;
            const offsetDist = Math.random() * 5;
            const finalX = clampedPos.x + Math.cos(offsetAngle) * offsetDist;
            const finalY = clampedPos.y + Math.sin(offsetAngle) * offsetDist;
            
            foods.push(new Food(
                finalX,
                finalY,
                Math.floor(Math.random() * Constants.FOOD_COLORS),
                size
            ));
            foodsPlaced++;
            
            // For larger snakes, add extra food around the body width
            if (foodsPlaced < foodCount && !pos.isHead && sc > 1.5) {
                // Get perpendicular direction for body width
                const prevIdx = Math.max(0, Math.floor(posIndex) - 1);
                const nextIdx = Math.min(positions.length - 1, Math.floor(posIndex) + 1);
                
                if (prevIdx !== nextIdx) {
                    const dx = positions[nextIdx].x - positions[prevIdx].x;
                    const dy = positions[nextIdx].y - positions[prevIdx].y;
                    const perpAngle = Math.atan2(dy, dx) + Math.PI / 2;
                    
                    // Body width based on scale
                    const bodyWidth = 10 * sc;
                    
                    // Add food on one side (random)
                    const side = Math.random() > 0.5 ? 1 : -1;
                    const sideX = pos.x + Math.cos(perpAngle) * bodyWidth * side * 0.5;
                    const sideY = pos.y + Math.sin(perpAngle) * bodyWidth * side * 0.5;
                    const sideClamped = this.clamp(sideX, sideY);
                    
                    const sideSize = Math.floor(size * 0.85);
                    
                    foods.push(new Food(
                        sideClamped.x,
                        sideClamped.y,
                        Math.floor(Math.random() * Constants.FOOD_COLORS),
                        Math.max(minSize, sideSize)
                    ));
                    foodsPlaced++;
                }
            }
            
            posIndex += spacing;
        }
        
        console.log(`Death food spawned: ${foods.length} items (max=${maxFoodCount}) for snake sct=${snake.sct}, size range=${minSize}-${maxSize}`);
        return foods;
    }
    
    getRandomPosition() {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * this.playRadius * 0.85;
        
        return {
            x: this.gameRadius + Math.cos(angle) * radius,
            y: this.gameRadius + Math.sin(angle) * radius
        };
    }
    
    spawnPrey(id) {
        const pos = this.getRandomPosition();
        const color = Math.floor(Math.random() * Constants.FOOD_COLORS);
        const size = 10 + Math.floor(Math.random() * 20);
        return new Prey(id, pos.x, pos.y, color, size);
    }
}

module.exports = { Food, Prey, FoodSpawner };
