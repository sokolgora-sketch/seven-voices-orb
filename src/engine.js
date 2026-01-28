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
  }

  // ---------- level / state ----------
  reset() {
    const level = this.levels[this.levelIndex] || this.levels[0];
    this.board = level.board.map(r => r.split(""));
    this.win = false;
    this.normalizePieces();
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
    if (![".","X","O","G","C"].includes(ch)) return false;

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

    const okChars = new Set([".","X","O","G","C"]);
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
      const remainingC = this.countChar("C");
      return deltas4
        .map(([dr, dc]) => ({ r: orb.r + dr, c: orb.c + dc }))
        .filter(p => this.inBounds(p.r, p.c))
        .filter(p => {
          const ch = this.board[p.r][p.c];
          return ch === "." || ch === "C" || (ch === "G" && remainingC === 0);
        });
    }

    // glide (8-direction): slide over "."; stop on last "." before blocker/edge; can land on "G"
    const moves = [];
    const seen = new Set();

    for (const [dr, dc] of deltas8) {
      let r = orb.r + dr;
      let c = orb.c + dc;

      // immediate out of bounds => no move
      if (!this.inBounds(r, c)) continue;

      // if first cell is blocker => cannot move that way
      if (this.isBlocker(this.board[r][c])) continue;

      // march over empty cells
      while (this.inBounds(r, c) && this.isTraversable(this.board[r][c])) {
        r += dr;
        c += dc;
      }

      const remainingC = this.countChar("C");

      // case 1: we stopped because we hit "G"
      if (this.inBounds(r, c) && this.board[r][c] === "G") {
        // Only allow landing on G if captures are done.
        if (remainingC === 0) {
          const key = `${r},${c}`;
          if (!seen.has(key)) {
            seen.add(key);
            moves.push({ r, c });
          }
        } else {
          // If G is still locked, treat it like a wall: stop before it.
          const stopR = r - dr;
          const stopC = c - dc;
          if (this.inBounds(stopR, stopC) && !(stopR === orb.r && stopC === orb.c)) {
            const stopCh = this.board[stopR][stopC];
            if (this.isTraversable(stopCh)) {
              const key = `${stopR},${stopC}`;
              if (!seen.has(key)) {
                seen.add(key);
                moves.push({ r: stopR, c: stopC });
              }
            }
          }
        }
        continue;
      }

      // case 2: we stopped because we hit blocker or edge or "O" (shouldn't) => step back to last empty
      const stopR = r - dr;
      const stopC = c - dc;

      if (this.inBounds(stopR, stopC)) {
        // must actually move somewhere
        if (stopR === orb.r && stopC === orb.c) continue;

        const stopCh = this.board[stopR][stopC];
        if (this.isTraversable(stopCh)) {
          const key = `${stopR},${stopC}`;
          if (!seen.has(key)) {
            seen.add(key);
            moves.push({ r: stopR, c: stopC });
          }
        }
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

    const target = this.board[r][c];

    // capture any C tiles you cross (including destination if it’s C)
    this.captureAlongPath(orb, { r, c });

    this.board[orb.r][orb.c] = ".";
    this.board[r][c] = "O";

    const remainingC = this.countChar("C");
    if (target === "G" && remainingC === 0) this.win = true;

    return { ok: true, win: this.win };
  }

  // ---------- UI state ----------
  getState() {
    const orb = this.findOrb();
    const goal = this.findGoal(); // may be null after win because O overwrote it
    return {
      size: this.SIZE,
      remainingC: this.countChar("C"),
      board: this.board.map(r => r.join("")),
      orb,
      goal,
      win: this.win,
      mode: this.mode,
      levelIndex: this.levelIndex,
      levelName: (this.levels[this.levelIndex] || this.levels[0]).name,
      levelCount: this.levels.length,
      legalMoves: this.legalMoves(),
    };
  }
}

export const engine = new OrbEngine("step");
