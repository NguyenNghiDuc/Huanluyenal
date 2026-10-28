import "dotenv/config";
import express from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { answer, friendly } from "./llm.js";
import { openDB, createConversation, history, addMessage } from "./db.js";
import {
  extractFacts,
  remember,
  listMemories,
  memoryContext,
} from "./memory.js";
import { createRag, ragContext, KNOWLEDGE_ROOT } from "./rag.js";
import { createTools } from "./tools/index.js";
import { approve } from "./learning.js";
import { searchConversations } from "./search.js";
export function createApp({
  generate = answer,
  db = openDB(),
  extract = extractFacts,
  knowledgeRoot = KNOWLEDGE_ROOT,
  personaPath = fileURLToPath(new URL("./persona.md", import.meta.url)),
} = {}) {
  const app = express();
  const rag = createRag(knowledgeRoot);
  const active = new Set();
  app.locals.db = db;
  const origin = process.env.WEB_ORIGIN || "http://localhost:5173";
  app.use((req, res, next) => {
    if (req.headers.origin && req.headers.origin !== origin)
      return res.status(403).json({ error: "Origin không được phép." });
    next();
  });
  app.use(cors({ origin }));
  app.use(express.json({ limit: "64kb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Bạn gửi quá nhanh. Hãy chờ một phút." },
    }),
  );
  app.get("/api/health", (_, res) => res.json({ ok: true }));
  const idSchema = z.uuid();
  const titleSchema = z
    .object({ title: z.string().trim().min(1).max(120) })
    .strict();
  app.get("/api/conversations", (req, res) => {
    const parsed = z
      .object({ q: z.string().max(200).trim().optional() })
      .strict()
      .safeParse(req.query);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Từ khoá tìm kiếm tối đa 200 ký tự." });
    const query = parsed.data.q;
    res.json(
      query
        ? searchConversations(db, query)
        : db
            .prepare("SELECT * FROM conversations ORDER BY updated_at DESC,id")
            .all(),
    );
  });
  app.post("/api/conversations", (req, res) => {
    const p = z
      .object({ title: z.string().trim().min(1).max(120).optional() })
      .strict()
      .safeParse(req.body);
    if (!p.success)
      return res.status(400).json({ error: "Tiêu đề không hợp lệ." });
    res.status(201).json(createConversation(db, p.data.title));
  });
  app.use("/api/conversations/:id", (req, res, next) => {
    if (!idSchema.safeParse(req.params.id).success)
      return res.status(400).json({ error: "ID không hợp lệ." });
    if (
      !db.prepare("SELECT id FROM conversations WHERE id=?").get(req.params.id)
    )
      return res.status(404).json({ error: "Không tìm thấy hội thoại." });
    next();
  });
  app.get("/api/conversations/:id", (req, res) =>
    res.json({
      conversation: db
        .prepare("SELECT * FROM conversations WHERE id=?")
        .get(req.params.id),
      messages: history(db, req.params.id),
      generating: active.has(req.params.id),
    }),
  );
  app.patch("/api/conversations/:id", (req, res) => {
    const p = titleSchema.safeParse(req.body);
    if (!p.success)
      return res
        .status(400)
        .json({ error: "Tiêu đề phải có từ 1 đến 120 ký tự." });
    db.prepare("UPDATE conversations SET title=? WHERE id=?").run(
      p.data.title,
      req.params.id,
    );
    res.json({ ok: true });
  });
  app.delete("/api/conversations/:id", (req, res) => {
    if (active.has(req.params.id))
      return res
        .status(409)
        .json({ error: "Hãy dừng câu trả lời trước khi xoá." });
    db.prepare("DELETE FROM conversations WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  });
  app.get("/api/knowledge", (_, res) => res.json(rag.info()));
  app.get("/api/memories", (_, res) => res.json(listMemories(db)));
  app.patch("/api/memories/:id", (req, res) => {
    const p = z
      .object({ content: z.string().trim().min(1).max(500) })
      .strict()
      .safeParse(req.body);
    if (!z.uuid().safeParse(req.params.id).success || !p.success)
      return res
        .status(400)
        .json({ error: "Ký ức không hợp lệ (1–500 ký tự)." });
    try {
      const result = db
        .prepare(
          "UPDATE memories SET content=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
        )
        .run(p.data.content, req.params.id);
      res
        .status(result.changes ? 200 : 404)
        .json(
          result.changes ? { ok: true } : { error: "Không tìm thấy ký ức." },
        );
    } catch {
      res.status(409).json({ error: "Ký ức này đã tồn tại." });
    }
  });
  app.delete("/api/memories/:id", (req, res) => {
    if (!z.uuid().safeParse(req.params.id).success)
      return res.status(400).json({ error: "ID không hợp lệ." });
    const r = db.prepare("DELETE FROM memories WHERE id=?").run(req.params.id);
    res
      .status(r.changes ? 200 : 404)
      .json(r.changes ? { ok: true } : { error: "Không tìm thấy ký ức." });
  });
  app.get("/api/learned", (_, res) =>
    res.json(
      db
        .prepare(
          "SELECT * FROM learned_pending ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,created_at DESC",
        )
        .all(),
    ),
  );
  app.post("/api/learned/:id/approve", (req, res) => {
    const p = z
      .object({
        title: z.string().trim().min(1).max(120).optional(),
        content: z.string().trim().min(1).max(8000).optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!z.uuid().safeParse(req.params.id).success || !p.success)
      return res.status(400).json({ error: "Nội dung duyệt không hợp lệ." });
    try {
      const result = approve(db, knowledgeRoot, req.params.id, p.data);
      const { status, ...body } = result;
      res.status(status).json(body);
    } catch {
      res.status(500).json({
        error:
          "Chưa thể ghi kiến thức. Kiểm tra quyền ghi và thư mục knowledge/learned/.",
      });
    }
  });
  app.post("/api/learned/:id/reject", (req, res) => {
    if (
      !z.uuid().safeParse(req.params.id).success ||
      !z.object({}).strict().safeParse(req.body).success
    )
      return res.status(400).json({ error: "Yêu cầu từ chối không hợp lệ." });
    const result = db
      .prepare(
        "UPDATE learned_pending SET status='rejected',reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='pending'",
      )
      .run(req.params.id);
    res
      .status(result.changes ? 200 : 409)
      .json(
        result.changes
          ? { ok: true }
          : { error: "Đề xuất không tồn tại hoặc đã được xử lý." },
      );
  });
  app.post(
    "/api/chat",
    rateLimit({
      windowMs: 60000,
      limit: 15,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Bạn gửi tin nhắn quá nhanh. Hãy chờ một phút." },
    }),
    async (req, res) => {
      const parsed = z
        .object({
          message: z.string().max(8000).trim().min(1).optional(),
          conversationId: z.uuid().optional(),
          regenerate: z.boolean().optional(),
        })
        .strict()
        .refine((v) =>
          v.regenerate ? !!v.conversationId && !v.message : !!v.message,
        )
        .safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({
          error:
            "Tin nhắn phải có từ 1 đến 8000 ký tự; yêu cầu tạo lại cần ID hội thoại.",
        });
      const body = parsed.data;
      let conversation = body.conversationId
        ? db
            .prepare("SELECT * FROM conversations WHERE id=?")
            .get(body.conversationId)
        : createConversation(db, body.message.slice(0, 60));
      if (!conversation)
        return res.status(404).json({ error: "Không tìm thấy hội thoại." });
      const id = conversation.id;
      if (active.has(id))
        return res
          .status(409)
          .json({ error: "al đang trả lời trong hội thoại này." });
      if (body.regenerate) {
        const lastUser = db
          .prepare(
            "SELECT id FROM messages WHERE conversation_id=? AND role='user' ORDER BY id DESC LIMIT 1",
          )
          .get(id);
        if (!lastUser)
          return res
            .status(400)
            .json({ error: "Chưa có tin nhắn để tạo lại." });
        db.prepare("DELETE FROM messages WHERE conversation_id=? AND id>?").run(
          id,
          lastUser.id,
        );
      } else addMessage(db, id, "user", body.message);
      active.add(id);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90000);
      res.on("close", () => controller.abort());
      res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
      const send = (event, data) => {
        if (!res.destroyed)
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      send("meta", { conversationId: id });
      const heartbeat = setInterval(() => {
        if (!res.destroyed) res.write(": ping\n\n");
      }, 15000);
      let output = "",
        saved = false;
      try {
        const latest = history(db, id)
          .filter((m) => m.content)
          .slice(-40);
        const messages = [];
        let contextSize = 0;
        for (let i = latest.length - 1; i >= 0; i--) {
          const { role, content } = latest[i];
          if (messages.length && contextSize + content.length > 60000) break;
          messages.unshift({ role, content });
          contextSize += content.length;
        }
        while (messages[0]?.role === "assistant") messages.shift();
        const query =
          [...messages].reverse().find((m) => m.role === "user")?.content || "";
        let sources = [];
        try {
          sources = rag.search(query);
        } catch {
          send("warning", {
            message: "Chưa thể đọc kho kiến thức; al vẫn tiếp tục trả lời.",
          });
        }
        send("sources", {
          sources: sources.map(({ source, chunk }) => ({ source, chunk })),
        });
        await generate({
          messages,
          tools: createTools({ root: knowledgeRoot, db, conversationId: id }),
          onStatus: (message) => send("status", { message }),
          system:
            readFileSync(personaPath, "utf8") +
            memoryContext(db) +
            ragContext(sources),
          signal: controller.signal,
          onText: (text) => {
            output += text;
            send("delta", { text });
          },
        });
        if (controller.signal.aborted)
          throw new DOMException("Stopped", "AbortError");
        addMessage(db, id, "assistant", output);
        saved = true;
        send("status", { message: "Đang cập nhật trí nhớ…" });
        try {
          await remember({
            db,
            id,
            messages: [...messages, { role: "assistant", content: output }],
            signal: controller.signal,
            extract,
          });
        } catch {
          send("warning", {
            message: "Câu trả lời đã lưu; lần này chưa thể cập nhật trí nhớ.",
          });
        }
        send("done", {});
      } catch (error) {
        if (output && !saved)
          addMessage(db, id, "assistant", output, "interrupted");
        if (!res.destroyed) send("error", { error: friendly(error) });
      } finally {
        active.delete(id);
        clearTimeout(timer);
        clearInterval(heartbeat);
        res.end();
      }
    },
  );
  app.use("/api", (_, res) =>
    res.status(404).json({ error: "Không tìm thấy API." }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error.status === 413
        ? 413
        : error.type === "entity.parse.failed"
          ? 400
          : 500;
    res.status(status).json({
      error:
        status === 500
          ? "Có lỗi phía server. Vui lòng thử lại."
          : "Yêu cầu không hợp lệ hoặc quá lớn.",
    });
  });
  return app;
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  createApp().listen(
    process.env.PORT || 3001,
    process.env.HOST || "127.0.0.1",
    () => console.log("al server ready"),
  );
