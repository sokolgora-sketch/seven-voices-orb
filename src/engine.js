// Seven Voices Orb — engine v0.6.1 (8-direction glide)
// Grid: 7x7
// Symbols: "." empty, "X" blocker, "O" orb, "G" goal
//
// Modes:
// - "step": 4-neighbor step (N,S,E,W) to "." or "G"
// - "glide": 8-direction slide (N,S,E,W,NE,NW,SE,SW) until blocked;
//           stop on last "." before a blocker/edge, or land on "G".
//
// Levels:
// - each level.board is 7 strings of length 7.
//
// Editor APIs:
// - setCell(r,c,ch) where ch in [".","X","O","G","C"]
// - normalizePieces(): enforce single O + single G
// - setBoardFromStrings(rows7): load board (7 strings)

export class OrbEngine {
  constructor(mode = "step") {
    this.SIZE = 7;
    this.mode = mode === "glide" ? "glide" : "step";

    this.levels = [
      

{
        name: "L1 — Warmup",
       author: "",
       difficulty: "",
       hint: "",
        author: "",
        difficulty: "",
        hint: "",
        board: [
          ".......",
          "..X....",
          "....X..",
          "...O...",
          ".......",
          ".X...G.",
          ".......",
        ],
      },
      
{
        name: "L2 — Corridor",
        author: "",
        difficulty: "",
        hint: "",
        board: [
          "..X.X..",
          "..X.X..",
          "..X.X..",
          "..O....",
          "..X.XXX",
          "....XG.",
          "..X....",
        ],
      },
      {
        name: "L3 — Zigzag",
        board: [
          "X.....X",
          ".X...X.",
          "..X.X..",
          "...O...",
          "..X.X..",
          ".X...X.",
          "X..G..X",
        ],
      },
    ];

    this.levelIndex = 0;
    this.reset();

    this.lastSafe = null;      // {r,c}
    this.forcedDir = null;     // {dr,dc} or null
    this.orbOnBumper = false;  // last landing was B
  }

  // ---------- level / state ----------
  reset() {
    const level = this.levels[this.levelIndex] || this.levels[0];
    this.board = level.board.map(r => r.split(""));
    this.win = false;
    this.normalizePieces();

    const o = this.findOrb();
    this.lastSafe = o ? { r: o.r, c: o.c } : null;
    this.forcedDir = null;
    this.orbOnBumper = false;
  }

  setMode(mode) {
    this.mode = mode === "glide" ? "glide" : "step";
  }

  setLevel(index) {
    const i = Number(index);
    if (!Number.isFinite(i)) return;
    if (i < 0 || i >= this.levels.length) return;
    this.levelIndex = i;
    this.reset();
  }

  nextLevel() {
    this.levelIndex = (this.levelIndex + 1) % this.levels.length;
    this.reset();
  }

  // ---------- helpers ----------
  inBounds(r, c) {
    return r >= 0 && r < this.SIZE && c >= 0 && c < this.SIZE;
  }

  isBlocker(ch) {
    // hard wall only
    return ch === "X";
  }

  findOrb() {
    for (let r = 0; r < this.SIZE; r++) {
      for (let c = 0; c < this.SIZE; c++) {
        if (this.board[r][c] === "O") return { r, c };
      }
    }
    return null;
  }

  findGoal() {
    for (let r = 0; r < this.SIZE; r++) {
      for (let c = 0; c < this.SIZE; c++) {
        if (this.board[r][c] === "G") return { r, c };
      }
    }
    return null;
  }

  countChar(ch) {
    let n = 0;
    for (let r = 0; r < this.SIZE; r++) {
      for (let c = 0; c < this.SIZE; c++) {
        if (this.board[r][c] === ch) n++;
      }
    }
    return n;
  }

  isTraversable(ch) {
    // tiles orb can slide over / land on (NOT including G gating)
    return ch === "." || ch === "C";
  }

  captureAlongPath(from, to) {
    const dr = Math.sign(to.r - from.r);
    const dc = Math.sign(to.c - from.c);

    // safety: must be straight or diagonal
    if (!((dr === 0 && dc !== 0) || (dr !== 0 && dc === 0) || (dr !== 0 && dc !== 0))) return;

    let r = from.r + dr;
    let c = from.c + dc;

    while (this.inBounds(r, c)) {
      if (this.board[r][c] === "C") this.board[r][c] = ".";
      if (r === to.r && c === to.c) break;
      r += dr;
      c += dc;
    }
  }

  // ---------- editor ----------
  setCell(r, c, ch) {
    if (!this.inBounds(r, c)) return false;
    if (![".","X","O","G","C","B","H"].includes(ch)) return false;

    this.board[r][c] = ch;
    this.normalizePieces();
    this.win = false;
    return true;
  }

  normalizePieces() {
    // enforce exactly one O and one G
    let foundO = 0;
    let foundG = 0;

    for (let r = 0; r < this.SIZE; r++) {
      for (let c = 0; c < this.SIZE; c++) {
        const ch = this.board[r][c];
        if (ch === "O") {
          foundO++;
          if (foundO > 1) this.board[r][c] = ".";
        }
        if (ch === "G") {
          foundG++;
          if (foundG > 1) this.board[r][c] = ".";
        }
      }
    }

    // if missing, place defaults
    if (foundO === 0) this.board[3][3] = "O";
    if (foundG === 0) this.board[5][5] = "G";
  }

  setBoardFromStrings(rows7) {
    if (!Array.isArray(rows7) || rows7.length !== 7) return false;
    const clean = rows7.map(s => String(s));
    if (!clean.every(s => s.length === 7)) return false;

    const okChars = new Set([".","X","O","G","C","B","H"]);
    if (!clean.every(row => row.split("").every(ch => okChars.has(ch)))) return false;

    this.board = clean.map(r => r.split(""));
    this.win = false;
    this.normalizePieces();
    return true;
  }

  exportBoardStrings() {
    return this.board.map(r => r.join(""));
  }

  // ---------- movement ----------
  legalMoves() {
    if (this.win) return [];
    const orb = this.findOrb();
    if (!orb) return [];

    const walkable = (ch) => (ch === "." || ch === "C" || ch === "B" || ch === "H" || ch === "G");
    const passable = (ch) => (ch === "." || ch === "C" || ch === "B" || ch === "H"); // not G, not X

    const deltas4 = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    const deltas8 = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];

    if (this.mode === "step") {
      const dirs = this.forcedDir ? [[this.forcedDir.dr, this.forcedDir.dc]] : deltas4;

      return dirs
        .map(([dr, dc]) => ({ r: orb.r + dr, c: orb.c + dc, dr, dc }))
        .filter(p => this.inBounds(p.r, p.c))
        .filter(p => walkable(this.board[p.r][p.c]))
        .filter(p => {
          // cannot stop on B twice in a row
          const dest = this.board[p.r][p.c];
          if (this.orbOnBumper && dest === "B") return false;
          return true;
        })
        .map(p => ({ r: p.r, c: p.c }));
    }

    const moves = [];
    const seen = new Set();

    const dirs = this.forcedDir ? [[this.forcedDir.dr, this.forcedDir.dc]] : deltas8;

    for (const [dr, dc] of dirs) {
      let r = orb.r + dr;
      let c = orb.c + dc;

      if (!this.inBounds(r, c)) continue;

      // first cell cannot be an X blocker
      if (this.isBlocker(this.board[r][c])) continue;

      // march over passable cells (.,C,B,H)
      while (this.inBounds(r, c) && passable(this.board[r][c])) {
        r += dr;
        c += dc;
      }

      // if we stopped on G, allow landing on G
      if (this.inBounds(r, c) && this.board[r][c] === "G") {
        const key = `${r},${c}`;
        if (!seen.has(key)) {
          seen.add(key);
          moves.push({ r, c });
        }
        continue;
      }

      // step back to last passable cell
      const stopR = r - dr;
      const stopC = c - dc;

      if (!this.inBounds(stopR, stopC)) continue;
      if (stopR === orb.r && stopC === orb.c) continue;

      const dest = this.board[stopR][stopC];
      if (!passable(dest)) continue;

      // cannot stop on B twice in a row
      if (this.orbOnBumper && dest === "B") continue;

      const key = `${stopR},${stopC}`;
      if (!seen.has(key)) {
        seen.add(key);
        moves.push({ r: stopR, c: stopC });
      }
    }

    return moves;
  }

  moveTo(r, c) {
    if (this.win) return { ok: false, reason: "already_won" };

    const orb = this.findOrb();
    if (!orb) return { ok: false, reason: "no_orb" };

    const legal = this.legalMoves();
    const ok = legal.some(m => m.r === r && m.c === c);
    if (!ok) return { ok: false, reason: "illegal_move" };

    const dr = Math.sign(r - orb.r);
    const dc = Math.sign(c - orb.c);

    // capture any C tiles you cross (including destination if it’s C)
    this.captureAlongPath(orb, { r, c });

    const target = this.board[r][c];

    // clear old orb
    this.board[orb.r][orb.c] = ".";

    // default: clear forced state unless we land on bumper
    this.forcedDir = null;
    this.orbOnBumper = false;

    // HOLE: landing on H sends orb back to lastSafe (hole remains H)
    if (target === "H") {
      // orb does NOT occupy the hole tile
      if (this.lastSafe) {
        this.board[this.lastSafe.r][this.lastSafe.c] = "O";
      } else {
        // fallback: if somehow no lastSafe, reset level
        this.reset();
      }
      this.win = false;
      return { ok: true, win: this.win, fell: true };
    }

    // normal landing (.,C,B,G)
    this.board[r][c] = "O";

    // BUMPER: force reverse direction next move
    if (target === "B") {
      this.forcedDir = { dr: -dr, dc: -dc };
      this.orbOnBumper = true;
    }

    // update lastSafe (anything except hole)
    this.lastSafe = { r, c };

    const remainingC = this.countChar("C");
    if (target === "G" && remainingC === 0) this.win = true;

    return { ok: true, win: this.win };
  }

  // ---------- UI state ----------
  getState() {
    const orb = this.findOrb();
    const goal = this.findGoal(); // may be null after win because O overwrote it
    const lvl = (this.levels[this.levelIndex] || this.levels[0]) || {};
    return {
      size: this.SIZE,
      forcedDir: this.forcedDir,
      orbOnBumper: !!this.orbOnBumper,
      lastSafe: this.lastSafe,

      remainingC: this.countChar("C"),
      board: this.board.map((r) => r.join("")),
      orb,
      goal,
      win: this.win,
      mode: this.mode,
      levelIndex: this.levelIndex,
      levelName: lvl.name || "",
      levelAuthor: lvl.author || "",
      levelDifficulty: lvl.difficulty || "",
      levelHint: lvl.hint || "",
      levelCount: this.levels.length,
      legalMoves: this.legalMoves(),
    };
  }
}

export const engine = new OrbEngine("step");
