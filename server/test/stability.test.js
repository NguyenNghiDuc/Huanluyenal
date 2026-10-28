import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";
import Anthropic from "@anthropic-ai/sdk";
import { createApp } from "../index.js";
import { openDB, history, createConversation, addMessage } from "../db.js";
import { answer, friendly } from "../llm.js";

test("stability: client cancellation saves partial output and releases conversation lock", async () => {
  const db = openDB(":memory:");
  let aborted = false;
  const app = createApp({
    db,
    extract: async () => [],
    generate: async ({ signal, onText }) => {
      onText("Một phần câu trả lời");
      try {
        await delay(5000, undefined, { signal });
      } catch (e) {
        aborted = true;
        throw e;
      }
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  const controller = new AbortController();
  try {
    const res = await fetch(base + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Xin chào" }),
      signal: controller.signal,
    });
    const reader = res.body.getReader();
    let text = "";
    while (!text.includes("event: delta")) {
      text += new TextDecoder().decode((await reader.read()).value);
    }
    const id = JSON.parse(
      text.match(/event: meta\ndata: (.*)/)[1],
    ).conversationId;
    assert.equal(
      (await fetch(base + "/api/conversations/" + id, { method: "DELETE" }))
        .status,
      409,
    );
    assert.equal(
      (
        await fetch(base + "/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: id, message: "another" }),
        })
      ).status,
      409,
    );
    controller.abort();
    await reader.cancel().catch(() => {});
    for (let i = 0; i < 50 && !aborted; i++) await delay(10);
    assert.ok(aborted);
    const messages = history(db, id);
    assert.equal(messages.length, 2);
    assert.equal(messages[1].status, "interrupted");
    assert.equal(messages[1].content, "Một phần câu trả lời");
    assert.equal(
      (await fetch(base + "/api/conversations/" + id, { method: "DELETE" }))
        .status,
      200,
    );
  } finally {
    controller.abort();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
test("stability: strict validation, malformed JSON and IP chat limit", async () => {
  const db = openDB(":memory:");
  const app = createApp({
    db,
    extract: async () => [],
    generate: async ({ onText }) => onText("ok"),
  });
  try {
    assert.equal(
      (
        await request(app)
          .post("/api/chat")
          .send({ message: "x", system: "override" })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/chat")
          .send({ message: " ".repeat(8000) + "x" })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/chat")
          .set("Content-Type", "application/json")
          .send("{")
      ).status,
      400,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/chat")
          .send({ message: "x".repeat(70000) })
      ).status,
      413,
    );
    let status;
    for (let i = 0; i < 16; i++)
      status = (await request(app).post("/api/chat").send({ message: "hi" }))
        .status;
    assert.equal(status, 429);
  } finally {
    db.close();
  }
});
test("stability: SQLite data survives reopen", () => {
  const dir = mkdtempSync(join(tmpdir(), "al-db-"));
  const path = join(dir, "test.sqlite");
  try {
    let db = openDB(path);
    const c = createConversation(db, "Bền vững");
    addMessage(db, c.id, "user", "Nội dung");
    db.close();
    db = openDB(path);
    assert.equal(history(db, c.id)[0].content, "Nội dung");
    assert.equal(
      db.prepare("SELECT title FROM conversations WHERE id=?").get(c.id).title,
      "Bền vững",
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("stability: real Anthropic SDK decodes SSE wire format without a remote API", async () => {
  let requestBody;
  const events = [
    [
      "message_start",
      {
        type: "message_start",
        message: {
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 5, output_tokens: 0 },
        },
      },
    ],
    [
      "content_block_start",
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
    ],
    [
      "content_block_delta",
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Xin chào" },
      },
    ],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 2 },
      },
    ],
    ["message_stop", { type: "message_stop" }],
  ];
  const api = new Anthropic({
    apiKey: "test-only-not-a-real-key",
    fetch: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return new Response(
        events
          .map(
            ([event, data]) =>
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          )
          .join(""),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    },
  });
  let text = "";
  await answer({
    api,
    messages: [{ role: "user", content: "hi" }],
    system: "al",
    onText: (t) => (text += t),
  });
  assert.equal(text, "Xin chào");
  assert.equal(requestBody.model, "claude-sonnet-4-6");
  assert.equal(requestBody.stream, true);
  assert.match(
    friendly({ status: 400, message: "Your credit balance is too low" }),
    /hết hạn mức/,
  );
  assert.match(
    friendly({
      name: "APIConnectionTimeoutError",
      message: "Request timed out",
    }),
    /thời gian chờ/,
  );
  assert.match(friendly(new Error("ECONNRESET")), /kết nối/);
});
