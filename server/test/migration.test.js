import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { openDB, history } from "../db.js";
import { listMemories, settings } from "../memory.js";
test("migration: databases from the previous release keep conversations, messages and memories", () => {
  const dir = mkdtempSync(join(tmpdir(), "al-migrate-"));
  let db;
  try {
    const path = join(dir, "old.sqlite");
    db = new Database(path);
    db.exec(`CREATE TABLE conversations(id TEXT PRIMARY KEY,title TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT,conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,role TEXT NOT NULL,content TEXT NOT NULL,status TEXT DEFAULT 'complete',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE memories(id TEXT PRIMARY KEY,content TEXT NOT NULL UNIQUE,source_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
    const conversationId = randomUUID();
    db.prepare("INSERT INTO conversations(id,title) VALUES (?,?)").run(
      conversationId,
      "Lịch sử cũ",
    );
    db.prepare(
      "INSERT INTO messages(conversation_id,role,content) VALUES (?,'user','Nội dung cũ')",
    ).run(conversationId);
    db.prepare(
      "INSERT INTO memories(id,content,source_conversation_id) VALUES (?,?,?)",
    ).run(randomUUID(), "Sự thật đã lưu", conversationId);
    db.close();
    db = openDB(path);
    assert.equal(history(db, conversationId)[0].content, "Nội dung cũ");
    assert.deepEqual(history(db, conversationId)[0].sources, []);
    assert.equal(listMemories(db)[0].content, "Sự thật đã lưu");
    assert.equal(listMemories(db)[0].origin, "automatic");
    assert.equal(settings(db).autoRemember, true);
    db.close();
    db = openDB(path);
    assert.equal(listMemories(db).length, 1);
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
