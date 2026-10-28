import { Router } from "express";
import { z } from "zod";
import {
  listMemories,
  settings,
  storeCandidate,
  bumpRevision,
  pendingConflicts,
  resolveConflict,
  compareMemory,
} from "./memory.js";
import { PublicError } from "./errors.js";
const content = z.string().max(500).trim().min(1);
export function memoryRoutes(db, { compare = compareMemory } = {}) {
  const router = Router();
  router.get("/memories", (_, res) => res.json(listMemories(db)));
  router.get("/memory-settings", (_, res) => res.json(settings(db)));
  router.patch("/memory-settings", (req, res) => {
    const p = z
      .object({
        autoRemember: z.boolean().optional(),
        useMemories: z.boolean().optional(),
      })
      .strict()
      .refine((v) => Object.keys(v).length > 0)
      .safeParse(req.body);
    if (!p.success)
      throw new PublicError(400, "Cấu hình trí nhớ không hợp lệ.");
    const current = settings(db);
    db.prepare(
      "UPDATE memory_settings SET auto_remember=?,use_memories=?,revision=revision+1 WHERE id=1",
    ).run(
      +(p.data.autoRemember ?? current.autoRemember),
      +(p.data.useMemories ?? current.useMemories),
    );
    res.json(settings(db));
  });
  router.post("/memories", async (req, res) => {
    const p = z
      .object({
        content,
        sourceMessageId: z.number().int().positive().optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!p.success) throw new PublicError(400, "Ký ức phải có 1–500 ký tự.");
    let conversationId = null;
    if (p.data.sourceMessageId) {
      const m = db
        .prepare("SELECT conversation_id FROM messages WHERE id=?")
        .get(p.data.sourceMessageId);
      if (!m) throw new PublicError(404, "Tin nhắn gốc đã bị xoá.");
      conversationId = m.conversation_id;
    }
    const before = settings(db).revision;
    let assessment = { conflictsWith: [], checked: false };
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    try {
      assessment = await compare({
        content: p.data.content,
        existing: listMemories(db),
        signal: controller.signal,
      });
    } catch {
      /* Manual control remains available; report reduced checking below. */
    }
    if (controller.signal.aborted) return;
    if (settings(db).revision !== before)
      throw new PublicError(
        409,
        "Trí nhớ vừa thay đổi trong lúc kiểm tra. Hãy lưu lại để so sánh với thông tin mới nhất.",
      );
    const result = db.transaction(() =>
      storeCandidate(
        db,
        { content: p.data.content, conflictsWith: assessment.conflictsWith },
        { origin: "manual", conversationId, messageId: p.data.sourceMessageId },
      ),
    )();
    res
      .status(result.status === "existing" ? 200 : 201)
      .json({ ...result, comparisonLimited: !assessment.checked });
  });
  router.patch("/memories/:id", (req, res) => {
    const p = z.object({ content }).strict().safeParse(req.body);
    if (!z.uuid().safeParse(req.params.id).success || !p.success)
      throw new PublicError(400, "Ký ức không hợp lệ (1–500 ký tự).");
    if (!db.prepare("SELECT id FROM memories WHERE id=?").get(req.params.id))
      throw new PublicError(404, "Không tìm thấy ký ức.");
    try {
      db.transaction(() => {
        db.prepare(
          "UPDATE memories SET content=?,origin='manual',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
        ).run(p.data.content, req.params.id);
        bumpRevision(db);
      })();
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE")
        throw new PublicError(409, "Ký ức này đã tồn tại.");
      throw error;
    }
    res.json({ ok: true });
  });
  router.delete("/memories/:id", (req, res) => {
    if (!z.uuid().safeParse(req.params.id).success)
      throw new PublicError(400, "ID không hợp lệ.");
    db.transaction(() => {
      const r = db
        .prepare("DELETE FROM memories WHERE id=?")
        .run(req.params.id);
      if (!r.changes) throw new PublicError(404, "Không tìm thấy ký ức.");
      bumpRevision(db);
    })();
    res.json({ ok: true });
  });
  router.get("/memory-conflicts", (_, res) => res.json(pendingConflicts(db)));
  router.post("/memory-conflicts/:id/resolve", (req, res) => {
    const p = z
      .object({ action: z.enum(["keep_old", "replace", "keep_both"]) })
      .strict()
      .safeParse(req.body);
    if (!z.uuid().safeParse(req.params.id).success || !p.success)
      throw new PublicError(400, "Lựa chọn không hợp lệ.");
    res.json(resolveConflict(db, req.params.id, p.data.action));
  });
  return router;
}
