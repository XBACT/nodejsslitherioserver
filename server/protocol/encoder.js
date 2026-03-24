'use strict';

const config = require('../config');
const { PI2 } = require('../utils/math');

const fmlts = [];
const fpsls = [];
function initTables() {
  const mscps = config.MAX_SEGMENT_COUNT;
  for (let i = 0; i <= mscps; i++) {
    if (i >= mscps) fmlts.push(fmlts[i - 1]);
    else fmlts.push(Math.pow(1 - i / mscps, 2.25));
    if (i === 0) fpsls.push(0);
    else fpsls.push(fpsls[i - 1] + 1 / fmlts[i - 1]);
  }
  for (let i = 0; i < 2048; i++) {
    fmlts.push(fmlts[fmlts.length - 1]);
    fpsls.push(fpsls[fpsls.length - 1]);
  }
}
initTables();
// +1 to raw value ensures no float rounding causes score to go negative
const EMPTY_LB_FAM_RAW = Math.round(fmlts[1] / 3 * 16777215) + 1;

function calcScore(sct, fam) {
  return Math.floor((fpsls[sct] + fam / fmlts[sct] - 1) * 15 - 5);
}

function w16(buf, offset, val) {
  buf[offset] = (val >> 8) & 0xFF;
  buf[offset + 1] = val & 0xFF;
}

function w24(buf, offset, val) {
  buf[offset] = (val >> 16) & 0xFF;
  buf[offset + 1] = (val >> 8) & 0xFF;
  buf[offset + 2] = val & 0xFF;
}

function encodeServerVersion(versionStr) {
  const buf = new Uint8Array(1 + versionStr.length);
  buf[0] = 0x36;
  for (let i = 0; i < versionStr.length; i++) {
    buf[1 + i] = versionStr.charCodeAt(i);
  }
  return buf;
}

function encodeInitPacket(opts = {}) {
  const grd = opts.grd || config.GAME_CENTER;
  const mscps = opts.mscps || config.MAX_SEGMENT_COUNT;
  const sectorSize = opts.sectorSize || config.SECTOR_SIZE;
  const sectorCount = opts.sectorCount || config.SECTOR_COUNT;
  const buf = new Uint8Array(32);
  let m = 0;
  buf[m++] = 0x61;
  w24(buf, m, grd); m += 3;
  w16(buf, m, mscps); m += 2;
  w16(buf, m, sectorSize); m += 2;
  w16(buf, m, sectorCount); m += 2;
  buf[m++] = Math.round(config.SPANGDV * 10);
  w16(buf, m, Math.round(config.NSP1 * 100)); m += 2;
  w16(buf, m, Math.round(config.NSP2 * 100)); m += 2;
  w16(buf, m, Math.round(config.NSP3 * 100)); m += 2;
  w16(buf, m, Math.round(config.MAMU * 1000)); m += 2;
  w16(buf, m, Math.round(config.MAMU2 * 1000)); m += 2;
  w16(buf, m, Math.round(config.CST * 1000)); m += 2;
  buf[m++] = opts.protocolVersion || config.PROTOCOL_VERSION;
  buf[m++] = config.DEFAULT_MSL;
  w16(buf, m, opts.sid || 0); m += 2;
  const fluxGrd = Math.floor(config.GAME_RADIUS * 0.98);
  w24(buf, m, fluxGrd); m += 3;
  buf[m++] = 0;
  buf[m++] = 0;
  return buf.subarray(0, m);
}

function encodeSnakeSpawn(snake, protocolVersion) {
  protocolVersion = protocolVersion || config.PROTOCOL_VERSION;
  const nameChars = [];
  for (let i = 0; i < snake.name.length && i < 24; i++) {
    nameChars.push(snake.name.charCodeAt(i));
  }
  const nl = nameChars.length;
  const bytesPerChar = protocolVersion < 12 ? 2 : 1;
  const pts = snake.body;

  // Body length calculation depends
  let bodyLen = 0;
  if (pts.length > 0) {
    if (protocolVersion >= 15) {
      const numDeltas = Math.max(0, pts.length - 2);
      bodyLen = 6 + numDeltas * 2 + 2;
    } else {
      const numDeltas = Math.max(0, pts.length - 1);
      bodyLen = 6 + numDeltas * 2;
    }
  }

  let totalLen = 23 + nl * bytesPerChar + bodyLen;
  if (protocolVersion >= 11) totalLen += 1;
  if (protocolVersion >= 12) totalLen += 1;

  const buf = new Uint8Array(totalLen);
  let m = 0;

  buf[m++] = 0x73;
  w16(buf, m, snake.id); m += 2;
  w24(buf, m, Math.round(snake.angle / PI2 * 16777215) & 0xFFFFFF); m += 3;
  buf[m++] = snake.dir + 48;
  w24(buf, m, Math.round(snake.wantAngle / PI2 * 16777215) & 0xFFFFFF); m += 3;
  w16(buf, m, Math.round(snake.speed * 1000)); m += 2;
  w24(buf, m, Math.round(snake.fam * 16777215)); m += 3;
  buf[m++] = snake.skin;
  w24(buf, m, Math.round(snake.x * 5)); m += 3;
  w24(buf, m, Math.round(snake.y * 5)); m += 3;
  buf[m++] = nl;
  for (let i = 0; i < nl; i++) {
    if (bytesPerChar === 2) buf[m++] = (nameChars[i] >> 8) & 0xFF;
    buf[m++] = nameChars[i] & 0xFF;
  }
  if (protocolVersion >= 11) {
    buf[m++] = 0;
  }
  if (protocolVersion >= 12) {
    buf[m++] = 255;
  }

  if (pts.length > 0) {
    const p0 = pts[0];
    w24(buf, m, Math.round(p0.x * 5)); m += 3;
    w24(buf, m, Math.round(p0.y * 5)); m += 3;

    if (protocolVersion >= 15) {
      for (let i = 1; i < pts.length - 1; i++) {
        const prev = pts[i - 1];
        const cur = pts[i];
        let dx = Math.round((cur.x - prev.x) * 2) + 127;
        let dy = Math.round((cur.y - prev.y) * 2) + 127;
        dx = Math.max(0, Math.min(255, dx));
        dy = Math.max(0, Math.min(255, dy));
        buf[m++] = dx;
        buf[m++] = dy;
      }
      const lastPt = pts[pts.length - 1];
      const iang = lastPt.iang || 0;
      w16(buf, m, iang); m += 2;
    } else {
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const cur = pts[i];
        let dx = Math.round((cur.x - prev.x) * 2) + 127;
        let dy = Math.round((cur.y - prev.y) * 2) + 127;
        dx = Math.max(0, Math.min(255, dx));
        dy = Math.max(0, Math.min(255, dy));
        buf[m++] = dx;
        buf[m++] = dy;
      }
    }
  }

  return buf.subarray(0, m);
}

function encodeSnakeRemove(snakeId, isKill) {
  const buf = new Uint8Array(4);
  buf[0] = 0x73; // 's'
  w16(buf, 1, snakeId);
  buf[3] = isKill ? 1 : 0;
  return buf;
}

function encodeAngleUpdate(snakeId, angle, wantAngle, speed, dir) {
  const buf = new Uint8Array(6);
  buf[0] = dir === 2 ? 0x34 : 0x65;
  w16(buf, 1, snakeId);
  buf[3] = Math.round(angle / PI2 * 256) & 0xFF;
  buf[4] = Math.round(wantAngle / PI2 * 256) & 0xFF;
  buf[5] = Math.round(speed * 18) & 0xFF;
  return buf;
}

function encodeSelfAngleUpdate(snakeId, angle, wantAngle, speed, dir, protocolVersion) {
  protocolVersion = protocolVersion || config.PROTOCOL_VERSION;

  if (protocolVersion >= 14) {
    const buf = new Uint8Array(4);
    buf[0] = dir === 2 ? 0x37 : 0x64;
    buf[1] = Math.round(angle / PI2 * 256) & 0xFF;
    buf[2] = Math.round(wantAngle / PI2 * 256) & 0xFF;
    buf[3] = Math.round(speed * 18) & 0xFF;
    return buf;
  }

  return encodeAngleUpdate(snakeId, angle, wantAngle, speed, dir, protocolVersion);
}

function encodeBodyPointAdd(snakeId, iang, xx, yy, fam, isSelf, isGrow, protocolVersion) {
  protocolVersion = protocolVersion || config.PROTOCOL_VERSION;

  if (protocolVersion >= 15) {
    if (isSelf) {
      if (isGrow) {
        // 'N' dlen==5 -> self grow: iang(2) + fam(3)
        const buf = new Uint8Array(6);
        buf[0] = 0x4E; // 'N'
        w16(buf, 1, iang);
        w24(buf, 3, Math.round(fam * 16777215));
        return buf;
      }
      // 'G' dlen==2 -> self move: iang(2)
      const buf = new Uint8Array(3);
      buf[0] = 0x47; // 'G'
      w16(buf, 1, iang);
      return buf;
    }
    if (isGrow) {
      // '+' adding_only: id(2) + iang(2) + xx(2) + yy(2) + fam(3)
      const buf = new Uint8Array(12);
      buf[0] = 0x2B; // '+'
      w16(buf, 1, snakeId);
      w16(buf, 3, iang);
      w16(buf, 5, xx);
      w16(buf, 7, yy);
      w24(buf, 9, Math.round(fam * 16777215));
      return buf;
    }
    // 'g' move: id(2) + iang(2) — client computes position from iang + previous point
    const buf = new Uint8Array(5);
    buf[0] = 0x67; // 'g'
    w16(buf, 1, snakeId);
    w16(buf, 3, iang);
    return buf;
  }

  // Protocol < 15: absolute coordinate format
  if (isSelf && protocolVersion >= 14) {
    if (isGrow) {
      // 'n' self grow: [n][xx:2B][yy:2B][fam:3B] (dlen=7 → client detects as self)
      const buf = new Uint8Array(8);
      buf[0] = 0x6E; // 'n'
      w16(buf, 1, xx);
      w16(buf, 3, yy);
      w24(buf, 5, Math.round(fam * 16777215));
      return buf;
    }
    // 'g' self move: [g][xx:2B][yy:2B] (dlen=4 → client detects as self)
    const buf = new Uint8Array(5);
    buf[0] = 0x67; // 'g'
    w16(buf, 1, xx);
    w16(buf, 3, yy);
    return buf;
  }
  if (isGrow) {
    // 'n' grow: [n][id:2B][xx:2B][yy:2B][fam:3B] (dlen=9)
    const buf = new Uint8Array(10);
    buf[0] = 0x6E; // 'n'
    w16(buf, 1, snakeId);
    w16(buf, 3, xx);
    w16(buf, 5, yy);
    w24(buf, 7, Math.round(fam * 16777215));
    return buf;
  }
  // 'g' move: [g][id:2B][xx:2B][yy:2B] (dlen=6)
  const buf = new Uint8Array(7);
  buf[0] = 0x67; // 'g'
  w16(buf, 1, snakeId);
  w16(buf, 3, xx);
  w16(buf, 5, yy);
  return buf;
}

function encodeFamUpdate(snakeId, fam) {
  const buf = new Uint8Array(6);
  buf[0] = 0x68; // 'h'
  w16(buf, 1, snakeId);
  w24(buf, 3, Math.round(fam * 16777215));
  return buf;
}

function encodeTailRemove(snakeId, fam) {
  const buf = new Uint8Array(6);
  buf[0] = 0x72; // 'r'
  w16(buf, 1, snakeId);
  w24(buf, 3, Math.round(fam * 16777215));
  return buf;
}

function encodeTailRemoveSelf(snakeId) {
  const buf = new Uint8Array(3);
  buf[0] = 0x72; // 'r'
  w16(buf, 1, snakeId);
  return buf;
}

function encodeFoodSector(sx, sy, foods, protocolVersion) {
  protocolVersion = protocolVersion || config.PROTOCOL_VERSION;

  if (protocolVersion >= 14) {
    // Protocol >= 14: 'F' [sx] [sy] then per food: [cv] [rx] [ry] [rad*5]
    const buf = new Uint8Array(3 + foods.length * 4);
    buf[0] = 0x46; // 'F'
    buf[1] = sx;
    buf[2] = sy;
    let m = 3;
    for (const f of foods) {
      buf[m++] = f.cv;
      buf[m++] = f.rx;
      buf[m++] = f.ry;
      buf[m++] = Math.round(f.radius * 5);
    }
    return buf.subarray(0, m);
  }

  // Protocol >= 4 < 14: 'F' then per food: [cv] [xx:2B] [yy:2B] [rad*5]
  const buf = new Uint8Array(1 + foods.length * 6);
  buf[0] = 0x46; // 'F'
  let m = 1;
  for (const f of foods) {
    buf[m++] = f.cv;
    const fxx = Math.round(f.x);
    const fyy = Math.round(f.y);
    w16(buf, m, fxx); m += 2;
    w16(buf, m, fyy); m += 2;
    buf[m++] = Math.round(f.radius * 5);
  }
  return buf.subarray(0, m);
}

function encodeFoodSpawn(sx, sy, rx, ry, cv, radius, protocolVersion) {
  protocolVersion = protocolVersion || config.PROTOCOL_VERSION;

  if (protocolVersion >= 14) {
    // Protocol >= 14: [b][sx][sy][rx][ry][cv][rad*5]
    const buf = new Uint8Array(7);
    buf[0] = 0x62; // 'b' (born)
    buf[1] = sx;
    buf[2] = sy;
    buf[3] = rx;
    buf[4] = ry;
    buf[5] = cv;
    buf[6] = Math.round(radius * 5);
    return buf;
  }

  // Protocol >= 4 < 14: [b][cv][xx:2B][yy:2B][rad*5]
  const sectorSize = config.SECTOR_SIZE;
  const ssd256 = sectorSize / 256;
  const xx = Math.round(sx * sectorSize + rx * ssd256);
  const yy = Math.round(sy * sectorSize + ry * ssd256);
  const buf = new Uint8Array(7);
  buf[0] = 0x62; // 'b' (born)
  buf[1] = cv;
  w16(buf, 2, xx);
  w16(buf, 4, yy);
  buf[6] = Math.round(radius * 5);
  return buf;
}

function encodeFoodEat(sx, sy, rx, ry, eaterId, protocolVersion) {
  protocolVersion = protocolVersion || config.PROTOCOL_VERSION;

  if (protocolVersion >= 14) {
    // Protocol >= 14: '<' [sx][sy][rx][ry][eater_id:2B]
    const buf = new Uint8Array(7);
    buf[0] = 0x3C; // '<'
    buf[1] = sx;
    buf[2] = sy;
    buf[3] = rx;
    buf[4] = ry;
    w16(buf, 5, eaterId);
    return buf;
  }

  // Protocol >= 4 < 14: 'c' [xx:2B][yy:2B][eater_id:2B]
  const sectorSize = config.SECTOR_SIZE;
  const ssd256 = sectorSize / 256;
  const xx = Math.round(sx * sectorSize + rx * ssd256);
  const yy = Math.round(sy * sectorSize + ry * ssd256);
  const buf = new Uint8Array(7);
  buf[0] = 0x63; // 'c'
  w16(buf, 1, xx);
  w16(buf, 3, yy);
  w16(buf, 5, eaterId);
  return buf;
}

function encodeFoodEatSimple(sx, sy, rx, ry, protocolVersion) {
  protocolVersion = protocolVersion || config.PROTOCOL_VERSION;

  if (protocolVersion >= 14) {
    // Protocol >= 14: 'c' [sx][sy][rx][ry]
    const buf = new Uint8Array(5);
    buf[0] = 0x63; // 'c'
    buf[1] = sx;
    buf[2] = sy;
    buf[3] = rx;
    buf[4] = ry;
    return buf;
  }

  // Protocol >= 4 < 14: 'c' [xx:2B][yy:2B]
  const sectorSize = config.SECTOR_SIZE;
  const ssd256 = sectorSize / 256;
  const xx = Math.round(sx * sectorSize + rx * ssd256);
  const yy = Math.round(sy * sectorSize + ry * ssd256);
  const buf = new Uint8Array(5);
  buf[0] = 0x63; // 'c'
  w16(buf, 1, xx);
  w16(buf, 3, yy);
  return buf;
}

function encodeLeaderboard(myPos, rank, snakeCount, entries, protocolVersion) {
  // entries: [{sct, fam, cv, name}]
  protocolVersion = protocolVersion || config.PROTOCOL_VERSION;
  const bytesPerChar = protocolVersion < 12 ? 2 : 1;
  // Only send actual entries; clients use while(m<alen) so they read exactly what's sent
  const totalSlots = entries.length;
  let totalLen = 6;
  for (let i = 0; i < totalSlots; i++) {
    const nl = Math.min(entries[i].name.length, 24);
    totalLen += 7 + nl * bytesPerChar;
  }
  const buf = new Uint8Array(totalLen);
  let m = 0;
  buf[m++] = 0x6C; // 'l'
  buf[m++] = myPos;
  w16(buf, m, rank); m += 2;
  w16(buf, m, snakeCount); m += 2;
  for (let i = 0; i < totalSlots; i++) {
    const e = entries[i];
    w16(buf, m, e.sct); m += 2;
    w24(buf, m, Math.round(e.fam * 16777215)); m += 3;
    buf[m++] = e.cv % 9;
    const nl = Math.min(e.name.length, 24);
    buf[m++] = nl;
    for (let j = 0; j < nl; j++) {
      const code = e.name.charCodeAt(j);
      if (bytesPerChar === 2) buf[m++] = (code >> 8) & 0xFF;
      buf[m++] = code & 0xFF;
    }
  }
  return buf.subarray(0, m);
}

function encodePong() {
  return new Uint8Array([0x70]); // 'p'
}

function encodeDeath(type) {
  // type: 0=normal death, 1=victory, 2=server shutdown
  return new Uint8Array([0x76, type]); // 'v'
}

function encodeSectorAdd(sx, sy) {
  return new Uint8Array([0x57, sx, sy]); // 'W'
}

function encodeSectorRemove(sx, sy) {
  return new Uint8Array([0x77, sx, sy]); // 'w'
}

function encodeMinimap(size, data) {
  // 'M' = minimap packet (matches vlither/original slither.io client protocol)
  const rle = rleEncode(data, size);
  const buf = new Uint8Array(3 + rle.length);
  buf[0] = 0x4D; // 'M'
  w16(buf, 1, size);
  buf.set(rle, 3);
  return buf;
}

function encodeKillCount(snakeId, killCount) {
  const buf = new Uint8Array(6);
  buf[0] = 0x6B; // 'k'
  w16(buf, 1, snakeId);
  w24(buf, 3, killCount);
  return buf;
}

function encodePreySpawn(prey) {
  const buf = new Uint8Array(18);
  let m = 0;
  buf[m++] = 0x79; // 'y'
  // No id in first byte - prey spawn dlen > 4
  buf[m++] = prey.cv;
  w24(buf, m, Math.round(prey.x * 5)); m += 3;
  w24(buf, m, Math.round(prey.y * 5)); m += 3;
  buf[m++] = Math.round(prey.radius * 5);
  buf[m++] = prey.dir + 48;
  w24(buf, m, Math.round(prey.wantAngle / PI2 * 16777215) & 0xFFFFFF); m += 3;
  w24(buf, m, Math.round(prey.angle / PI2 * 16777215) & 0xFFFFFF); m += 3;
  w16(buf, m, Math.round(prey.speed * 1000)); m += 2;
  // Prepend id
  const result = new Uint8Array(2 + m);
  result[0] = 0x79; // 'y'
  w16(result, 1, prey.id);
  result.set(buf.subarray(1, m), 3);
  return result.subarray(0, 1 + 2 + m - 1);
}

// 'j' packet: update prey position + direction + angles + speed (length 18)
function encodePreyUpdate(prey) {
  const buf = new Uint8Array(16);
  let m = 0;
  buf[m++] = 0x6A; // 'j'
  w16(buf, m, prey.id); m += 2;
  // x, y as int16 (value * 3 + 1)
  w16(buf, m, Math.round((prey.x - 1) / 3)); m += 2;
  w16(buf, m, Math.round((prey.y - 1) / 3)); m += 2;
  // dir, current angle, wanted angle, speed (length = 18 variant)
  buf[m++] = prey.dir + 48;
  w24(buf, m, Math.round(prey.angle / PI2 * 16777215) & 0xFFFFFF); m += 3;
  w24(buf, m, Math.round(prey.wantAngle / PI2 * 16777215) & 0xFFFFFF); m += 3;
  w16(buf, m, Math.round(prey.speed * 1000)); m += 2;
  return buf.subarray(0, m);
}

function encodePreyRemove(preyId) {
  const buf = new Uint8Array(3);
  buf[0] = 0x79; // 'y'
  w16(buf, 1, preyId);
  return buf;
}

function encodePreyEaten(preyId, snakeId) {
  const buf = new Uint8Array(5);
  buf[0] = 0x79; // 'y'
  w16(buf, 1, preyId);
  w16(buf, 3, snakeId);
  return buf;
}

function rleEncode(data, size) {
  // Encode minimap for vlither/original slither.io client:
  //Scan right-to-left, bottom-to-top (matches client decode direction)
  //Data byte (0-127): 7 cells packed in bits 6..0 (bit 6 = rightmost cell)
  //Skip byte (129-254): skip (k-128) = 1..126 blank cells
  //Skip long (255 + n): skip 126*n blank cells
  const result = [];
  let blanks = 0;

  function flushBlanks() {
    while (blanks >= 126) {
      const n = Math.min(Math.floor(blanks / 126), 255);
      result.push(0xFF);
      result.push(n);
      blanks -= 126 * n;
    }
    if (blanks > 0) {
      result.push(128 + blanks);
      blanks = 0;
    }
  }

  for (let y = size - 1; y >= 0; y--) {
    for (let x = size - 1; x >= 0;) {
      const cells = Math.min(7, x + 1);
      let bits = 0;
      let allBlank = true;
      for (let i = 0; i < cells; i++) {
        if (data[y * size + (x - i)]) {
          bits |= (1 << (6 - i));
          allBlank = false;
        }
      }
      if (allBlank) {
        blanks += cells;
        x -= cells;
      } else {
        flushBlanks();
        result.push(bits);
        x -= cells;
      }
    }
  }
  flushBlanks();
  return new Uint8Array(result);
}

function bundlePackets(packets) {
  let totalLen = 0;
  for (const pkt of packets) {
    if (pkt.length < 32) totalLen += 1 + pkt.length;
    else totalLen += 2 + pkt.length;
  }
  const buf = new Uint8Array(totalLen);
  let m = 0;
  for (const pkt of packets) {
    if (pkt.length < 32) {
      buf[m++] = pkt.length + 32;
    } else {
      buf[m++] = (pkt.length >> 8) & 0x1F;
      buf[m++] = pkt.length & 0xFF;
    }
    buf.set(pkt, m);
    m += pkt.length;
  }
  return buf.subarray(0, m);
}

function encodeHighscore(sct, fam, name, message) {
  const nl = Math.min(name.length, 24);
  const buf = new Uint8Array(1 + 3 + 3 + 1 + nl + message.length);
  let m = 0;
  buf[m++] = 0x6D; // 'm'
  // sct (int24)
  buf[m++] = (sct >> 16) & 0xFF;
  buf[m++] = (sct >> 8) & 0xFF;
  buf[m++] = sct & 0xFF;
  // fam (int24, scaled to 0-16777215)
  const famInt = Math.round(Math.min(1, Math.max(0, fam)) * 16777215);
  buf[m++] = (famInt >> 16) & 0xFF;
  buf[m++] = (famInt >> 8) & 0xFF;
  buf[m++] = famInt & 0xFF;
  // name length + name
  buf[m++] = nl;
  for (let i = 0; i < nl; i++) buf[m++] = name.charCodeAt(i);
  // message (rest of packet)
  for (let i = 0; i < message.length; i++) buf[m++] = message.charCodeAt(i);
  return buf.subarray(0, m);
}

function encodeRadiusUpdate(fluxGrd) {
  const buf = Buffer.allocUnsafe(4);
  buf[0] = 0x7A; // 'z'
  buf[1] = (fluxGrd >> 16) & 0xFF;
  buf[2] = (fluxGrd >> 8) & 0xFF;
  buf[3] = fluxGrd & 0xFF;
  return buf;
}

module.exports = {
  encodeServerVersion,
  encodeInitPacket,
  encodeSnakeSpawn,
  encodeSnakeRemove,
  encodeAngleUpdate,
  encodeSelfAngleUpdate,
  encodeBodyPointAdd,
  encodeFamUpdate,
  encodeTailRemove,
  encodeTailRemoveSelf,
  encodeFoodSector,
  encodeFoodSpawn,
  encodeFoodEat,
  encodeFoodEatSimple,
  encodeLeaderboard,
  encodePong,
  encodeDeath,
  encodeSectorAdd,
  encodeSectorRemove,
  encodeMinimap,
  encodeKillCount,
  encodePreySpawn,
  encodePreyUpdate,
  encodePreyRemove,
  encodePreyEaten,
  bundlePackets,
  encodeHighscore,
  encodeRadiusUpdate,
  calcScore,
  fpsls,
  fmlts,
};
