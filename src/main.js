import { engine } from "./engine.js";

const $ = (id) => document.getElementById(id);

// ---- Required DOM ----
const boardEl = $("board");
if (!boardEl) {
  console.error("[FATAL] #board not found in index.html");
  throw new Error("#board missing");
}

// ---- Optional DOM ----
const infoEl = $("info");
const resetBtn = $("resetBtn");

const modeSel = $("modeSel");
const levelSel = $("levelSel");
const nextBtn = $("nextBtn");
const editorToggle = $("editorToggle");
const paintSel = $("paintSel");
const exportBtn = $("exportBtn");
const importBtn = $("importBtn");
const levelText = $("levelText");

// HUD pills (new HTML)
const hudMode = $("hudMode");
const hudLevel = $("hudLevel");
const hudMoves = $("hudMoves");

// Win UI (new HTML)
const winOverlay = $("winOverlay");
const winMoves = $("winMoves");
const nextLevelBtn = $("nextLevelBtn");
const closeWinBtn = $("closeWinBtn");

// Win banner (older HTML)
const winBanner = $("winBanner");

// ---- state ----
let moveCount = 0;

// ---- helpers ----
function getLevelsSafe() {
  const lv = engine && engine.levels;
  return Array.isArray(lv) ? lv : [];
}



function getLevelIndexSafe() {
  return (engine && Number.isFinite(engine.levelIndex)) ? engine.levelIndex : 0;
}

function applyLevel(idx) {
  const levels = getLevelsSafe();
  const max = Math.max(0, (levels.length || 1) - 1);

  let i = Number(idx);
  if (!Number.isFinite(i)) i = 0;
  if (i < 0) i = 0;
  if (i > max) i = max;

  if (typeof engine.setLevel === "function") {
    engine.setLevel(i);
    moveCount = 0;
    if (levelSel) levelSel.value = String(i);
    return true;
  }

  return false;
}

function syncLevelOptions() {
  if (!levelSel) return;

  const levels = getLevelsSafe();
  levelSel.innerHTML = "";

  levels.forEach((L, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = L?.name ? L.name : `Level ${idx + 1}`;
    levelSel.appendChild(opt);
  });

  const cur = String(getLevelIndexSafe());
  if (levels.length) levelSel.value = cur;
}

function setModeFromSelect() {
  if (!modeSel || typeof engine.setMode !== "function") return;
  const v = modeSel.value === "glide" ? "glide" : "step";
  engine.setMode(v);
}

function showWinUI() {
  if (winBanner) winBanner.style.display = "block";
  if (winMoves) winMoves.textContent = String(moveCount);
  if (winOverlay) winOverlay.style.display = "flex";
}

function hideWinUI() {
  if (winBanner) winBanner.style.display = "none";
  if (winOverlay) winOverlay.style.display = "none";
}

function editorOn() {
  return !!(editorToggle && editorToggle.value === "on");
}

function ensureTextAreaVisible() {
  if (!levelText) return;
  levelText.style.display = "block";
}

// ---- render ----
function render() {
  const s = engine.getState ? engine.getState() : null;
  if (!s) return;

  hideWinUI();

  // keep modeSel synced (if engine changes it)
  if (modeSel && s.mode && modeSel.value !== s.mode) modeSel.value = s.mode;

  boardEl.innerHTML = "";

  for (let r = 0; r < s.size; r++) {
    for (let c = 0; c < s.size; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";

      const ch = s.board[r][c];

      if (ch === "X") cell.classList.add("blocker");
      if (ch === "C") cell.classList.add("capture");
      if (ch === "G") cell.classList.add("goal");

      const isLegal =
        Array.isArray(s.legalMoves) && s.legalMoves.some((m) => m.r === r && m.c === c);
      if (isLegal) cell.classList.add("legal");

      if (ch === "O") {
        const orb = document.createElement("div");
        orb.className = "orb";
        cell.appendChild(orb);
      }

      // Click behavior:
      // - If Editor=on AND ShiftKey => paint
      // - Else => move attempt (only if legal in *current* state)
      cell.addEventListener("click", (e) => {
        const editorEnabled = (!editorToggle) || (editorToggle.value === "on");
        const shiftPaint = !!(e && e.shiftKey && editorEnabled);
        if (shiftPaint) {
          const paint = paintSel ? paintSel.value : ".";
          if (
            (paint === "." || paint === "X" || paint === "O" || paint === "G" || paint === "C") &&
            typeof engine.setCell === "function"
          ) {
            engine.setCell(r, c, paint);
            if (typeof engine.normalizePieces === "function") engine.normalizePieces();
            render();
          }
          return;
        }

        const sNow = engine.getState();
        const ok =
          Array.isArray(sNow.legalMoves) && sNow.legalMoves.some((m) => m.r === r && m.c === c);
        if (!ok) return;

        const res = engine.moveTo(r, c);
        if (res && res.ok) {
          moveCount += 1;
          render();
        }
      });

      boardEl.appendChild(cell);
    }
  }

  const orb = s.orb ? `(${s.orb.r},${s.orb.c})` : "(missing)";
  const legal = Array.isArray(s.legalMoves) ? s.legalMoves.length : 0;

  // info line
  const line = `Level: ${getLevelIndexSafe() + 1}/${getLevelsSafe().length || 1} | Mode: ${s.mode} | Orb: ${orb} | Legal: ${legal} | Moves: ${moveCount}${editorOn() ? " | EDITOR ON (Shift+click paints)" : ""}`;
  if (infoEl) infoEl.textContent = line;

  // HUD pills
  if (hudMode) hudMode.textContent = s.mode || "-";
  if (hudLevel) {
    const levels = getLevelsSafe();
    const idx = getLevelIndexSafe();
    hudLevel.textContent = levels[idx]?.name || `L${idx + 1}`;
  }
  if (hudMoves) hudMoves.textContent = String(moveCount);

  if (s.win) showWinUI();
}

// ---- wiring ----
if (modeSel) {
  setModeFromSelect();
  modeSel.addEventListener("change", () => {
    setModeFromSelect();
    render();
  });
}

syncLevelOptions();
if (levelSel) {
  levelSel.addEventListener("change", () => {
    const idx = Number(levelSel.value || "0");
    applyLevel(Number.isFinite(idx) ? idx : 0);
    render();
  });
}


if (nextBtn) {
  nextBtn.addEventListener("click", () => {
    hideWinUI();
    if (typeof engine.nextLevel === "function") engine.nextLevel();
    moveCount = 0;
    syncLevelOptions();
    render();
  });
}
if (resetBtn) {

  resetBtn.addEventListener("click", () => {

    if (typeof engine.reset === "function") engine.reset();

    moveCount = 0;

    render();

  });

}


if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    if (typeof engine.exportBoardStrings !== "function") return;
    ensureTextAreaVisible();
    levelText.value = engine.exportBoardStrings().join("\n");
  });
}

if (importBtn) {
  importBtn.addEventListener("click", () => {
    if (!levelText || typeof engine.setBoardFromStrings !== "function") return;
    ensureTextAreaVisible();
    const rows = String(levelText.value || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    // accept exactly 7 lines; if more, take first 7
    const rows7 = rows.slice(0, 7);
    if (rows7.length !== 7) return;

    const ok = engine.setBoardFromStrings(rows7);
    if (ok && typeof engine.normalizePieces === "function") engine.normalizePieces();
    moveCount = 0;
    render();
  });
}

if (closeWinBtn) closeWinBtn.addEventListener("click", hideWinUI);
if (nextLevelBtn) {
  nextLevelBtn.addEventListener("click", () => {
    hideWinUI();
    if (typeof engine.nextLevel === "function") engine.nextLevel();
    moveCount = 0;
    syncLevelOptions();
    render();
  });
}
// Initial load
if (typeof engine.reset === "function") engine.reset();
syncLevelOptions();
render();
