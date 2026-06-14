// ATSsemble deterministic game engine.
//
// Pure, render-free, synchronous, tick-based simulation of the game. Contains
// NO Phaser, NO DOM, NO Math.random and NO Date.now, so the exact same code can
// run in the browser (as the source of truth for rendering) and inside the
// Supabase edge function (to re-compute the score from a player's recorded
// inputs). Because both sides share this file and the RNG is seeded, a replay on
// the server reproduces the client's game bit-for-bit.
//
// IMPORTANT: keep this file in sync with supabase/functions/_shared/engine.ts —
// they must contain identical logic or replay verification will reject honest
// scores.

const COLS = 10;
const ROWS = 15;

// Weighted letter bag (sum = 100), ported verbatim from the original game.
const BAG = [
  ['A', 20], ['T', 20], ['S', 20],
  ['*', 3],   // wildcard
  ['B', 3],   // bomb 3x3
  ['M', 2],   // mega bomb (row/col)
  ['D', 4], ['E', 4], ['I', 4], ['O', 4], ['N', 4],
  ['R', 3], ['X', 3], ['Z', 3], ['Y', 3],
];

const GARBAGE_JUNK = ['D', 'E', 'I', 'O', 'N', 'R', 'X', 'Z', 'Q'];

// Deterministic PRNG. Same seed => same sequence in browser and on the server.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inBounds = (x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS;

class AtsEngine {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.active = null;          // { x, y, letter }
    this.score = 0;
    this.lockCount = 0;
    this.tick = 0;               // canonical clock: one gravity step per tick
    this.gameOver = false;
    this.nextGarbageInterval = 0;
    this.nextQueue = [];
    this.refillQueue(3);
    this.spawn();                // first piece exists at tick 0
  }

  // --- RNG-backed helpers ---
  randLetter() {
    let r = this.rng() * 100;
    for (const [ch, w] of BAG) { if ((r -= w) < 0) return ch; }
    return 'A';
  }

  refillQueue(n = 3) {
    while (this.nextQueue.length < n) this.nextQueue.push(this.randLetter());
  }

  // Drop interval in ms (used by the renderer to pace real-time gravity). The
  // server does not need timing — it just steps the sim — but the formula lives
  // here so the client stays in lockstep with difficulty ramping.
  getDropInterval() {
    const minInterval = 150;
    return Math.max(minInterval, 700 - this.lockCount * 5 - Math.floor(this.score / 50));
  }

  canMove(x, y) { return inBounds(x, y) && this.grid[y][x] === null; }

  spawn() {
    this.refillQueue(3);
    const letter = this.nextQueue.shift();
    this.refillQueue(3);
    const x = Math.floor(COLS / 2), y = 0;
    if (!this.canMove(x, y)) { this.gameOver = true; this.active = null; return; }
    this.active = { x, y, letter };
  }

  addScore(v) { this.score += v; }

  // --- Player inputs (do NOT advance the tick) ---
  // Returns true if the state changed (useful for the recorder/renderer).
  input(action) {
    if (this.gameOver || !this.active) return false;
    const a = this.active;
    switch (action) {
      case 'L':
        if (this.canMove(a.x - 1, a.y)) { a.x -= 1; return true; }
        return false;
      case 'R':
        if (this.canMove(a.x + 1, a.y)) { a.x += 1; return true; }
        return false;
      case 'D':
        if (this.canMove(a.x, a.y + 1)) { a.y += 1; return true; }
        return false;
      case 'drop': {
        let { x, y } = a;
        while (this.canMove(x, y + 1)) y++;
        a.y = y;
        this.lockPiece();
        return true;
      }
      default:
        return false;
    }
  }

  // --- Gravity tick: advance the simulation by one step ---
  step() {
    if (this.gameOver) return;
    this.tick++;
    if (!this.active) { this.spawn(); return; }
    const { x, y } = this.active;
    if (this.canMove(x, y + 1)) this.active.y = y + 1;
    else this.lockPiece();
  }

  // --- Locking & special blocks (synchronous port of lockPiece) ---
  lockPiece() {
    const { x, y, letter } = this.active;
    this.active = null;

    if (letter === 'B') {
      let cleared = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        if (this.grid[ny][nx]) cleared++;
        this.grid[ny][nx] = null;
      }
      if (cleared > 0) this.addScore(cleared * 20);
      this.applyGravity();
      this.resolveMatches();
      this.postLockContinue();
      return;
    }

    if (letter === 'M') {
      for (let cx = 0; cx < COLS; cx++) this.grid[y][cx] = null;
      for (let cy = 0; cy < ROWS; cy++) { if (cy !== y) this.grid[cy][x] = null; }
      this.addScore(150);
      this.applyGravity();
      this.resolveMatches();
      this.postLockContinue();
      return;
    }

    this.grid[y][x] = { letter };
    this.resolveMatches();
    this.postLockContinue();
  }

  postLockContinue() {
    if (this.gameOver) return;
    this.lockCount++;

    let highestRow = 0;
    for (let yy = 0; yy < ROWS; yy++) {
      if (this.grid[yy].some(cell => cell !== null)) { highestRow = yy; break; }
    }

    if (!this.nextGarbageInterval) {
      this.nextGarbageInterval = 12 + Math.floor(this.rng() * 5); // 12-16
    }
    let interval = this.nextGarbageInterval;
    const lowStackThreshold = 12;
    if (highestRow < lowStackThreshold) interval *= 2;

    if (this.lockCount % interval === 0) {
      this.addGarbageRow();
      if (this.gameOver) return;
      this.nextGarbageInterval = 12 + Math.floor(this.rng() * 5);
      this.spawn();
    } else {
      this.spawn();
    }
  }

  addGarbageRow() {
    // Pushing up while the top row is occupied ends the game.
    if (this.grid[0].some(c => !!c)) { this.gameOver = true; return; }
    for (let yy = 0; yy < ROWS - 1; yy++) {
      for (let x = 0; x < COLS; x++) this.grid[yy][x] = this.grid[yy + 1][x];
    }
    let maxHoles = 5;
    if (this.score > 4000) maxHoles = 1;
    else if (this.score > 3000) maxHoles = 2;
    else if (this.score > 2000) maxHoles = 3;
    else if (this.score > 1000) maxHoles = 4;
    const numHoles = 1 + Math.floor(this.rng() * maxHoles);
    const holeIndices = [];
    while (holeIndices.length < numHoles) {
      const idx = Math.floor(this.rng() * COLS);
      if (!holeIndices.includes(idx)) holeIndices.push(idx);
    }
    for (let x = 0; x < COLS; x++) {
      if (holeIndices.includes(x)) { this.grid[ROWS - 1][x] = null; continue; }
      const letter = GARBAGE_JUNK[Math.floor(this.rng() * GARBAGE_JUNK.length)];
      this.grid[ROWS - 1][x] = { letter };
    }
  }

  // --- Matching & gravity (synchronous port) ---
  findMatches() {
    const toClear = new Set();
    let tripleCount = 0, diagCount = 0;
    const get = (x, y) => inBounds(x, y) ? this.grid[y][x] : null;
    const isA = (c) => !!c && (c.letter === 'A' || c.letter === '*');
    const isT = (c) => !!c && (c.letter === 'T' || c.letter === '*');
    const isS = (c) => !!c && (c.letter === 'S' || c.letter === '*');
    const addCell = (x, y) => { if (x >= 0 && x < COLS && y >= 0 && y < ROWS) toClear.add(y * 100 + x); };

    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const c = get(x, y); if (!isA(c)) continue;
      // Horizontal
      if (isT(get(x + 1, y)) && isS(get(x + 2, y))) {
        for (let cx = 0; cx < COLS; cx++) addCell(cx, y);
        tripleCount++;
      }
      // Vertical
      if (isT(get(x, y + 1)) && isS(get(x, y + 2))) {
        for (let cy = 0; cy < ROWS; cy++) addCell(x, cy);
        tripleCount++;
      }
      // Diagonal down-right
      if (isT(get(x + 1, y + 1)) && isS(get(x + 2, y + 2))) {
        let dx = x, dy = y;
        while (dx >= 0 && dy >= 0) { dx--; dy--; }
        dx++; dy++;
        while (dx < COLS && dy < ROWS) { addCell(dx, dy); dx++; dy++; }
        tripleCount++; diagCount++;
      }
      // Diagonal up-right
      if (isT(get(x + 1, y - 1)) && isS(get(x + 2, y - 2))) {
        let dx = x, dy = y;
        while (dx >= 0 && dy < ROWS) { dx--; dy++; }
        dx++; dy--;
        while (dx < COLS && dy >= 0) { addCell(dx, dy); dx++; dy--; }
        tripleCount++; diagCount++;
      }
    }
    return { toClear, tripleCount, diagCount };
  }

  resolveMatches() {
    let chain = 0;
    for (;;) {
      const { toClear, tripleCount, diagCount } = this.findMatches();
      if (tripleCount > 0) {
        const gain = 100 * tripleCount + 25 * diagCount + Math.max(0, chain) * 50 * tripleCount;
        this.addScore(gain);
      }
      if (toClear.size === 0) return;
      chain++;
      toClear.forEach(key => { const x = key % 100, y = (key / 100) | 0; this.grid[y][x] = null; });
      this.applyGravity();
    }
  }

  applyGravity() {
    for (let x = 0; x < COLS; x++) {
      let write = ROWS - 1;
      for (let y = ROWS - 1; y >= 0; y--) {
        if (this.grid[y][x]) {
          if (y !== write) { this.grid[write][x] = this.grid[y][x]; this.grid[y][x] = null; }
          write--;
        }
      }
    }
  }

  // --- Server-side verification: re-run a recorded game and return its score ---
  // inputs: ordered array of { t: tick, a: action } where action in {L,R,D,drop}.
  // Convention: an input tagged tick N was issued while engine.tick === N, i.e.
  // after the step() that produced tick N and before the next step().
  static replay(seed, inputs, opts = {}) {
    const maxTicks = opts.maxTicks ?? 100000;
    const eng = new AtsEngine(seed);

    // Validate & bucket inputs by tick, preserving their recorded order.
    const byTick = new Map();
    let prevT = 0;
    for (const ev of (inputs || [])) {
      const t = ev.t | 0;
      const a = ev.a;
      if (t < 0 || t < prevT) return null;                 // ticks must be non-decreasing
      if (a !== 'L' && a !== 'R' && a !== 'D' && a !== 'drop') return null;
      prevT = t;
      if (!byTick.has(t)) byTick.set(t, []);
      byTick.get(t).push(a);
    }

    const applyAt = (t) => { const arr = byTick.get(t); if (arr) for (const a of arr) eng.input(a); };

    applyAt(0);                                            // inputs issued at tick 0
    let guard = 0;
    while (!eng.gameOver) {
      eng.step();
      applyAt(eng.tick);
      if (++guard > maxTicks) break;                       // DoS guard
    }
    return eng.score;
  }
}

// Expose as globals for <script> tag usage (browser) and support ES module
// import for Deno/Node (the Supabase edge function copy uses `import`).
if (typeof window !== 'undefined') {
  window.AtsEngine = AtsEngine;
  window.ATS_COLS = COLS;
  window.ATS_ROWS = ROWS;
}
if (typeof exports !== 'undefined') {
  exports.AtsEngine = AtsEngine;
  exports.COLS = COLS;
  exports.ROWS = ROWS;
}
