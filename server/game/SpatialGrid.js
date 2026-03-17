'use strict';

class SpatialGrid {
  constructor(worldSize, cellSize) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.cols = Math.ceil(worldSize / cellSize);
    this.cells = new Map();
  }

  _key(cx, cy) {
    return cx * 100000 + cy;
  }

  _cellCoord(v) {
    return Math.floor(v * this.invCellSize);
  }

  insert(obj, x, y, radius) {
    const x0 = this._cellCoord(x - radius);
    const x1 = this._cellCoord(x + radius);
    const y0 = this._cellCoord(y - radius);
    const y1 = this._cellCoord(y + radius);
    const cellKeys = [];
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const key = this._key(cx, cy);
        let cell = this.cells.get(key);
        if (!cell) {
          cell = [];
          this.cells.set(key, cell);
        }
        cell.push(obj);
        cellKeys.push(key);
      }
    }
    return cellKeys;
  }

  remove(cellKeys, obj) {
    for (const key of cellKeys) {
      const cell = this.cells.get(key);
      if (!cell) continue;
      const idx = cell.indexOf(obj);
      if (idx !== -1) {
        cell[idx] = cell[cell.length - 1];
        cell.pop();
        if (cell.length === 0) this.cells.delete(key);
      }
    }
  }

  query(x, y, radius) {
    const results = [];
    const seen = new Set();
    const x0 = this._cellCoord(x - radius);
    const x1 = this._cellCoord(x + radius);
    const y0 = this._cellCoord(y - radius);
    const y1 = this._cellCoord(y + radius);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const cell = this.cells.get(this._key(cx, cy));
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          const obj = cell[i];
          if (!seen.has(obj)) {
            seen.add(obj);
            results.push(obj);
          }
        }
      }
    }
    return results;
  }

  clear() {
    this.cells.clear();
  }
}

module.exports = SpatialGrid;
