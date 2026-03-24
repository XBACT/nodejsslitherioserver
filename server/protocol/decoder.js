'use strict';

const { PI2 } = require('../utils/math');

function decodeLoginPacket(data) {
  if (data.length < 4 || data[0] !== 0x73) return null;

  if (data.length >= 26) {
    const skin = data[24];
    const nameLen = Math.min(data[25], 24, data.length - 26);
    let name = '';
    for (let i = 0; i < nameLen; i++) {
      name += String.fromCharCode(data[26 + i]);
    }
    return { version: (data[1] << 8) | data[2], skin, name, isProtocol13: false };
  }

  const skin = data[2];
  const nameLen = Math.min(data[3], 24, data.length - 4);
  let name = '';
  for (let i = 0; i < nameLen; i++) {
    name += String.fromCharCode(data[4 + i]);
  }
  return { version: data[1], skin, name, isProtocol13: true };
}

function decodeAngle(byte) {
  return byte * PI2 / 251;
}

function decodeInput(data) {
  if (data.length === 0) return null;
  const cmd = data[0];

  if (cmd <= 250) {
    return { type: 'angle', angle: cmd * PI2 / 251 };
  }

  switch (cmd) {
    case 0xFB: return { type: 'ping' };
    case 0xFC: {
      const val = data[1] || 0;
      if (val < 128) return { type: 'turn', direction: 'left', amount: val };
      return { type: 'turn', direction: 'right', amount: val - 128 };
    }
    case 0xFD: return { type: 'boost', active: true };
    case 0xFE: return { type: 'boost', active: false };
    case 0xFF: {
      if (data.length > 1 && data[1] === 0x76) {
        let msg = '';
        for (let i = 2; i < data.length; i++) msg += String.fromCharCode(data[i]);
        return { type: 'victory_msg', message: msg };
      }
      return null;
    }
    default: return null;
  }
}

module.exports = { decodeLoginPacket, decodeAngle, decodeInput };
