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
const hintBtn = $("hintBtn");
const hintBox = $("hintBox");
const hintText = $("hintText");
const saveBtn = $("saveBtn");
const loadBtn = $("loadBtn");
const levelText = $("levelText");
const metaPanel = $("metaPanel");
const metaName = $("metaName");
const metaAuthor = $("metaAuthor");
const metaDifficulty = $("metaDifficulty");
const metaHint = $("metaHint");

/**
 * DEV_MODE
 * - default (no query): player mode (hide editor tools)
 * - ?dev=1 : show editor tools + allow Shift+Click painting when Editor=on
 */
const DEV_MODE = new URLSearchParams(window.location.search).has("dev");

function setDevToolsVisible(show) {
  // hide/show the *label wrappers* when possible, otherwise the element
  const ids = ["editorToggle", "paintSel", "metaPanel", "exportBtn", "importBtn", "levelText"];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const wrap = el.closest("label") || el;
    wrap.style.display = show ? "" : "none";
  }
}


// HUD pills (new HTML)
const hudMode = $("hudMode");
const hudLevel = $("hudLevel");
const hudMoves = $("hudMoves");
const hudAuthor = $("hudAuthor");
const hudDiff = $("hudDiff");

// Win UI (new HTML)
const winOverlay = $("winOverlay");
const winMoves = $("winMoves");
const nextLevelBtn = $("nextLevelBtn");
const closeWinBtn = $("closeWinBtn");

// Win banner (older HTML)
const winBanner = $("winBanner");

// ---- state ----
let moveCount = 0;
let lastEvent = "";


const STORAGE_KEY = "seven-voices-orb.save.v1";

function getBoardStringsSafe() {
  if (typeof engine.exportBoardStrings === "function") return engine.exportBoardStrings();
  const s = engine.getState ? engine.getState() : null;
  if (!s || !Array.isArray(s.board)) return null;
  return s.board.slice();
}

function saveSnapshot(reason) {
  const s = engine.getState ? engine.getState() : null;
  const boardStrings = getBoardStringsSafe();
  if (!s || !boardStrings || boardStrings.length !== 7) return false;

  const payload = {
    v: 1,
    ts: Date.now(),
    levelIndex: Number.isFinite(s.levelIndex) ? s.levelIndex : 0,
    mode: s.mode === "glide" ? "glide" : "step",
    board: boardStrings,
    editor: editorToggle ? editorToggle.value : "off",
    paint: paintSel ? paintSel.value : ".",
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    if (reason && typeof lastEvent === "string") lastEvent = String(reason);
    return true;
  } catch (e) {
    console.warn("[saveSnapshot] failed:", e);
    return false;
  }
}

function loadSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ok: false, reason: "no_saved_state" };
    const data = JSON.parse(raw);

    if (!data || data.v !== 1) return { ok: false, reason: "bad_version" };
    if (!Array.isArray(data.board) || data.board.length !== 7) return { ok: false, reason: "bad_board" };

    if (typeof engine.setLevel === "function" && Number.isFinite(data.levelIndex)) {
      engine.setLevel(data.levelIndex);
      if (levelSel) levelSel.value = String(data.levelIndex);
    }

    if (typeof engine.setMode === "function") {
      engine.setMode(data.mode === "glide" ? "glide" : "step");
      if (modeSel) modeSel.value = data.mode === "glide" ? "glide" : "step";
    }

    if (editorToggle) editorToggle.value = (data.editor === "on") ? "on" : "off";
    if (paintSel) paintSel.value = typeof data.paint === "string" ? data.paint : ".";

    if (typeof engine.setBoardFromStrings !== "function") return { ok: false, reason: "no_import_api" };
    const ok = engine.setBoardFromStrings(data.board);
    if (!ok) return { ok: false, reason: "engine_rejected_board" };

    if (typeof engine.normalizePieces === "function") engine.normalizePieces();

    if (typeof moveCount === "number") moveCount = 0;
    if (typeof lastEvent === "string") lastEvent = "Loaded saved state";
    return { ok: true };
  } catch (e) {
    console.warn("[loadSnapshot] failed:", e);
    return { ok: false, reason: "exception" };
  }
}


function fmtDir(d) {
  if (!d || !Number.isFinite(d.dr) || !Number.isFinite(d.dc)) return "-";
  return "(" + d.dr + "," + d.dc + ")";
}
function fmtPos(p) {
  if (!p || !Number.isFinite(p.r) || !Number.isFinite(p.c)) return "-";
  return "(" + p.r + "," + p.c + ")";
}

// ---- helpers ----
function getLevelsSafe() {
  const lv = engine && engine.levels;
  return Array.isArray(lv) ? lv : [];
}



function getLevelIndexSafe() {
  return (engine && Number.isFinite(engine.levelIndex)) ? engine.levelIndex : 0;
}

function getLevelObjSafe() {
  const levels = getLevelsSafe();
  const idx = getLevelIndexSafe();
  return (levels && levels[idx]) ? levels[idx] : null;
}


// --- v1.4-B: meta ⇄ level wiring ---
function getLevelObjSafe() {
  try {
    const lvls = getLevelsSafe();
    const idx = getLevelIndexSafe();
    if (!Array.isArray(lvls)) return null;
    return (lvls[idx] || lvls[0]) || null;
  } catch {
    return null;
  }
}

function syncMetaUIFromLevel() {
  if (!DEV_MODE) return;
  const lvl = getLevelObjSafe();
  if (!lvl) return;

  if (metaPanel && metaPanel.style && metaPanel.style.display === "none") return;

  if (metaName) metaName.value = String(lvl.name || "");
  if (metaAuthor) metaAuthor.value = String(lvl.author || "");
  if (metaDifficulty) metaDifficulty.value = String(lvl.difficulty || "Easy");
  if (metaHint) metaHint.value = String(lvl.hint || "");
}

function applyMetaUIToLevel() {
  if (!DEV_MODE) return false;
  if (!editorOn()) return false;

  const lvl = getLevelObjSafe();
  if (!lvl) return false;

  if (metaName) lvl.name = String(metaName.value || "").trim();
  if (metaAuthor) lvl.author = String(metaAuthor.value || "").trim();
  if (metaDifficulty) lvl.difficulty = String(metaDifficulty.value || "Easy").trim();
  if (metaHint) lvl.hint = String(metaHint.value || "").trim();

  return true;
}
// --- end v1.4-B ---

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
    syncLevelOptions();
    syncMetaInputsFromLevel();
    return true;
  }

  return false;
}

function syncMetaInputsFromLevel() {
  const lvl = getLevelObjSafe();
  if (!lvl) return;

  if (metaName) metaName.value = lvl.name || "";
  if (metaAuthor) metaAuthor.value = lvl.author || "";
  if (metaDifficulty) metaDifficulty.value = (OK_DIFF.has(lvl.difficulty) ? lvl.difficulty : "Easy");
  if (metaHint) metaHint.value = lvl.hint || "";
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
  return !!(DEV_MODE && editorToggle && editorToggle.value === "on");
}

const OK_DIFF = new Set(["Easy", "Medium", "Hard"]);

function commitMetaFromInputs() {
  if (!editorOn()) return;
  const lvl = getLevelObjSafe();
  if (!lvl) return;

  if (metaName) lvl.name = String(metaName.value || "").trim();
  if (metaAuthor) lvl.author = String(metaAuthor.value || "").trim();

  if (metaDifficulty) {
    const d = String(metaDifficulty.value || "Easy");
    lvl.difficulty = OK_DIFF.has(d) ? d : "Easy";
  }

  if (metaHint) lvl.hint = String(metaHint.value || "").trim();

  render();
  saveSnapshot("Autosaved (meta)");
}

function ensureTextAreaVisible() {
  if (!levelText) return;
  levelText.style.display = "block";
}

// ---- Tile descriptions (UI only) ----
const TILE_INFO = {
  "O": "Orb (you)",
  ".": "Empty",
  "X": "Blocker (cannot pass)",
  "C": "Capture target (must clear)",
  "G": "Goal (win after all captures)",
  "B": "Bumper (forces reverse direction)",
  "H": "Hole (returns to last safe tile)"
};

// ---- render ----
function render() {
  const s = engine.getState ? engine.getState() : null;
  if (!s) return;

  hideWinUI();

  // level meta / hint
  if (hintText) hintText.textContent = (s.levelHint || "—");
  if (hintBtn) hintBtn.disabled = !(s.levelHint && String(s.levelHint).trim().length);

  // keep modeSel synced (if engine changes it)
  if (modeSel && s.mode && modeSel.value !== s.mode) modeSel.value = s.mode;

  boardEl.innerHTML = "";

  for (let r = 0; r < s.size; r++) {
    for (let c = 0; c < s.size; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";

      const ch = s.board[r][c];

      if (TILE_INFO[ch]) cell.title = TILE_INFO[ch];

      if (ch === "X") cell.classList.add("blocker");
      if (ch === "C") cell.classList.add("capture");
      if (ch === "G") cell.classList.add("goal");
      if (ch === "B") cell.classList.add("bumper");
      if (ch === "H") cell.classList.add("hole");

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
          const okPaint = new Set([".", "X", "O", "G", "C", "B", "H"]);
          if (okPaint.has(paint) && typeof engine.setCell === "function") {
            engine.setCell(r, c, paint);
            if (typeof engine.normalizePieces === "function") engine.normalizePieces();
            render();
            saveSnapshot("Autosaved (paint)");
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

          // explain what just happened (Hole / Bumper / Win / normal)
          if (res.fell) {
            lastEvent = "Fell into Hole (H) → returned to last safe tile";
          } else {
            const sAfter = engine.getState ? engine.getState() : null;
            if (sAfter && sAfter.orbOnBumper) lastEvent = "Hit Bumper (B) → next move is forced reverse";
            else if (sAfter && sAfter.win) lastEvent = "WIN";
            else lastEvent = "Moved";
          }

          saveSnapshot("Autosaved (move)");
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
  if (hudAuthor) hudAuthor.textContent = s.levelAuthor || "-";
  if (hudDiff) hudDiff.textContent = s.levelDifficulty || "-";
  if (hudMoves) hudMoves.textContent = String(moveCount);

  if (s.win) showWinUI();
}

// ---- wiring ----
if (modeSel) {
  setModeFromSelect();
  modeSel.addEventListener("change", () => {
    setModeFromSelect();
    render();
    saveSnapshot("Autosaved (mode change)");
  });
}

syncLevelOptions();
if (levelSel) {
  levelSel.addEventListener("change", () => {
    const idx = Number(levelSel.value || "0");
    applyLevel(Number.isFinite(idx) ? idx : 0);
    if (hintBox) hintBox.style.display = "none";
    render();
    saveSnapshot("Autosaved (level change)");
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
if (editorToggle) {
  editorToggle.addEventListener("change", () => {
    // only meaningful in DEV_MODE (in player mode the toggle is hidden)
    setDevToolsVisible(DEV_MODE);
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


if (saveBtn) {
  saveBtn.addEventListener("click", () => {
    const ok = saveSnapshot("Saved");
    if (!ok && typeof lastEvent === "string") lastEvent = "Save failed";
    render();
  });
}

if (loadBtn) {
  loadBtn.addEventListener("click", () => {
    const res = loadSnapshot();
    if (!res.ok && typeof lastEvent === "string") lastEvent = "Load failed: " + res.reason;
    render();
  });
}

if (hintBtn) {
  hintBtn.addEventListener("click", () => {
    if (!hintBox) return;
    if (hintBtn.disabled) return;
    const isOpen = hintBox.style.display === "block";
    hintBox.style.display = isOpen ? "none" : "block";
  });
}


// --- v1.4-B: meta editor listeners ---
function wireMetaEditor() {
  if (!DEV_MODE) return;

  syncMetaUIFromLevel();

  const onMetaChange = () => {
    const ok = applyMetaUIToLevel();
    if (!ok) return;
    render();
    saveSnapshot("Autosaved (meta edit)");
  };

  if (metaName) metaName.addEventListener("input", onMetaChange);
  if (metaAuthor) metaAuthor.addEventListener("input", onMetaChange);
  if (metaDifficulty) metaDifficulty.addEventListener("change", onMetaChange);
  if (metaHint) metaHint.addEventListener("input", onMetaChange);
}

wireMetaEditor();
// --- end v1.4-B ---

// Meta inputs → level model
[metaName, metaAuthor, metaDifficulty, metaHint].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", commitMetaFromInputs);
  el.addEventListener("change", commitMetaFromInputs);
});

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
