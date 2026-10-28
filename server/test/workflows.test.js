import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { setTimeout as delay } from "node:timers/promises";
import { openDB, createConversation, addMessage } from "../db.js";
import { createApp } from "../index.js";
import {
  artifact,
  createArtifact,
  sendWebhook,
  externalDestination,
  calendarExport,
} from "../workflows.js";
import { createTools } from "../tools/index.js";
const input = {
  kind: "study_plan",
  title: "Học Python",
  summary: "Học từng bước",
  body: "## Mục tiêu\nLàm ứng dụng nhỏ",
  tasks: [
    {
      title: "Đọc tài liệu",
      notes: "Ghi chú",
      dueDate: "2027-01-10",
      priority: "high",
    },
  ],
};
function setup(overrides = {}) {
  const db = openDB(":memory:");
  const dest = {
    url: "https://receiver.example.test/hook?secret=server-only",
    host: "receiver.example.test",
    label: "Bên nhận",
    hash: "destination-one",
  };
  let sends = [];
  const app = createApp({
    db,
    workflowGenerate: async ({ kind }) => ({
      ...input,
      kind,
      ...(kind === "document" ? { tasks: [] } : {}),
    }),
    externalConfig: () => dest,
    sendExternal: async (args) => {
      sends.push(args);
    },
    ...overrides,
  });
  return {
    db,
    app,
    sends,
    dest,
    async close() {
      await app.locals.close();
      db.close();
    },
  };
}
test("actions: draft CRUD, task lifecycle, validated dates, exports and revision conflicts", async () => {
  const s = setup();
  try {
    let response = await request(s.app).post("/api/artifacts").send(input);
    assert.equal(response.status, 201);
    let a = response.body;
    assert.equal(a.status, "draft");
    response = await request(s.app)
      .patch("/api/artifacts/" + a.id + "/tasks/" + a.tasks[0].id)
      .send({ revision: a.revision, status: "done" });
    assert.equal(response.status, 200);
    a = response.body;
    assert.equal(a.tasks[0].status, "done");
    assert.equal(
      (
        await request(s.app)
          .patch("/api/artifacts/" + a.id)
          .send({ revision: 1, title: "stale" })
      ).status,
      409,
    );
    assert.equal(
      (
        await request(s.app)
          .post("/api/artifacts/" + a.id + "/tasks")
          .send({
            revision: a.revision,
            task: { title: "Bad", dueDate: "2027-02-30" },
          })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(s.app)
          .post("/api/artifacts")
          .send({ ...input, unknown: true })
      ).status,
      400,
    );
    const md = await request(s.app).get(
      "/api/artifacts/" + a.id + "/export?format=md",
    );
    assert.match(md.text, /- \[x\] Đọc tài liệu/);
    const ics = await request(s.app).get(
      "/api/artifacts/" + a.id + "/export?format=ics",
    );
    assert.match(ics.text, /BEGIN:VTODO/);
    assert.match(ics.text, /DUE;VALUE=DATE:20270110/);
    assert.match(ics.text, /STATUS:COMPLETED/);
    assert.equal(
      (
        await request(s.app).get(
          "/api/artifacts/" + a.id + "/export?format=json",
        )
      ).body.tasks.length,
      1,
    );
    assert.equal(
      (
        await request(s.app)
          .delete("/api/artifacts/" + a.id)
          .send({ revision: a.revision })
      ).status,
      200,
    );
    assert.equal(
      (await request(s.app).get("/api/artifacts/" + a.id)).status,
      404,
    );
  } finally {
    await s.close();
  }
});
test("actions: generation validates source scope; tools create drafts once and private tools cannot persist", async () => {
  const s = setup();
  try {
    const c = createConversation(s.db);
    addMessage(s.db, c.id, "user", "Lập kế hoạch học Python");
    const m = s.db.prepare("SELECT id FROM messages").get();
    const result = await request(s.app)
      .post("/api/artifacts/generate")
      .send({ kind: "study_plan", sourceMessageId: m.id });
    assert.equal(result.status, 201);
    assert.equal(result.body.source_message_id, m.id);
    assert.equal(
      (
        await request(s.app)
          .post("/api/artifacts/generate")
          .set("X-Workspace-Id", "00000000-0000-4000-8000-000000000002")
          .send({ kind: "study_plan", sourceMessageId: m.id })
      ).status,
      404,
    );
    const tools = createTools({ db: s.db, conversationId: c.id });
    let a = JSON.parse(
      (await tools.execute({ id: "t", name: "create_artifact", input }))
        .content,
    );
    let b = JSON.parse(
      (await tools.execute({ id: "u", name: "create_artifact", input }))
        .content,
    );
    assert.equal(a.id, b.id);
    assert.equal(a.status, "draft");
    assert.ok(
      !createTools({}).definitions.some((t) => t.name === "create_artifact"),
    );
    assert.equal(s.sends.length, 0);
  } finally {
    await s.close();
  }
});
test("outbox: queue never sends; approval uses reviewed snapshot, is single-use and respects isolation", async () => {
  const s = setup();
  try {
    const a = createArtifact(s.db, input);
    const pending = (
      await request(s.app)
        .post("/api/artifacts/" + a.id + "/share")
        .send({ revision: a.revision })
    ).body;
    assert.equal(s.sends.length, 0);
    const outbox = (await request(s.app).get("/api/outbox")).body;
    assert.equal(outbox[0].payload.title, input.title);
    assert.equal(outbox[0].destination_host, "receiver.example.test");
    assert.ok(!JSON.stringify(outbox).includes("secret=server-only"));
    assert.equal(
      (
        await request(s.app)
          .post("/api/outbox/" + pending.id + "/approve")
          .set("X-Workspace-Id", "00000000-0000-4000-8000-000000000002")
          .send({})
      ).status,
      404,
    );
    assert.equal(
      (
        await request(s.app)
          .post("/api/outbox/" + pending.id + "/approve")
          .send({})
      ).status,
      200,
    );
    assert.equal(s.sends.length, 1);
    assert.equal(s.sends[0].payload.title, input.title);
    assert.equal(
      (
        await request(s.app)
          .post("/api/outbox/" + pending.id + "/approve")
          .send({})
      ).status,
      409,
    );
    assert.equal(s.sends.length, 1);
  } finally {
    await s.close();
  }
});
test("outbox: edits/destination changes invalidate approval, rejection blocks sends and retries keep idempotency", async () => {
  let calls = 0,
    keys = [];
  const s = setup({
    sendExternal: async ({ idempotencyKey }) => {
      calls++;
      keys.push(idempotencyKey);
      if (calls === 1) throw new Error("connection lost");
    },
  });
  try {
    let a = createArtifact(s.db, input);
    let queued = (
      await request(s.app)
        .post("/api/artifacts/" + a.id + "/share")
        .send({ revision: a.revision })
    ).body;
    await request(s.app)
      .patch("/api/artifacts/" + a.id)
      .send({ revision: a.revision, title: "Changed" });
    assert.equal(
      (
        await request(s.app)
          .post("/api/outbox/" + queued.id + "/approve")
          .send({})
      ).status,
      409,
    );
    await request(s.app)
      .post("/api/outbox/" + queued.id + "/reject")
      .send({});
    assert.equal(
      (
        await request(s.app)
          .post("/api/outbox/" + queued.id + "/approve")
          .send({})
      ).status,
      409,
    );
    a = artifact(s.db, a.id);
    queued = (
      await request(s.app)
        .post("/api/artifacts/" + a.id + "/share")
        .send({ revision: a.revision })
    ).body;
    s.dest.hash = "different";
    assert.equal(
      (
        await request(s.app)
          .post("/api/outbox/" + queued.id + "/approve")
          .send({})
      ).status,
      409,
    );
    s.dest.hash = "destination-one";
    assert.equal(
      (
        await request(s.app)
          .post("/api/outbox/" + queued.id + "/approve")
          .send({})
      ).status,
      502,
    );
    assert.equal(
      (await request(s.app).get("/api/outbox")).body.find(
        (o) => o.id === queued.id,
      ).status,
      "failed",
    );
    assert.equal(
      (
        await request(s.app)
          .post("/api/outbox/" + queued.id + "/approve")
          .send({})
      ).status,
      200,
    );
    assert.equal(keys[0], keys[1]);
  } finally {
    await s.close();
  }
});
test("webhook sender: JSON payload, idempotency, redirects disabled and no credential exposure", async () => {
  let called;
  await sendWebhook({
    destination: { url: "https://example.test/hook" },
    payload: { title: "Review" },
    idempotencyKey: "key",
    fetcher: async (url, options) => {
      called = { url, options };
      return new Response("", { status: 202 });
    },
  });
  assert.equal(called.options.redirect, "error");
  assert.equal(called.options.headers["Idempotency-Key"], "key");
  assert.equal(JSON.parse(called.options.body).title, "Review");
  await assert.rejects(
    () =>
      sendWebhook({
        destination: { url: "https://example.test/hook" },
        payload: {},
        idempotencyKey: "x",
        fetcher: async () =>
          new Response("private error body", { status: 400 }),
      }),
    /HTTP 400/,
  );
  const text = calendarExport({
    ...input,
    tasks: [
      {
        id: "t",
        title: "Việc rất dài ".repeat(20) + "\nBEGIN:VEVENT",
        notes: "one;two,three",
        status: "todo",
        due_date: null,
      },
    ],
  });
  assert.match(text, /\\nBEGIN:VEVENT/);
  for (const line of text.split("\r\n"))
    assert.ok(Buffer.byteLength(line) <= 75);
});
test("outbox: simultaneous approvals cannot send twice, and no webhook remains a working local workflow", async () => {
  let release,
    calls = 0;
  const waiting = new Promise((r) => (release = r));
  const s = setup({
    sendExternal: async () => {
      calls++;
      await waiting;
    },
  });
  try {
    const a = createArtifact(s.db, input),
      id = (
        await request(s.app)
          .post("/api/artifacts/" + a.id + "/share")
          .send({ revision: a.revision })
      ).body.id;
    const first = request(s.app)
      .post("/api/outbox/" + id + "/approve")
      .send({})
      .then((r) => r);
    for (let i = 0; i < 50 && !calls; i++) await delay(10);
    assert.equal(calls, 1);
    assert.equal(
      (
        await request(s.app)
          .post("/api/outbox/" + id + "/approve")
          .send({})
      ).status,
      409,
    );
    release();
    assert.equal((await first).status, 200);
    assert.equal(calls, 1);
  } finally {
    release();
    await s.close();
  }
  const local = setup({ externalConfig: () => null });
  try {
    assert.equal(
      (await request(local.app).get("/api/action-capabilities")).body
        .externalEnabled,
      false,
    );
    const a = createArtifact(local.db, input);
    assert.equal(
      (
        await request(local.app)
          .post("/api/artifacts/" + a.id + "/share")
          .send({ revision: a.revision })
      ).status,
      503,
    );
    assert.equal(
      (
        await request(local.app).get(
          "/api/artifacts/" + a.id + "/export?format=md",
        )
      ).status,
      200,
    );
  } finally {
    await local.close();
  }
});
test("actions: failed AI generation leaves no partial draft, and external URLs require HTTPS", async () => {
  const s = setup({
    workflowGenerate: async () => {
      throw new Error("invalid JSON");
    },
  });
  try {
    const c = createConversation(s.db);
    addMessage(s.db, c.id, "user", "Hãy soạn tài liệu");
    assert.equal(
      (
        await request(s.app)
          .post("/api/artifacts/generate")
          .send({ kind: "document", conversationId: c.id })
      ).status,
      503,
    );
    assert.equal(
      s.db.prepare("SELECT count(*) AS n FROM artifacts").get().n,
      0,
    );
  } finally {
    await s.close();
  }
  const old = process.env.EXTERNAL_WEBHOOK_URL;
  try {
    process.env.EXTERNAL_WEBHOOK_URL = "http://example.test/hook";
    assert.throws(() => externalDestination(), /HTTPS/);
    process.env.EXTERNAL_WEBHOOK_URL = "https://user:pass@example.test/hook";
    assert.throws(() => externalDestination(), /HTTPS/);
  } finally {
    if (old === undefined) delete process.env.EXTERNAL_WEBHOOK_URL;
    else process.env.EXTERNAL_WEBHOOK_URL = old;
  }
});
