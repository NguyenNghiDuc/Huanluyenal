import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "../index.js";
import { openDB } from "../db.js";
test("step 3: persona file is loaded on every turn", async () => {
  const dir = mkdtempSync(join(tmpdir(), "al-persona-"));
  const file = join(dir, "persona.md");
  const db = openDB(":memory:");
  let prompt;
  const app = createApp({
    db,
    extract: async () => [],
    personaPath: file,
    generate: async ({ system, onText }) => {
      prompt = system;
      onText("ok");
    },
  });
  try {
    writeFileSync(file, "Tên al, tiếng Việt");
    await request(app).post("/api/chat").send({ message: "hi" });
    assert.ok(prompt.startsWith("Tên al, tiếng Việt"));
    writeFileSync(file, "Giọng điệu mới");
    await request(app).post("/api/chat").send({ message: "hi" });
    assert.ok(prompt.startsWith("Giọng điệu mới"));
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
