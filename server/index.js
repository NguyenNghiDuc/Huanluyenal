import "dotenv/config";
import express from "express";

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
import { memoryRoutes } from "./memory-routes.js";
import {
  createDocumentManager,
  documentRoutes,
  documentMetadata,
  DOCUMENTS_ROOT,
} from "./documents.js";
import { searchConversations } from "./search.js";
import { workflowRoutes, createWorkflowService } from "./workflows.js";
import { configureHttp, errorHandler } from "./http.js";
import { createWorkspaceController } from "./workspaces.js";
export function createWorkspaceApp({
  generate = answer,
  db = openDB(),
  extract = extractFacts,
  compareMemory,
  knowledgeRoot = KNOWLEDGE_ROOT,
  documentsRoot = DOCUMENTS_ROOT,
  workspacePersona = () => "",
  workspaceName = () => "Cá nhân",
  workflowGenerate,
  sendExternal,
  externalConfig,
  personaPath = fileURLToPath(new URL("./persona.md", import.meta.url)),
} = {}) {
  const app = express();
  const rag = createRag(knowledgeRoot, {
    metadataForSource: (source) => documentMetadata(db, source),
  });
  const documentManager = createDocumentManager({
    db,
    root: knowledgeRoot,
    storageRoot: documentsRoot,
    rag,
  });
  app.locals.documents = documentManager;
  const active = new Set();
  app.locals.db = db;
  app.locals.active = active;
  app.get("/api/health", (_, res) => res.json({ ok: true }));
  const workflows = createWorkflowService({
    db,
    generate: workflowGenerate,
    sendExternal,
    externalConfig,
    persona: () =>
      readFileSync(personaPath, "utf8") + "\n" + workspacePersona(),
  });
  app.locals.workflows = workflows;
  app.use("/api", workflowRoutes(workflows, db));
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
  app.use("/api", memoryRoutes(db, { compare: compareMemory }));
  app.use("/api", documentRoutes(documentManager, db, rag));
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
  app.post("/api/chat", async (req, res) => {
    const persistent = z
      .object({
        message: z.string().max(8000).trim().min(1).optional(),
        conversationId: z.uuid().optional(),
        regenerate: z.boolean().optional(),
        temporary: z.literal(false).optional(),
      })
      .strict()
      .refine((v) =>
        v.regenerate ? !!v.conversationId && !v.message : !!v.message,
      );
    const temporary = z
      .object({
        temporary: z.literal(true),
        messages: z
          .array(
            z
              .object({
                role: z.enum(["user", "assistant"]),
                content: z.string().min(1).max(40000),
              })
              .strict(),
          )
          .min(1)
          .max(40),
      })
      .strict()
      .refine(
        (v) =>
          v.messages[0].role === "user" &&
          v.messages.at(-1).role === "user" &&
          v.messages.every(
            (m) => m.role !== "user" || m.content.length <= 8000,
          ) &&
          v.messages.reduce((n, m) => n + m.content.length, 0) <= 60000,
      );
    const parsed = z.union([persistent, temporary]).safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error:
          "Yêu cầu chat không hợp lệ. Tin nhắn tối đa 8000 ký tự; chat tạm thời chỉ nhận lịch sử giới hạn và không kèm ID hội thoại.",
      });
    const body = parsed.data,
      isTemporary = body.temporary === true;
    let id = null;
    if (!isTemporary) {
      const conversation = body.conversationId
        ? db
            .prepare("SELECT * FROM conversations WHERE id=?")
            .get(body.conversationId)
        : createConversation(db, body.message.slice(0, 60));
      if (!conversation)
        return res.status(404).json({ error: "Không tìm thấy hội thoại." });
      id = conversation.id;
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
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    res.on("close", () => controller.abort());
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const send = (event, data) => {
      if (!res.destroyed)
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    send("meta", { conversationId: id, temporary: isTemporary });
    const heartbeat = setInterval(() => {
      if (!res.destroyed) res.write(": ping\n\n");
    }, 15000);
    let output = "",
      saved = false,
      sources = [];
    try {
      const latest = (isTemporary ? body.messages : history(db, id))
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

      try {
        sources = rag.search(query);
      } catch {
        send("warning", {
          message: "Chưa thể đọc kho kiến thức; al vẫn tiếp tục trả lời.",
        });
      }
      send("sources", {
        sources: sources.map(({ content, score, ...citation }) => citation),
      });
      await generate({
        messages,
        tools: createTools({
          root: knowledgeRoot,
          onArtifact: (artifact) => send("artifact", artifact),
          ...(!isTemporary ? { db, conversationId: id } : {}),
        }),
        onStatus: (message) => send("status", { message }),
        system:
          readFileSync(personaPath, "utf8") +
          "\n\nKhông gian hiện tại: " +
          workspaceName() +
          ".\n" +
          workspacePersona() +
          "\nBạn có thể tạo bản nháp công việc/kế hoạch/tài liệu bằng tool create_artifact. Không tự gửi ra ngoài; người dùng phải duyệt trên web." +
          (isTemporary
            ? "\nĐây là chat tạm thời. Không ghi nhớ hoặc đề xuất lưu kiến thức; không tuyên bố đã lưu thông tin."
            : memoryContext(db)) +
          ragContext(sources),
        signal: controller.signal,
        onText: (text) => {
          output += text;
          send("delta", { text });
        },
      });
      if (controller.signal.aborted)
        throw new DOMException("Stopped", "AbortError");
      if (!isTemporary) {
        addMessage(
          db,
          id,
          "assistant",
          output,
          "complete",
          sources.map(({ content, score, ...citation }) => citation),
        );
        saved = true;
        send("status", { message: "Đang cập nhật trí nhớ…" });
        try {
          const result = await remember({
            db,
            id,
            messages: [...messages, { role: "assistant", content: output }],
            signal: controller.signal,
            extract,
          });
          if (result.conflicts)
            send("memory_conflict", {
              message: `Có ${result.conflicts} ký ức có thể mâu thuẫn. Mở Trí nhớ để chọn thông tin đúng.`,
            });
        } catch {
          send("warning", {
            message: "Câu trả lời đã lưu; lần này chưa thể cập nhật trí nhớ.",
          });
        }
      }
      send("done", {});
    } catch (error) {
      if (!isTemporary && output && !saved)
        addMessage(
          db,
          id,
          "assistant",
          output,
          "interrupted",
          sources.map(({ content, score, ...citation }) => citation),
        );
      if (!res.destroyed) send("error", { error: friendly(error) });
    } finally {
      if (id) active.delete(id);
      clearTimeout(timer);
      clearInterval(heartbeat);
      res.end();
    }
  });
  app.use("/api", (_, res) =>
    res.status(404).json({ error: "Không tìm thấy API." }),
  );
  app.use(errorHandler);
  return app;
}
export function createApp(options = {}) {
  return createWorkspaceController(options, createWorkspaceApp);
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  createApp().listen(
    process.env.PORT || 3001,
    process.env.HOST || "127.0.0.1",
    () => console.log("al server ready"),
  );
