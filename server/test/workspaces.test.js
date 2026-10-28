import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDB } from "../db.js";
import { createApp } from "../index.js";
import { createTools } from "../tools/index.js";
const work = "00000000-0000-4000-8000-000000000002",
  study = "00000000-0000-4000-8000-000000000003";
function setup() {
  const root = mkdtempSync(join(tmpdir(), "al-space-test-")),
    db = openDB(join(root, "al.sqlite"));
  writeFileSync(join(root, "personal.txt"), "PRIVATE_PERSONAL_DOCUMENT");
  let captured;
  const app = createApp({
    db,
    knowledgeRoot: root,
    documentsRoot: join(root, ".originals"),
    extract: async () => [],
    compareMemory: async () => ({ checked: true, conflictsWith: [] }),
    generate: async (args) => {
      captured = args;
      args.onText("Đã hiểu");
    },
  });
  return {
    root,
    db,
    app,
    get captured() {
      return captured;
    },
    async close() {
      await app.locals.close();
      db.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
test("workspaces: isolate conversations, search, memories, learned knowledge and model context", async () => {
  const s = setup();
  try {
    const list = (await request(s.app).get("/api/workspaces")).body;
    assert.equal(list.length, 3);
    const personal = (
      await request(s.app)
        .post("/api/conversations")
        .send({ title: "PRIVATE_CONVERSATION" })
    ).body;
    await request(s.app)
      .post("/api/memories")
      .send({ content: "PRIVATE_PERSONAL_MEMORY" });
    await request(s.app)
      .patch("/api/workspaces/" + work)
      .send({ persona: "WORK_PERSONA_ONLY" });
    assert.equal(
      (
        await request(s.app)
          .get("/api/conversations")
          .set("X-Workspace-Id", work)
      ).body.length,
      0,
    );
    assert.equal(
      (
        await request(s.app)
          .get("/api/conversations/" + personal.id)
          .set("X-Workspace-Id", work)
      ).status,
      404,
    );
    assert.equal(
      (
        await request(s.app)
          .get("/api/conversations?q=PRIVATE")
          .set("X-Workspace-Id", study)
      ).body.length,
      0,
    );
    assert.equal(
      (await request(s.app).get("/api/memories").set("X-Workspace-Id", work))
        .body.length,
      0,
    );
    await request(s.app)
      .post("/api/chat")
      .set("X-Workspace-Id", work)
      .send({ message: "PRIVATE_PERSONAL_DOCUMENT" });
    assert.match(s.captured.system, /WORK_PERSONA_ONLY/);
    assert.doesNotMatch(
      s.captured.system,
      /PRIVATE_PERSONAL_MEMORY|<knowledge/,
    );
    assert.equal(
      (await request(s.app).get("/api/knowledge")).body.files.length,
      1,
    );
    assert.equal(
      (await request(s.app).get("/api/knowledge").set("X-Workspace-Id", work))
        .body.files.length,
      0,
    );
    const proposal = await s.captured.tools.execute({
      id: "p",
      name: "propose_knowledge",
      input: {
        title: "Work only",
        content: "WORK_KNOWLEDGE_ONLY",
        reason: "Work reference",
      },
    });
    const pending = JSON.parse(proposal.content);
    await request(s.app)
      .post("/api/learned/" + pending.id + "/approve")
      .set("X-Workspace-Id", work)
      .send({});
    assert.equal((await request(s.app).get("/api/learned")).body.length, 0);
    assert.equal(
      (await request(s.app).get("/api/knowledge")).body.files.length,
      1,
    );
    assert.equal(
      (await request(s.app).get("/api/knowledge").set("X-Workspace-Id", work))
        .body.files.length,
      1,
    );
    const hiddenRead = await createTools({ root: s.root, db: s.db }).execute({
      id: "hidden",
      name: "read_file",
      input: {
        path:
          ".workspaces/" + work + "/knowledge/learned/" + pending.id + ".md",
      },
    });
    assert.equal(hiddenRead.is_error, true);
  } finally {
    await s.close();
  }
});
test("workspaces: document originals, source viewers and download selectors cannot cross scopes", async () => {
  const s = setup();
  try {
    const result = await request(s.app)
      .post("/api/documents")
      .set("X-Workspace-Id", work)
      .attach("file", Buffer.from("WORK_UPLOAD_ONLY"), "work.txt");
    assert.equal(result.status, 202);
    await new Promise((r) => setTimeout(r, 30));
    const doc = result.body;
    assert.equal((await request(s.app).get("/api/documents")).body.length, 0);
    assert.equal(
      (await request(s.app).get("/api/documents/" + doc.id + "/file")).status,
      404,
    );
    assert.equal(
      (
        await request(s.app).get(
          "/api/documents/" + doc.id + "/file?workspace=" + work,
        )
      ).status,
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
      (
        await request(s.app)
          .get("/api/knowledge/source")
          .query({ path: doc.source, chunk: 1 })
          .set("X-Workspace-Id", work)
      ).status,
      200,
    );
    assert.equal(
      (
        await request(s.app)
          .get("/api/documents?workspace=" + work)
          .set("X-Workspace-Id", study)
      ).status,
      400,
    );
    assert.equal(
      (
        await request(s.app)
          .get("/api/documents")
          .set("X-Workspace-Id", "../../etc")
      ).status,
      400,
    );
  } finally {
    await s.close();
  }
});
test("workspaces: create, rename, archive and restore retain data and persist across restart", async () => {
  const s = setup();
  try {
    const made = (
      await request(s.app)
        .post("/api/workspaces")
        .send({ name: "Nghiên cứu", description: "Dự án riêng" })
    ).body;
    const id = made.id;
    assert.ok(id);
    await request(s.app)
      .post("/api/conversations")
      .set("X-Workspace-Id", id)
      .send({ title: "Retained" });
    assert.equal(
      (
        await request(s.app)
          .post("/api/workspaces/" + id + "/archive")
          .send({})
      ).status,
      200,
    );
    assert.equal(
      (await request(s.app).get("/api/conversations").set("X-Workspace-Id", id))
        .status,
      404,
    );
    assert.equal(
      (
        await request(s.app)
          .post("/api/workspaces/" + id + "/restore")
          .send({})
      ).status,
      200,
    );
    assert.equal(
      (await request(s.app).get("/api/conversations").set("X-Workspace-Id", id))
        .body[0].title,
      "Retained",
    );
    assert.equal(
      (await request(s.app).post("/api/workspaces/personal/archive").send({}))
        .status,
      409,
    );
    assert.equal(
      (
        await request(s.app)
          .post("/api/workspaces")
          .send({ name: "x", unknown: true })
      ).status,
      400,
    );
    await s.app.locals.close();
    const next = createApp({
      db: s.db,
      knowledgeRoot: s.root,
      documentsRoot: join(s.root, ".originals"),
    });
    try {
      assert.equal(
        (
          await request(next)
            .get("/api/conversations")
            .set("X-Workspace-Id", id)
        ).body[0].title,
        "Retained",
      );
    } finally {
      await next.locals.close();
    }
  } finally {
    await s.close();
  }
});
