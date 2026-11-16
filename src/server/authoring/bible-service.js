// Werkbank Fase 10 (keuze van Kevin 15-11): de Game Bible als tab in de editor.
// Het bord (kaarten, lijnen, kolommen, tags) staat als één JSON in game_bible (migratie 033).
// De eerste keer leest de server Kevins oude bijbel in (README/GameBibleNode.json) plus de kaarten van het boek
// (README/GameBibleBoek.json): niets van zijn werk gaat verloren. Daarna is de database de enige plek.
import fs from "node:fs";
import path from "node:path";

const BIBLE_ID = "main";
const HISTORY_KEEP = 30;
const HISTORY_GAP_MS = 10 * 60 * 1000;
const MAX_BOARD_BYTES = 900 * 1024;
export const BIBLE_SCHEMA = "gamebible-node-system-v6.23";

function httpError(status, message, code = null) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function readJsonFile(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function emptyBoard() {
  return { schema: BIBLE_SCHEMA, version: 6.23, title: "Game Bible", nodes: [], edges: [], categories: [], tags: [], settings: { theme: "dark" } };
}

// Voegt de kaarten van het boek toe (een eigen kolom, plus lijnen naar bestaande kaarten). Al aanwezig = niets.
export function mergeBookCards(board, book) {
  if (!book || !Array.isArray(book.nodes) || !book.nodes.length) return board;
  const result = Object.assign({}, board);
  const nodeIds = new Set((result.nodes || []).map((node) => node.id));
  const categoryIds = new Set((result.categories || []).map((category) => category.id));
  const tagNames = new Set((result.tags || []).map((tag) => String(tag.name || "").toLowerCase()));
  const newCategories = (book.categories || []).filter((category) => !categoryIds.has(category.id));
  // Het boek komt links naast de bestaande kolommen: het is de bron van het verhaal.
  let dx = 0;
  let dy = 0;
  const placed = (result.categories || []).concat(result.nodes || []);
  if (newCategories.length && placed.length) {
    const minLeft = Math.min(...placed.map((item) => Number(item.x) || 0));
    const columns = (result.categories || []).length ? result.categories : result.nodes;
    const minTop = Math.min(...columns.map((item) => Number(item.y) || 0));
    const bookRight = Math.max(...newCategories.map((category) => (Number(category.x) || 0) + (Number(category.width) || 430)));
    const bookTop = Math.min(...newCategories.map((category) => Number(category.y) || 0));
    dx = minLeft - 80 - bookRight;
    dy = minTop - bookTop;
  }
  const shift = (item) => Object.assign({}, item, { x: (Number(item.x) || 0) + dx, y: (Number(item.y) || 0) + dy });
  result.categories = (result.categories || []).concat(newCategories.map(shift));
  result.nodes = (result.nodes || []).concat(book.nodes.filter((node) => !nodeIds.has(node.id)).map(shift));
  const allIds = new Set(result.nodes.map((node) => node.id));
  const edgeIds = new Set((result.edges || []).map((edge) => edge.id));
  result.edges = (result.edges || []).concat((book.edges || []).filter((edge) => !edgeIds.has(edge.id) && allIds.has(edge.from) && allIds.has(edge.to)));
  result.tags = (result.tags || []).concat((book.tags || []).filter((tag) => !tagNames.has(String(tag.name || "").toLowerCase())));
  return result;
}

export function validateBoard(board) {
  if (!board || typeof board !== "object" || Array.isArray(board)) throw httpError(400, "De bijbel is leeg of kapot.", "BIBLE_INVALID");
  for (const key of ["nodes", "edges", "categories", "tags"]) {
    if (board[key] !== undefined && !Array.isArray(board[key])) throw httpError(400, "De bijbel is kapot (" + key + ").", "BIBLE_INVALID");
  }
  const text = JSON.stringify(board);
  if (Buffer.byteLength(text, "utf8") > MAX_BOARD_BYTES) throw httpError(413, "De bijbel is te groot om op te slaan (meer dan 900 kB).", "BIBLE_TOO_BIG");
  return text;
}

export class BibleService {
  constructor(db, { rootDir = process.cwd() } = {}) {
    this.db = db;
    this.rootDir = rootDir;
  }

  // De oude bijbel van Kevin plus de kaarten van het boek (alleen de allereerste keer).
  importBoard() {
    const old = readJsonFile(path.join(this.rootDir, "README", "GameBibleNode.json"));
    const book = readJsonFile(path.join(this.rootDir, "README", "GameBibleBoek.json"));
    const base = old && typeof old === "object" && Array.isArray(old.nodes) ? old : emptyBoard();
    return { board: mergeBookCards(base, book), source: old ? "README/GameBibleNode.json" : "leeg" };
  }

  read() {
    let row = this.db.prepare("SELECT board_json, revision, updated_at, updated_by FROM game_bible WHERE id = ?").get(BIBLE_ID);
    let imported = null;
    if (!row) {
      const { board, source } = this.importBoard();
      const text = validateBoard(board);
      const stamp = new Date().toISOString();
      this.db.prepare("INSERT OR IGNORE INTO game_bible (id, board_json, revision, updated_at, updated_by) VALUES (?, ?, 1, ?, ?)").run(BIBLE_ID, text, stamp, "import");
      row = this.db.prepare("SELECT board_json, revision, updated_at, updated_by FROM game_bible WHERE id = ?").get(BIBLE_ID);
      imported = source;
    }
    let board = null;
    try { board = JSON.parse(row.board_json); } catch { board = emptyBoard(); }
    return { board, revision: Number(row.revision) || 1, updatedAt: row.updated_at, updatedBy: row.updated_by || null, imported };
  }

  revision() {
    const row = this.db.prepare("SELECT revision FROM game_bible WHERE id = ?").get(BIBLE_ID);
    return row ? Number(row.revision) || 1 : null;
  }

  // Opslaan met de revision die je had: is iemand je voor geweest, dan een melding (geen werk kwijt).
  save(board, revision, user = null) {
    const text = validateBoard(board);
    const current = this.read();
    if (Number(revision) !== current.revision) {
      throw httpError(409, "De bijbel is ondertussen ergens anders opgeslagen (bijv. in een ander tabblad).", "BIBLE_CONFLICT");
    }
    const stamp = new Date().toISOString();
    const by = user?.username || null;
    // De bijbel slaat na elke wijziging op. De geschiedenis bewaart hoogstens één oude versie per 10 minuten (30 stuks).
    const previous = this.db.prepare("SELECT board_json, revision FROM game_bible WHERE id = ?").get(BIBLE_ID);
    const last = this.db.prepare("SELECT saved_at FROM game_bible_history ORDER BY id DESC LIMIT 1").get();
    const lastMs = last ? Date.parse(last.saved_at) : NaN;
    if (previous && (!Number.isFinite(lastMs) || Date.parse(stamp) - lastMs >= HISTORY_GAP_MS)) {
      this.db.prepare("INSERT INTO game_bible_history (revision, board_json, saved_at, saved_by) VALUES (?, ?, ?, ?)").run(previous.revision, previous.board_json, stamp, by);
    }
    const next = current.revision + 1;
    this.db.prepare("UPDATE game_bible SET board_json = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = ?").run(text, next, stamp, by, BIBLE_ID);
    this.db.prepare("DELETE FROM game_bible_history WHERE id NOT IN (SELECT id FROM game_bible_history ORDER BY id DESC LIMIT ?)").run(HISTORY_KEEP);
    return { revision: next, updatedAt: stamp };
  }
}
