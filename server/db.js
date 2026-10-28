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
  // Additive migrations preserve databases created by earlier versions.
  const migrate = (table, name, definition) => {
    if (
      !db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .some((c) => c.name === name)
    )
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  migrate("messages", "sources_json", "TEXT NOT NULL DEFAULT '[]'");
  migrate("memories", "origin", "TEXT NOT NULL DEFAULT 'automatic'");
  migrate(
    "memories",
    "source_message_id",
    "INTEGER REFERENCES messages(id) ON DELETE SET NULL",
  );
  db.exec(`CREATE TABLE IF NOT EXISTS memory_settings(id INTEGER PRIMARY KEY CHECK(id=1),auto_remember INTEGER NOT NULL DEFAULT 1,use_memories INTEGER NOT NULL DEFAULT 1,revision INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO memory_settings(id) VALUES (1);
    CREATE TABLE IF NOT EXISTS memory_conflicts(id TEXT PRIMARY KEY,new_content TEXT NOT NULL,existing_json TEXT NOT NULL,origin TEXT NOT NULL,source_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,source_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,status TEXT NOT NULL DEFAULT 'pending',action TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_at TEXT);
    CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,name TEXT NOT NULL,extension TEXT NOT NULL,size INTEGER NOT NULL,source TEXT NOT NULL UNIQUE,status TEXT NOT NULL,error TEXT,page_count INTEGER NOT NULL DEFAULT 0,chunk_count INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE TABLE IF NOT EXISTS document_pages(document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,page INTEGER NOT NULL,start_offset INTEGER NOT NULL,end_offset INTEGER NOT NULL,PRIMARY KEY(document_id,page));`);
  db.exec(`CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('task_list','study_plan','document')),title TEXT NOT NULL,summary TEXT NOT NULL DEFAULT '',body TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','archived')),source_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,source_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,fingerprint TEXT,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 CREATE TABLE IF NOT EXISTS artifact_tasks(id TEXT PRIMARY KEY,artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,title TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',due_date TEXT,priority TEXT NOT NULL DEFAULT 'normal',status TEXT NOT NULL DEFAULT 'todo',position INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS artifact_tasks_parent ON artifact_tasks(artifact_id,position);
 CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,artifact_id TEXT REFERENCES artifacts(id) ON DELETE SET NULL,artifact_revision INTEGER NOT NULL,payload_json TEXT NOT NULL,destination_hash TEXT NOT NULL,destination_label TEXT NOT NULL,destination_host TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempt_key TEXT NOT NULL UNIQUE,attempts INTEGER NOT NULL DEFAULT 0,error TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),approved_at TEXT,sent_at TEXT);`);
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
    .all(id)
    .map(({ sources_json, ...message }) => ({
      ...message,
      sources: JSON.parse(sources_json || "[]"),
    }));
}
export function addMessage(
  db,
  id,
  role,
  content,
  status = "complete",
  sources = [],
) {
  db.prepare(
    "INSERT INTO messages(conversation_id,role,content,status,sources_json) VALUES (?,?,?,?,?)",
  ).run(id, role, content, status, JSON.stringify(sources));
  db.prepare(
    "UPDATE conversations SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
  ).run(id);
}
