import Database from "better-sqlite3";
import { foldText } from "./search.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
export function openDB(
  path = process.env.DB_PATH ||
    fileURLToPath(new URL("../data/al.sqlite", import.meta.url)),
) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.function("fold_text", { deterministic: true }, foldText);
  db.exec(`CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,title TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN ('user','assistant')),content TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'complete',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS memories(id TEXT PRIMARY KEY,content TEXT NOT NULL UNIQUE,source_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 CREATE TABLE IF NOT EXISTS learned_pending(id TEXT PRIMARY KEY,title TEXT NOT NULL,content TEXT NOT NULL,reason TEXT NOT NULL,content_hash TEXT NOT NULL UNIQUE,source_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),approved_path TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),reviewed_at TEXT);
 CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id,id);`);
  return db;
}
export function createConversation(db, title = "Cuộc trò chuyện mới") {
  const id = randomUUID();
  db.prepare("INSERT INTO conversations(id,title) VALUES (?,?)").run(id, title);
  return db.prepare("SELECT * FROM conversations WHERE id=?").get(id);
}
export function history(db, id) {
  return db
    .prepare("SELECT * FROM messages WHERE conversation_id=? ORDER BY id")
    .all(id);
}
export function addMessage(db, id, role, content, status = "complete") {
  db.prepare(
    "INSERT INTO messages(conversation_id,role,content,status) VALUES (?,?,?,?)",
  ).run(id, role, content, status);
  db.prepare(
    "UPDATE conversations SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
  ).run(id);
}
