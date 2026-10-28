import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { openDB, createConversation, addMessage } from "../db.js";
import { createApp } from "../index.js";
test("history search: titles, message text, accent folding and exact matching message", async () => {
  const db = openDB(":memory:");
  try {
    const a = createConversation(db, "Kế hoạch học tập"),
      b = createConversation(db, "Công việc"),
      c = createConversation(db, "Khác");
    addMessage(db, a.id, "user", "Tôi thích học");
    addMessage(db, b.id, "user", "Đang nghiên cứu cơ sở dữ liệu.");
    addMessage(db, b.id, "assistant", "SQL và SQLite là lựa chọn gọn nhẹ.");
    addMessage(db, c.id, "user", "100% nguyên văn, dấu _ và ký tự <script>.");
    const app = createApp({ db });
    assert.equal(
      (await request(app).get("/api/conversations?q=ke+hoach")).body[0].id,
      a.id,
    );
    const found = (await request(app).get("/api/conversations?q=co+so+du+lieu"))
      .body;
    assert.equal(found.length, 1);
    assert.equal(found[0].id, b.id);
    assert.match(found[0].snippet, /cơ sở dữ liệu/);
    assert.equal(
      db
        .prepare("SELECT role FROM messages WHERE id=?")
        .get(found[0].match_message_id).role,
      "user",
    );
    assert.equal(
      (await request(app).get("/api/conversations?q=sqlite")).body[0]
        .match_role,
      "assistant",
    );
    assert.equal(
      (await request(app).get("/api/conversations?q=%25")).body.length,
      1,
    );
    assert.equal(
      (await request(app).get("/api/conversations?q=_")).body.length,
      1,
    );
    assert.deepEqual(
      (
        await request(app).get(
          "/api/conversations?q=" + encodeURIComponent("' OR 1=1 --"),
        )
      ).body,
      [],
    );
    assert.equal(
      (await request(app).get("/api/conversations?q=" + "x".repeat(201)))
        .status,
      400,
    );
    assert.equal(
      (await request(app).get("/api/conversations?q=a&q=b")).status,
      400,
    );
    assert.equal(
      (await request(app).get("/api/conversations?unknown=1")).status,
      400,
    );
    await request(app)
      .patch("/api/conversations/" + a.id)
      .send({ title: "Tiêu đề mới" });
    assert.equal(
      (await request(app).get("/api/conversations?q=ke+hoach")).body.length,
      0,
    );
    await request(app).delete("/api/conversations/" + b.id);
    assert.equal(
      (await request(app).get("/api/conversations?q=sqlite")).body.length,
      0,
    );
  } finally {
    db.close();
  }
});
