import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../index.js";
import { openDB } from "../db.js";
test("step 1: SSE streams ordered text and completion", async () => {
  const app = createApp({
    extract: async () => [],
    db: openDB(":memory:"),
    generate: async ({ onText }) => {
      onText("Xin ");
      onText("chào");
    },
  });
  const res = await request(app).post("/api/chat").send({ message: "hi" });
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /event-stream/);
  assert.match(res.text, /Xin /);
  assert.match(res.text, /chào/);
  assert.match(res.text, /event: done/);
});
test("step 1: validation, origin and friendly failure", async () => {
  const app = createApp({
    extract: async () => [],
    db: openDB(":memory:"),
    generate: async () => {
      throw new Error("MISSING_KEY");
    },
  });
  assert.equal(
    (
      await request(app)
        .post("/api/chat")
        .send({ message: "x".repeat(8001) })
    ).status,
    400,
  );
  assert.equal(
    (await request(app).get("/api/health").set("Origin", "https://evil.test"))
      .status,
    403,
  );
  assert.match(
    (await request(app).post("/api/chat").send({ message: "hi" })).text,
    /ANTHROPIC_API_KEY/,
  );
});
