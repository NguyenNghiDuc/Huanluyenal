import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  existsSync,
  symlinkSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";
import { createApp } from "../index.js";
import { openDB, createConversation } from "../db.js";
import { createTools } from "../tools/index.js";
import { createRag } from "../rag.js";
test("step 7: tool only proposes; approval writes edited content; rejection never writes", async () => {
  const root = mkdtempSync(join(tmpdir(), "al-learn-"));
  const db = openDB(":memory:");
  try {
    const conversation = createConversation(db);
    const tools = createTools({ db, root, conversationId: conversation.id });
    const make = async (content) =>
      JSON.parse(
        (
          await tools.execute({
            id: "tool",
            name: "propose_knowledge",
            input: {
              title: "Cây cà phê",
              content,
              reason: "Kiến thức làm vườn",
            },
          })
        ).content,
      );
    const proposal = await make("Cà phê cần chăm sóc.");
    assert.equal(proposal.status, "pending");
    assert.equal(existsSync(join(root, "learned")), false);
    assert.equal((await make("Cà phê cần chăm sóc.")).id, proposal.id);
    const app = createApp({ db, knowledgeRoot: root });
    const response = await request(app)
      .post("/api/learned/" + proposal.id + "/approve")
      .send({ title: "Chăm cây", content: "Cà phê cần tưới nước hợp lý." });
    assert.equal(response.status, 200);
    assert.match(
      readFileSync(join(root, response.body.path), "utf8"),
      /tưới nước hợp lý/,
    );
    assert.equal(
      createRag(root).search("cà phê")[0].source,
      response.body.path,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/learned/" + proposal.id + "/approve")
          .send({})
      ).status,
      409,
    );
    const rejected = await make("Không nên thêm điều này.");
    assert.equal(
      (
        await request(app)
          .post("/api/learned/" + rejected.id + "/reject")
          .send({})
      ).status,
      200,
    );
    assert.equal(existsSync(join(root, "learned", rejected.id + ".md")), false);
    assert.equal(
      (
        await request(app)
          .post("/api/learned/" + rejected.id + "/approve")
          .send({})
      ).status,
      409,
    );
    assert.equal((await request(app).get("/api/learned")).body.length, 2);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test("step 7: approval refuses symlink directories", async () => {
  const root = mkdtempSync(join(tmpdir(), "al-learn-safe-"));
  const outside = mkdtempSync(join(tmpdir(), "al-outside-"));
  const db = openDB(":memory:");
  try {
    const c = createConversation(db);
    const tools = createTools({ db, root, conversationId: c.id });
    const p = JSON.parse(
      (
        await tools.execute({
          id: "t",
          name: "propose_knowledge",
          input: {
            title: "Test",
            content: "Test content",
            reason: "Test reason",
          },
        })
      ).content,
    );
    symlinkSync(outside, join(root, "learned"));
    const app = createApp({ db, knowledgeRoot: root });
    assert.equal(
      (
        await request(app)
          .post("/api/learned/" + p.id + "/approve")
          .send({})
      ).status,
      500,
    );
    assert.equal(
      db.prepare("SELECT status FROM learned_pending WHERE id=?").get(p.id)
        .status,
      "pending",
    );
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
