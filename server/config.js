'use strict';

module.exports = {
  // Server
  PORT: 8080,
  HOST: '0.0.0.0',

  // Protocol
  PROTOCOL_VERSION: 15,
  CLIENT_VERSION: 291,
  SERVER_VERSION: '',
  NTL_SECRET: 'dakrtywcilopuhgrmzwsdolitualksrrarjsrzyjhrnzvfdfkrsyahjvuobhjkmzwvgoppxaagiwvscjlqoualghnuvdedozuwcdjosrcnhjprwlkfqbyegkorwtepmlstcfhksxakilruwdhhouwdchnsqecngvqpcz',

  // Game world
  GAME_RADIUS: 1600,           // grd (dynamic, updated by GameEngine)
  GAME_RADIUS_MIN: 800,        // minimum dynamic radius
  GAME_RADIUS_MAX: 3000,       // maximum dynamic radius
  GAME_RADIUS_PER_SNAKE: 80,   // radius increase per alive snake
  SECTOR_SIZE: 480,
  SECTOR_COUNT: 90,             // sector_count_along_edge
  MAX_SEGMENT_COUNT: 411,       // mscps
  DEFAULT_MSL: 42,              // default_msl (segment length)

  // Physics (must match 'a' packet values sent to client)
  SPANGDV: 4.8,                 // spangdv * 10 = 48
  NSP1: 4.25,                   // nsp1 * 100 = 425 (base speed)
  NSP2: 0.5,                    // nsp2 * 100 = 50  (speed per sc)
  NSP3: 12.0,                   // nsp3 * 100 = 1200 (boost extra)
  MAMU: 0.033,                  // mamu * 1000 = 33  (turn rate)
  MAMU2: 0.028,                 // mamu2 * 1000 = 28
  CST: 0.43,                    // cst * 1000 = 430
  // Speed is computed from NSP1+NSP2*sc, NOT hardcoded
  BOOST_FAM_LOSS: 0.025,        // fam lost per tick while boosting (~2s per segment at 20tps)

  // Snake defaults
  INITIAL_SEGMENTS: 2,
  INITIAL_FAM: 0.0,
  SNAKE_MOVE_INTERVAL: 75,      // ms per movement tick

  // Food
  FOOD_SPAWN_RATE: 10,          // foods per tick
  MAX_FOOD_PER_SECTOR: 10,
  FOOD_BASE_RADIUS: 2.5,
  FOOD_COLORS: 42,
  FOOD_VALUE: 0.04,             // fam gain per food (20 foods = 1 segment)

  // Prey
  PREY_SPAWN_INTERVAL: 3000,    // ms
  MAX_PREY: 80,
  PREY_SPEED: 3.5,

  // Leaderboard
  LEADERBOARD_SIZE: 10,
  LEADERBOARD_INTERVAL: 2000,   // ms

  // Minimap
  MINIMAP_SIZE: 256,          // minimap size (max 512)
  MINIMAP_INTERVAL: 2000,       // ms

  // Tick
  TICK_RATE: 20,                // ticks per second
  TICK_INTERVAL: 50,

  // Collision
  SPATIAL_CELL_SIZE: 120,

  // Cleanup
  DEAD_FOOD_COUNT: 12,          // foods dropped on death
  DEAD_FOOD_RADIUS: 4.0,

  // Highscore display
  HIGHSCORE_NAME: 'SnakeyRain.com',
  HIGHSCORE_MSG: 'Welcome!',

  // Bots
  BOT_CHASER_COUNT: 0,          // chase players
  BOT_CHASER_NAMES: ['SnakeyRain.com'],
  BOT_NORMAL_COUNT: 40,          // normal bots
  BOT_NORMAL_NAMES: ['Slither4Life', 'SnakeKing', 'NoobSlither', 'xXSnakeXx', 'Snek', 'Danger Noodle', 'LongBoi', 'Hisss', 'Wiggler', 'NomNom'],
  BOT_NORMAL_SUICIDE_SCORE: 900, // score threshold to head for map edge
  BOT_RESPAWN_DELAY: 3000,       // ms before respawning a dead bot
};
