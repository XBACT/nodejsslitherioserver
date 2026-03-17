'use strict';

const PI2 = Math.PI * 2;

function angleTo(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function distanceSq(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

function normalizeAngle(a) {
  a = a % PI2;
  if (a < 0) a += PI2;
  return a;
}

function angleDiff(a, b) {
  let d = (b - a) % PI2;
  if (d < -Math.PI) d += PI2;
  if (d > Math.PI) d -= PI2;
  return d;
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

// Generate random position within game circle
function randomPosition(radius) {
  const angle = Math.random() * PI2;
  const r = Math.sqrt(Math.random()) * radius * 0.7;
  return {
    x: radius + Math.cos(angle) * r,
    y: radius + Math.sin(angle) * r,
  };
}

module.exports = {
  PI2,
  angleTo,
  distance,
  distanceSq,
  normalizeAngle,
  angleDiff,
  clamp,
  randomInt,
  randomFloat,
  randomPosition,
};
