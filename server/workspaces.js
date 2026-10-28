import express from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, lstatSync, existsSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { openDB } from "./db.js";
import { configureHttp, errorHandler } from "./http.js";
import { PublicError } from "./errors.js";
export const DEFAULT_WORKSPACE = "personal";
const idSchema = z.union([z.literal(DEFAULT_WORKSPACE), z.uuid()]);
const fields = {
  name: z.string().max(80).trim().min(1),
  description: z.string().max(500).trim(),
  persona: z.string().max(8000).trim(),
};
function safeDir(path) {
  if (existsSync(path) && lstatSync(path).isSymbolicLink())
    throw new PublicError(500, "Thư mục không gian không an toàn.");
  mkdirSync(path, { recursive: true });
  return path;
}
export function createWorkspaceController(options, build) {
  const db = options.db || openDB();
  db.exec(
    `CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',persona TEXT NOT NULL DEFAULT '',archived_at TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));`,
  );
  for (const [id, name, description] of [
    ["personal", "Cá nhân", "Không gian cá nhân và dữ liệu trước đây."],
    [
      "00000000-0000-4000-8000-000000000002",
      "Công việc",
      "Công việc và tài liệu chuyên môn.",
    ],
    [
      "00000000-0000-4000-8000-000000000003",
      "Học tập",
      "Kế hoạch học tập và kiến thức mới.",
    ],
  ])
    db.prepare(
      "INSERT OR IGNORE INTO workspaces(id,name,description) VALUES (?,?,?)",
    ).run(id, name, description);
  const app = express(),
    children = new Map();
  let temporaryRoot = null,
    closed = false;
  const root = () =>
    options.workspaceRoot ||
    (db.name !== ":memory:"
      ? join(dirname(resolve(db.name)), ".workspaces")
      : (temporaryRoot ??= mkdtempSync(join(tmpdir(), "al-spaces-"))));
  const row = (id) => db.prepare("SELECT * FROM workspaces WHERE id=?").get(id);
  function child(id) {
    if (children.has(id)) return children.get(id);
    const current = row(id);
    if (!current || current.archived_at)
      throw new PublicError(404, "Không gian không tồn tại hoặc đã lưu trữ.");
    let settings = { ...options, db };
    let ownsDB = false;
    if (id !== DEFAULT_WORKSPACE) {
      const base = safeDir(root()),
        dir = safeDir(join(base, id));
      const workspaceDB = openDB(join(dir, "al.sqlite"));
      ownsDB = true;
      settings = {
        ...options,
        db: workspaceDB,
        knowledgeRoot: safeDir(join(dir, "knowledge")),
        documentsRoot: safeDir(join(dir, "documents")),
      };
    }
    const inner = build({
      ...settings,
      workspacePersona: () => row(id)?.persona || "",
      workspaceName: () => row(id)?.name || "Không gian",
    });
    inner.locals.ownsDB = ownsDB;
    children.set(id, inner);
    return inner;
  }
  configureHttp(app);
  app.get("/api/workspaces", (req, res) => {
    const p = z
      .object({ archived: z.enum(["true", "false"]).optional() })
      .strict()
      .safeParse(req.query);
    if (!p.success)
      throw new PublicError(400, "Bộ lọc không gian không hợp lệ.");
    res.json(
      db
        .prepare(
          p.data.archived === "true"
            ? "SELECT * FROM workspaces ORDER BY created_at,id"
            : "SELECT * FROM workspaces WHERE archived_at IS NULL ORDER BY CASE id WHEN 'personal' THEN 0 ELSE 1 END,created_at,id",
        )
        .all(),
    );
  });
  app.post("/api/workspaces", (req, res) => {
    const p = z
      .object({
        name: fields.name,
        description: fields.description.optional(),
        persona: fields.persona.optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!p.success)
      throw new PublicError(
        400,
        "Tên tối đa 80 ký tự, mô tả 500 và persona 8000 ký tự.",
      );
    if (db.prepare("SELECT count(*) AS n FROM workspaces").get().n >= 50)
      throw new PublicError(
        409,
        "Tối đa 50 không gian. Hãy dùng lại một không gian đã có.",
      );
    const id = randomUUID();
    db.prepare(
      "INSERT INTO workspaces(id,name,description,persona) VALUES (?,?,?,?)",
    ).run(id, p.data.name, p.data.description || "", p.data.persona || "");
    res.status(201).json(row(id));
  });
  app.use("/api/workspaces/:id", (req, res, next) => {
    if (!idSchema.safeParse(req.params.id).success)
      throw new PublicError(400, "ID không gian không hợp lệ.");
    if (!row(req.params.id))
      throw new PublicError(404, "Không tìm thấy không gian.");
    next();
  });
  app.patch("/api/workspaces/:id", (req, res) => {
    const p = z
      .object({
        name: fields.name.optional(),
        description: fields.description.optional(),
        persona: fields.persona.optional(),
      })
      .strict()
      .refine((v) => Object.keys(v).length > 0)
      .safeParse(req.body);
    if (!p.success)
      throw new PublicError(400, "Thông tin không gian không hợp lệ.");
    const old = row(req.params.id);
    db.prepare(
      "UPDATE workspaces SET name=?,description=?,persona=? WHERE id=?",
    ).run(
      p.data.name ?? old.name,
      p.data.description ?? old.description,
      p.data.persona ?? old.persona,
      old.id,
    );
    res.json(row(old.id));
  });
  app.post("/api/workspaces/:id/archive", (req, res) => {
    if (!z.object({}).strict().safeParse(req.body).success)
      throw new PublicError(400, "Yêu cầu không hợp lệ.");
    if (req.params.id === DEFAULT_WORKSPACE)
      throw new PublicError(
        409,
        "Không gian cá nhân giữ dữ liệu gốc và không thể lưu trữ.",
      );
    const inner = children.get(req.params.id);
    if (
      inner &&
      (inner.locals.active.size ||
        inner.locals.workflows.busy() ||
        inner.locals.db
          .prepare(
            "SELECT count(*) AS n FROM documents WHERE status IN ('queued','processing','indexing')",
          )
          .get().n)
    )
      throw new PublicError(
        409,
        "Hãy đợi chat, xử lý tài liệu hoặc tác vụ đang chạy hoàn tất.",
      );
    db.prepare(
      "UPDATE workspaces SET archived_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
    ).run(req.params.id);
    res.json(row(req.params.id));
  });
  app.post("/api/workspaces/:id/restore", (req, res) => {
    if (!z.object({}).strict().safeParse(req.body).success)
      throw new PublicError(400, "Yêu cầu không hợp lệ.");
    db.prepare("UPDATE workspaces SET archived_at=NULL WHERE id=?").run(
      req.params.id,
    );
    res.json(row(req.params.id));
  });
  app.use("/api", (req, res, next) => {
    try {
      const url = new URL(req.url, "http://local"),
        query = url.searchParams.getAll("workspace");
      const header = req.headers["x-workspace-id"];
      if (query.length > 1 || (header && query.length && header !== query[0]))
        throw new PublicError(400, "Chọn một không gian hợp lệ.");
      const id = header || query[0] || DEFAULT_WORKSPACE;
      if (!idSchema.safeParse(id).success)
        throw new PublicError(400, "ID không gian không hợp lệ.");
      if (!row(id) || row(id).archived_at)
        throw new PublicError(404, "Không gian không tồn tại hoặc đã lưu trữ.");
      url.searchParams.delete("workspace");
      const previous = req.url;
      req.url = "/api" + url.pathname + url.search;
      child(id)(req, res, (error) => {
        req.url = previous;
        next(error);
      });
    } catch (e) {
      next(e);
    }
  });
  app.use(errorHandler);
  const personal = child(DEFAULT_WORKSPACE);
  app.locals.db = db;
  app.locals.documents = personal.locals.documents;
  app.locals.workspaces = children;
  app.locals.close = async () => {
    if (closed) return;
    closed = true;
    for (const inner of children.values()) {
      await inner.locals.documents.close();
      inner.locals.workflows.close();
      if (inner.locals.ownsDB) inner.locals.db.close();
    }
    if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
  };
  return app;
}
