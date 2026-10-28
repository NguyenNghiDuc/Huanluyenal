import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../index.js";
import { openDB, history } from "../db.js";
test("step 2: persistence, rename, regenerate and cascading deletion", async () => {
  const db = openDB(":memory:");
  let received;
  const app = createApp({
    db,
    extract: async () => [],
    generate: async ({ onText, messages }) => {
      received = messages;
      onText("Trả lời");
    },
  });
  const res = await request(app)
    .post("/api/chat")
    .send({ message: "Xin chào" });
  const id = JSON.parse(
    res.text.match(/event: meta\ndata: (.*)/)[1],
  ).conversationId;
  assert.equal(history(db, id).length, 2);
  await request(app)
    .post("/api/chat")
    .send({ conversationId: id, message: "Tiếp tục" });
  assert.equal(received.length, 3);
  await request(app)
    .post("/api/chat")
    .send({ conversationId: id, regenerate: true });
  assert.equal(history(db, id).length, 4);
  assert.equal(
    (
      await request(app)
        .patch("/api/conversations/" + id)
        .send({ title: "Tên mới" })
    ).status,
    200,
  );
  assert.equal(
    (await request(app).get("/api/conversations/" + id)).body.conversation
      .title,
    "Tên mới",
  );
  assert.equal(
    (await request(app).delete("/api/conversations/" + id)).status,
    200,
  );
  assert.equal(history(db, id).length, 0);
  assert.equal(
    (await request(app).get("/api/conversations/" + id)).status,
    404,
  );
  db.close();
});
