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

module.exports = {
    // World settings
    GAME_RADIUS: 2000,           // Total world radius
    PLAY_RADIUS: 1950,           // Playable area radius (98% of game radius)
    SECTOR_SIZE: 300,            // Size of each sector
    SECTOR_COUNT: 14,            // Sectors along edge (4000/300 ≈ 14)
    
    // Snake settings
    MAX_SNAKE_PARTS: 411,        // Maximum body parts (mscps)
    INITIAL_SNAKE_PARTS: 2,      // Starting body parts
    INITIAL_SCORE: 10,           // Starting score
    MOVE_DISTANCE: 42,           // Units snake moves per update (msl)
    
    // Speed settings (official values from protocol)
    NSP1: 539,                   // Normal speed base (value / 100 = 5.39)
    NSP2: 40,                    // Speed increase per size (value / 100 = 0.4)
    NSP3: 1400,                  // Max/boost speed (value / 100 = 14)
    SPANGDV: 48,                 // Angular speed coefficient (value / 10 = 4.8)
    MAMU: 33,                    // Basic angular speed (value / 1000 = 0.033)
    MANU2: 28,                   // Prey angular speed (value / 1000 = 0.028)
    CST: 430,                    // Tail rigidity (value / 1000 = 0.43)
    
    // Timing
    TICK_RATE: 47,               // Server tick in ms
    PING_INTERVAL: 250,          // Ping every 250ms
    NORMAL_MOVE_INTERVAL: 240,   // Normal speed movement interval (~4 moves/sec)
    BOOST_MOVE_INTERVAL: 95,     // Boost speed movement interval (~10 moves/sec)
    
    // Food settings
    MIN_NATURAL_FOOD_SIZE: 15,
    MAX_NATURAL_FOOD_SIZE: 47,
    MIN_DEATH_FOOD_SIZE: 68,
    MAX_DEATH_FOOD_SIZE: 122,
    FOOD_COLORS: 9,              // 0-8 color values
    INITIAL_FOOD_COUNT: 200,     // Less food
    MAX_FOOD_COUNT: 400,         // Max food
    FOOD_SPAWN_INTERVAL: 2,      // Spawn food every N ticks
    
    FOOD_GROWTH_RATE: 0.25,      // 0.25 per food unit eaten
    
    // Prey settings
    MAX_PREY_COUNT: 10,
    PREY_SPAWN_CHANCE: 0.1,
    
    // Bot settings
    MIN_PLAYERS: 20,              // Minimum players before bots spawn
    MAX_BOTS: 25,                 // Maximum number of bots
    BOT_NAMES: ['Bot Alpha', 'Bot Beta', 'Bot Gamma', 'Bot Delta', 'Bot Epsilon',
                'Snake AI', 'Robo Snake', 'AI Player', 'Computer', 'NPC'],
    
    // Protocol
    PROTOCOL_VERSION: 11,
    
    // Packet types (clientbound)
    PACKET: {
        PRE_INIT: '6'.charCodeAt(0),           // 54
        INITIAL_SETUP: 'a'.charCodeAt(0),       // 97
        ROTATE_CCW_E: 'e'.charCodeAt(0),        // 101
        ROTATE_CCW_E2: 'E'.charCodeAt(0),       // 69
        ROTATE_CCW_3: '3'.charCodeAt(0),        // 51
        ROTATE_CW_4: '4'.charCodeAt(0),         // 52
        ROTATE_CW_5: '5'.charCodeAt(0),         // 53
        UPDATE_FAM: 'h'.charCodeAt(0),          // 104
        REMOVE_PART: 'r'.charCodeAt(0),         // 114
        MOVE_G: 'g'.charCodeAt(0),              // 103
        MOVE_G2: 'G'.charCodeAt(0),             // 71
        INCREASE_N: 'n'.charCodeAt(0),          // 110
        INCREASE_N2: 'N'.charCodeAt(0),         // 78
        LEADERBOARD: 'l'.charCodeAt(0),         // 108
        DEATH: 'v'.charCodeAt(0),               // 118
        ADD_SECTOR: 'W'.charCodeAt(0),          // 87
        REMOVE_SECTOR: 'w'.charCodeAt(0),       // 119
        HIGHSCORE: 'm'.charCodeAt(0),           // 109
        PONG: 'p'.charCodeAt(0),                // 112
        MINIMAP: 'u'.charCodeAt(0),             // 117
        SNAKE: 's'.charCodeAt(0),               // 115
        FOOD_F: 'F'.charCodeAt(0),              // 70
        FOOD_B: 'b'.charCodeAt(0),              // 98
        FOOD_F2: 'f'.charCodeAt(0),             // 102
        EAT_FOOD: 'c'.charCodeAt(0),            // 99
        UPDATE_PREY: 'j'.charCodeAt(0),         // 106
        PREY: 'y'.charCodeAt(0),                // 121
        KILL: 'k'.charCodeAt(0),                // 107
    },
    
    // Serverbound packet values
    CLIENT_PACKET: {
        START_LOGIN: 99,           // 'c'
        SET_USERNAME: 115,         // 's'
        PING: 251,
        ANGLE_UPDATE: 0,           // 0-250 angle
        TURN: 252,
        BOOST_START: 253,
        BOOST_END: 254,
        CLOSE: 255,
    }
};
