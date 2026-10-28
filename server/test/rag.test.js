import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";
import { createRag, chunks, safeKnowledgePath } from "../rag.js";
import { createApp } from "../index.js";
import { openDB } from "../db.js";
test("step 5: BM25 retrieves Vietnamese, refreshes files, bounds chunks and rejects traversal", async () => {
  const root = mkdtempSync(join(tmpdir(), "al-rag-"));
  const db = openDB(":memory:");
  try {
    writeFileSync(
      join(root, "garden.md"),
      "Cây cà phê cần tưới nước vào buổi sáng.",
    );
    writeFileSync(join(root, "other.txt"), "Tài liệu về xe đạp.");
    writeFileSync(join(root, "ignored.js"), "Cà phê");
    const rag = createRag(root);
    assert.equal(rag.search("ca phe")[0].source, "garden.md");
    assert.equal(rag.search("zzzz").length, 0);
    assert.ok(chunks("a".repeat(1900)).every((c) => c.length <= 500));
    assert.throws(() => safeKnowledgePath(root, "../secret.txt"));
    symlinkSync("/etc/passwd", join(root, "secret.txt"));
    assert.throws(() => safeKnowledgePath(root, "secret.txt"));
    writeFileSync(join(root, "new.md"), "Thiên văn học sao Hoả");
    assert.equal(rag.search("Thiên văn")[0].source, "new.md");
    let prompt;
    const app = createApp({
      db,
      knowledgeRoot: root,
      extract: async () => [],
      generate: async ({ system, onText }) => {
        prompt = system;
        onText("ok");
      },
    });
    const res = await request(app)
      .post("/api/chat")
      .send({ message: "Cây cà phê" });
    assert.match(prompt, /garden.md/);
    assert.match(res.text, /event: sources/);
    assert.equal(
      (await request(app).get("/api/knowledge")).body.files.length,
      3,
    );
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
