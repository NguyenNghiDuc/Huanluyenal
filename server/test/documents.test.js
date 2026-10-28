import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtempSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { createApp } from "../index.js";
import { openDB, history } from "../db.js";
import { makePdf } from "../../e2e/fixtures/pdf.js";
function setup() {
  const root = mkdtempSync(join(tmpdir(), "al-docs-"));
  const db = openDB(":memory:");
  const app = createApp({
    db,
    knowledgeRoot: root,
    documentsRoot: join(root, ".originals"),
    generate: async ({ onText }) => onText("Nguồn đã đọc"),
    extract: async () => [],
  });
  return {
    root,
    db,
    app,
    async close() {
      await app.locals.documents.close();
      db.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
async function settled(db, id) {
  for (let i = 0; i < 200; i++) {
    const d = db.prepare("SELECT * FROM documents WHERE id=?").get(id);
    if (["ready", "error"].includes(d.status)) return d;
    await delay(50);
  }
  throw new Error("Document processing timed out");
}
test("documents: UTF-8 upload, RAG and citations persist; source viewer and deletion", async () => {
  const s = setup();
  try {
    const uploaded = await request(s.app)
      .post("/api/documents")
      .attach(
        "file",
        Buffer.from("Cà phê cần tưới nước hợp lý.\n".repeat(30)),
        { filename: "garden.md", contentType: "text/markdown" },
      );
    assert.equal(uploaded.status, 202, JSON.stringify(uploaded.body));
    const doc = await settled(s.db, uploaded.body.id);
    assert.equal(doc.status, "ready", doc.error);
    assert.ok(doc.chunk_count > 1);
    const reply = await request(s.app)
      .post("/api/chat")
      .send({ message: "Cà phê tưới nước" });
    const id = JSON.parse(
      reply.text.match(/event: meta\ndata: (.*)/)[1],
    ).conversationId;
    assert.equal(history(s.db, id)[1].sources[0].documentId, doc.id);
    assert.match(reply.text, /garden.md/);
    const source = await request(s.app)
      .get("/api/knowledge/source")
      .query({ path: doc.source, chunk: 1 });
    assert.equal(source.status, 200);
    assert.match(source.body.content, /Cà phê/);
    assert.equal(source.body.name, "garden.md");
    const original = await request(s.app).get(
      "/api/documents/" + doc.id + "/file",
    );
    assert.equal(original.status, 200);
    assert.match(original.headers["content-disposition"], /attachment/);
    assert.equal(
      (await request(s.app).delete("/api/documents/" + doc.id)).status,
      200,
    );
    assert.equal(
      (
        await request(s.app)
          .get("/api/knowledge/source")
          .query({ path: doc.source, chunk: 1 })
      ).status,
      404,
    );
    assert.equal(
      (await request(s.app).get("/api/knowledge")).body.files.length,
      0,
    );
  } finally {
    await s.close();
  }
});
test("documents: real two-page PDF extraction, page provenance and source selection", async () => {
  const s = setup();
  try {
    const result = await request(s.app)
      .post("/api/documents")
      .attach(
        "file",
        makePdf([
          "Atlas first page " + "planning ".repeat(65),
          "Orion second page project status",
        ]),
        { filename: "atlas.pdf", contentType: "application/pdf" },
      );
    assert.equal(result.status, 202, JSON.stringify(result.body));
    const doc = await settled(s.db, result.body.id);
    assert.equal(doc.status, "ready", doc.error);
    assert.equal(doc.page_count, 2);
    const rows = s.db
      .prepare("SELECT * FROM document_pages WHERE document_id=? ORDER BY page")
      .all(doc.id);
    assert.equal(rows.length, 2);
    assert.ok(rows[1].start_offset > 0);
    let found = false;
    for (let chunk = 1; chunk <= doc.chunk_count; chunk++) {
      const res = await request(s.app)
        .get("/api/knowledge/source")
        .query({ path: doc.source, chunk });
      if (res.body.content.includes("Orion")) {
        assert.equal(res.body.page, 2);
        found = true;
      }
    }
    assert.ok(found);
  } finally {
    await s.close();
  }
});
test("documents: rejects bad type, oversize, traversal; reports broken/scanned/binary files", async () => {
  const s = setup();
  try {
    assert.equal(
      (
        await request(s.app)
          .post("/api/documents")
          .attach("file", Buffer.from("x"), "malware.exe")
      ).status,
      400,
    );
    assert.equal(
      (
        await request(s.app)
          .post("/api/documents")
          .attach("file", Buffer.from("no PDF"), "fake.pdf")
      ).status,
      400,
    );
    assert.equal(
      (
        await request(s.app)
          .post("/api/documents")
          .attach("file", Buffer.alloc(10 * 1024 * 1024 + 1), "large.txt")
      ).status,
      413,
    );
    assert.equal(
      (
        await request(s.app)
          .post("/api/documents")
          .field("extra", "x")
          .attach("file", Buffer.from("hi"), "test.txt")
      ).status,
      400,
    );
    assert.equal(
      (
        await request(s.app)
          .get("/api/knowledge/source")
          .query({ path: "../private.txt", chunk: 1 })
      ).status,
      404,
    );
    for (const [name, buffer] of [
      ["binary.txt", Buffer.from([255, 0, 1])],
      ["blank.pdf", makePdf([""])],
      ["broken.pdf", Buffer.from("%PDF-1.4\nBroken")],
    ]) {
      const result = await request(s.app)
        .post("/api/documents")
        .attach("file", buffer, name);
      assert.equal(result.status, 202);
      const doc = await settled(s.db, result.body.id);
      assert.equal(doc.status, "error");
      assert.ok(doc.error);
      assert.equal(
        (await request(s.app).get("/api/documents")).body.find(
          (d) => d.id === doc.id,
        ).status,
        "error",
      );
    }
  } finally {
    await s.close();
  }
});
test("documents: retries retain originals, interrupted jobs recover, and oversized page counts fail safely", async () => {
  const s = setup();
  try {
    const broken = await request(s.app)
      .post("/api/documents")
      .attach("file", Buffer.from("%PDF-1.4\nBroken"), "repair.pdf");
    assert.equal((await settled(s.db, broken.body.id)).status, "error");
    writeFileSync(
      s.app.locals.documents.original(broken.body),
      makePdf(["Repaired PDF content"]),
    );
    assert.equal(
      (
        await request(s.app)
          .post("/api/documents/" + broken.body.id + "/retry")
          .send({})
      ).status,
      202,
    );
    assert.equal((await settled(s.db, broken.body.id)).status, "ready");
    const large = await request(s.app)
      .post("/api/documents")
      .attach(
        "file",
        makePdf(Array.from({ length: 201 }, () => "")),
        "many-pages.pdf",
      );
    const doc = await settled(s.db, large.body.id);
    assert.equal(doc.status, "error");
    assert.match(doc.error, /200 trang/);
  } finally {
    await s.close();
  }
});
test("documents: persisted source hashes prevent displaying a modified passage as the old citation", async () => {
  const s = setup();
  try {
    writeFileSync(join(s.root, "notes.txt"), "Original source text");
    let response = await request(s.app)
      .get("/api/knowledge/source")
      .query({ path: "notes.txt", chunk: 1 });
    assert.equal(response.status, 200);
    const hash = response.body.hash;
    writeFileSync(
      join(s.root, "notes.txt"),
      "Updated source text which differs",
    );
    response = await request(s.app)
      .get("/api/knowledge/source")
      .query({ path: "notes.txt", chunk: 1, hash });
    assert.equal(response.status, 409);
    assert.match(response.body.error, /thay đổi/);
  } finally {
    await s.close();
  }
});
test("documents: an interrupted index is removed from RAG and can be retried from its original", async () => {
  const s = setup();
  let second;
  try {
    const uploaded = await request(s.app)
      .post("/api/documents")
      .attach(
        "file",
        Buffer.from("Recoverable document source"),
        "restart.txt",
      );
    const doc = await settled(s.db, uploaded.body.id);
    assert.equal(doc.status, "ready");
    await s.app.locals.documents.close();
    s.db
      .prepare("UPDATE documents SET status='indexing' WHERE id=?")
      .run(doc.id);
    second = createApp({
      db: s.db,
      knowledgeRoot: s.root,
      documentsRoot: join(s.root, ".originals"),
    });
    assert.equal(
      (await request(second).get("/api/knowledge")).body.files.length,
      0,
    );
    assert.equal(
      (await request(second).get("/api/documents")).body[0].status,
      "error",
    );
    await request(second)
      .post("/api/documents/" + doc.id + "/retry")
      .send({});
    assert.equal((await settled(s.db, doc.id)).status, "ready");
  } finally {
    await second?.locals.documents.close();
    await s.close();
  }
});
