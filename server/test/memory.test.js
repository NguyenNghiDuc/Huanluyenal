import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../index.js";
import { openDB } from "../db.js";
test("step 4: extract facts after chat, load in next session, edit/delete", async () => {
  const db = openDB(":memory:");
  let prompt;
  const app = createApp({
    db,
    generate: async ({ system, onText }) => {
      prompt = system;
      onText("Đã hiểu");
    },
    extract: async ({ messages }) =>
      messages.some((m) => m.role === "user" && m.content.includes("Hà Nội"))
        ? ["Người dùng sống ở Hà Nội."]
        : [],
  });
  await request(app).post("/api/chat").send({ message: "Tôi sống ở Hà Nội" });
  const memories = (await request(app).get("/api/memories")).body;
  assert.equal(memories.length, 1);
  await request(app).post("/api/chat").send({ message: "Xin chào" });
  assert.match(prompt, /Hà Nội/);
  const id = memories[0].id;
  assert.equal(
    (
      await request(app)
        .patch("/api/memories/" + id)
        .send({ content: "Tôi sống ở Đà Nẵng." })
    ).status,
    200,
  );
  await request(app).post("/api/chat").send({ message: "hi" });
  assert.match(prompt, /Đà Nẵng/);
  assert.equal((await request(app).delete("/api/memories/" + id)).status, 200);
  assert.equal((await request(app).get("/api/memories")).body.length, 0);
  db.close();
});
test("step 4: extraction failure leaves answer intact", async () => {
  const db = openDB(":memory:");
  const app = createApp({
    db,
    generate: async ({ onText }) => onText("Đã lưu"),
    extract: async () => {
      throw new Error("quota");
    },
  });
  const res = await request(app).post("/api/chat").send({ message: "hi" });
  assert.match(res.text, /event: warning/);
  assert.match(res.text, /event: done/);
  assert.equal(
    db.prepare("SELECT content FROM messages WHERE role='assistant'").get()
      .content,
    "Đã lưu",
  );
  db.close();
});
