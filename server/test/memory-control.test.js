import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { openDB, createConversation, addMessage, history } from "../db.js";
import { createApp } from "../index.js";
import { memoryContext, remember, listMemories, settings } from "../memory.js";
test("memory control: manual save detects conflict, requires a choice, and preserves new facts until reviewed", async () => {
  const db = openDB(":memory:");
  try {
    const app = createApp({
      db,
      compareMemory: async () => ({ conflictsWith: [], checked: true }),
    });
    let result = await request(app)
      .post("/api/memories")
      .send({ content: "Tôi sống ở Hà Nội." });
    assert.equal(result.status, 201);
    assert.equal(result.body.status, "saved");
    const oldId = result.body.id;
    assert.equal(
      (
        await request(app)
          .post("/api/memories")
          .send({ content: "Người dùng sống ở Hà Nội." })
      ).body.status,
      "existing",
    );
    result = await request(app)
      .post("/api/memories")
      .send({ content: "Tôi sống ở Đà Nẵng." });
    assert.equal(result.body.status, "conflict");
    assert.equal(listMemories(db).length, 1);
    assert.doesNotMatch(memoryContext(db), /Đà Nẵng/);
    assert.equal(
      (
        await request(app)
          .post("/api/memory-conflicts/" + result.body.id + "/resolve")
          .send({ action: "replace" })
      ).status,
      200,
    );
    assert.equal(listMemories(db)[0].content, "Tôi sống ở Đà Nẵng.");
    assert.equal(
      db.prepare("SELECT id FROM memories WHERE id=?").get(oldId),
      undefined,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/memory-conflicts/" + result.body.id + "/resolve")
          .send({ action: "replace" })
      ).status,
      404,
    );
  } finally {
    db.close();
  }
});
test("memory control: keep old/both, stale conflicts, disabled extraction and use settings", async () => {
  const db = openDB(":memory:");
  try {
    const app = createApp({
      db,
      compareMemory: async () => ({ conflictsWith: [], checked: true }),
    });
    await request(app)
      .post("/api/memories")
      .send({ content: "Tôi sống ở Hà Nội." });
    const conflict = async (content) =>
      (await request(app).post("/api/memories").send({ content })).body.id;
    let id = await conflict("Tôi sống ở Huế.");
    await request(app)
      .post("/api/memory-conflicts/" + id + "/resolve")
      .send({ action: "keep_old" });
    assert.equal(listMemories(db).length, 1);
    id = await conflict("Tôi sống ở Đà Nẵng.");
    await request(app)
      .post("/api/memory-conflicts/" + id + "/resolve")
      .send({ action: "keep_both" });
    assert.equal(listMemories(db).length, 2);
    id = await conflict("Tôi sống ở Hải Phòng.");
    const old = listMemories(db)[0];
    await request(app)
      .patch("/api/memories/" + old.id)
      .send({ content: "Tôi thích đọc sách." });
    assert.equal(
      (
        await request(app)
          .post("/api/memory-conflicts/" + id + "/resolve")
          .send({ action: "replace" })
      ).status,
      409,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/memory-conflicts/" + id + "/resolve")
          .send({ action: "keep_old" })
      ).status,
      200,
    );
    await request(app)
      .patch("/api/memory-settings")
      .send({ autoRemember: false, useMemories: false });
    let calls = 0;
    await remember({
      db,
      id: null,
      messages: [],
      extract: async () => {
        calls++;
        return [];
      },
    });
    assert.equal(calls, 0);
    assert.equal(memoryContext(db), "");
    assert.equal(settings(db).autoRemember, false);
  } finally {
    db.close();
  }
});
test("memory control: model semantic conflicts and concurrent user edit cannot be overwritten", async () => {
  const db = openDB(":memory:");
  try {
    const app = createApp({
      db,
      compareMemory: async () => ({ conflictsWith: [], checked: true }),
    });
    const row = (
      await request(app)
        .post("/api/memories")
        .send({ content: "Tôi là giáo viên." })
    ).body;
    const c = createConversation(db);
    await remember({
      db,
      id: c.id,
      messages: [{ role: "user", content: "Tôi đổi sang lập trình." }],
      extract: async () => [
        { content: "Người dùng là lập trình viên.", conflictsWith: [row.id] },
      ],
    });
    assert.equal(
      (await request(app).get("/api/memory-conflicts")).body.length,
      1,
    );
    assert.equal(listMemories(db).length, 1);
    await remember({
      db,
      id: c.id,
      messages: [],
      extract: async () => {
        await request(app).delete("/api/memories/" + row.id);
        return ["Tôi là giáo viên."];
      },
    });
    assert.equal(listMemories(db).length, 0);
  } finally {
    db.close();
  }
});
test("privacy: multi-turn private chat performs no persistent writes, memory read/extraction or learning tools", async () => {
  const db = openDB(":memory:");
  try {
    db.prepare("INSERT INTO memories(id,content) VALUES (?,?)").run(
      randomUUID(),
      "SECRET_PERSONAL_MEMORY",
    );
    let received,
      extracted = 0;
    const app = createApp({
      db,
      extract: async () => {
        extracted++;
        return [];
      },
      generate: async (args) => {
        received = args;
        args.onText("Trả lời riêng tư");
      },
    });
    const count = () =>
      Object.fromEntries(
        [
          "conversations",
          "messages",
          "memories",
          "learned_pending",
          "memory_conflicts",
        ].map((t) => [t, db.prepare("SELECT count(*) AS n FROM " + t).get().n]),
      );
    const before = count();
    const response = await request(app)
      .post("/api/chat")
      .send({
        temporary: true,
        messages: [
          { role: "user", content: "Bí mật" },
          { role: "assistant", content: "Đã nghe" },
          { role: "user", content: "Nói tiếp" },
        ],
      });
    assert.equal(response.status, 200);
    assert.match(response.text, /event: done/);
    assert.deepEqual(count(), before);
    assert.equal(extracted, 0);
    assert.doesNotMatch(received.system, /SECRET_PERSONAL_MEMORY/);
    assert.ok(
      !received.tools.definitions.some((t) => t.name === "propose_knowledge"),
    );
    assert.equal(received.messages.length, 3);
    assert.equal(
      (
        await request(app)
          .post("/api/chat")
          .send({
            temporary: true,
            conversationId: randomUUID(),
            messages: [{ role: "user", content: "x" }],
          })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/chat")
          .send({
            temporary: true,
            messages: [{ role: "assistant", content: "x" }],
          })
      ).status,
      400,
    );
  } finally {
    db.close();
  }
});
test("memory control: manual semantic comparison is used and failures are disclosed", async () => {
  const db = openDB(":memory:");
  try {
    const app = createApp({
      db,
      compareMemory: async ({ content, existing }) => {
        if (content === "Thông tin độc lập") throw new Error("network");
        return {
          conflictsWith: content.includes("ăn thịt")
            ? existing.map((m) => m.id)
            : [],
          checked: true,
        };
      },
    });
    await request(app)
      .post("/api/memories")
      .send({ content: "Tôi ăn thuần chay." });
    const conflict = await request(app)
      .post("/api/memories")
      .send({ content: "Tôi ăn thịt." });
    assert.equal(conflict.body.status, "conflict");
    assert.equal(listMemories(db).length, 1);
    const limited = await request(app)
      .post("/api/memories")
      .send({ content: "Thông tin độc lập" });
    assert.equal(limited.body.status, "saved");
    assert.equal(limited.body.comparisonLimited, true);
  } finally {
    db.close();
  }
});
