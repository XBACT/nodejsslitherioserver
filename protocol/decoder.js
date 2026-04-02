'use strict';

const { PI2 } = require('../utils/math');

function decodeLoginPacket(data) {
  if (data.length < 4 || data[0] !== 0x73) return null;

  const version = data[1];

  // vlither-style long format (version=30): 20-byte padding at bytes 4-23, skin at byte 24
  if (version === 30 && data.length >= 26) {
    const skin = data[24];
    const nameLen = Math.min(data[25], 24, data.length - 26);
    let name = '';
    for (let i = 0; i < nameLen; i++) {
      name += String.fromCharCode(data[26 + i]);
    }
    return { version, skin, name, isProtocol13: false };
  }

  // New-style short format (version >= 20, e.g. protocol14.js sends version=31):
  // [0x73][version][client_ver_hi][client_ver_lo][skin][name_len][name...]
  if (version >= 20) {
    if (data.length < 6) return null;
    const skin = data[4];
    const nameLen = Math.min(data[5], 24, data.length - 6);
    let name = '';
    for (let i = 0; i < nameLen; i++) {
      name += String.fromCharCode(data[6 + i]);
    }
    return { version, skin, name, isProtocol13: false };
  }

  // Old short format (protocol13-style, version <= 19):
  // [0x73][version][skin][name_len][name...]
  const skin = data[2];
  const nameLen = Math.min(data[3], 24, data.length - 4);
  let name = '';
  for (let i = 0; i < nameLen; i++) {
    name += String.fromCharCode(data[4 + i]);
  }
  return { version, skin, name, isProtocol13: true };
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
