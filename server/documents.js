import { Router } from "express";
import multer from "multer";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  lstatSync,
  realpathSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { PublicError } from "./errors.js";
export const DOCUMENTS_ROOT = fileURLToPath(
  new URL("../data/documents/", import.meta.url),
);
export const UPLOAD_LIMIT = 10 * 1024 * 1024;
function directory(root, sub = "") {
  const base = realpathSync(root),
    path = sub ? join(base, sub) : base;
  if (existsSync(path) && lstatSync(path).isSymbolicLink())
    throw new PublicError(500, "Thư mục tài liệu không an toàn.");
  mkdirSync(path, { recursive: true });
  if (realpathSync(path) !== path)
    throw new PublicError(500, "Thư mục tài liệu không an toàn.");
  return path;
}
function regularFile(path) {
  if (
    !existsSync(path) ||
    lstatSync(path).isSymbolicLink() ||
    !lstatSync(path).isFile()
  )
    throw new PublicError(404, "File tài liệu không còn tồn tại.");
  return path;
}
export function documentMetadata(db, source) {
  const doc = db
    .prepare("SELECT * FROM documents WHERE source=? AND status='ready'")
    .get(source);
  if (!doc) return null;
  return {
    documentId: doc.id,
    name: doc.name,
    pageCount: doc.page_count,
    pages: db
      .prepare(
        "SELECT page,start_offset,end_offset FROM document_pages WHERE document_id=? ORDER BY page",
      )
      .all(doc.id),
  };
}
export function createDocumentManager({
  db,
  root,
  storageRoot = DOCUMENTS_ROOT,
  rag,
}) {
  const queue = [],
    workers = new Map();
  let running = 0,
    closed = false;
  db.prepare(
    "UPDATE documents SET status='error',error='Quá trình xử lý bị gián đoạn. Bạn có thể thử lại.' WHERE status IN ('queued','processing','indexing')",
  ).run();
  // Remove interrupted derived files so failed uploads cannot enter RAG as ordinary files.
  for (const doc of db
    .prepare("SELECT * FROM documents WHERE status!='ready'")
    .all()) {
    if (existsSync(join(root, "uploads"))) {
      const path = join(directory(root, "uploads"), doc.id + ".txt");
      if (existsSync(path)) unlinkSync(regularFile(path));
    }
  }
  const get = (id) => db.prepare("SELECT * FROM documents WHERE id=?").get(id);
  function original(doc) {
    mkdirSync(storageRoot, { recursive: true });
    return regularFile(join(directory(storageRoot), doc.id + doc.extension));
  }
  function pdfText(buffer, id) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./pdf-worker.js", import.meta.url), {
        workerData: buffer,
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      });
      workers.set(id, worker);
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error("Xử lý PDF quá 30 giây. Hãy chia nhỏ tài liệu."));
      }, 30000);
      const finish = () => {
        clearTimeout(timer);
        workers.delete(id);
      };
      worker.once("message", (result) => {
        finish();
        worker.terminate();
        result.error ? reject(new Error(result.error)) : resolve(result.pages);
      });
      worker.once("error", () => {
        finish();
        reject(
          new Error("Không đủ tài nguyên để đọc PDF. Hãy chia nhỏ tài liệu."),
        );
      });
      worker.once("exit", (code) => {
        finish();
        if (code !== 0) reject(new Error("Xử lý PDF đã bị dừng. Hãy thử lại."));
      });
    });
  }
  async function processDocument(id) {
    const doc = get(id);
    if (!doc || closed) return;
    try {
      db.prepare(
        "UPDATE documents SET status='processing',error=NULL WHERE id=?",
      ).run(id);
      const buffer = readFileSync(original(doc));
      let pages;
      if (doc.extension === ".pdf") pages = await pdfText(buffer, id);
      else {
        let text;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        } catch {
          throw new Error("File phải là văn bản UTF-8.");
        }
        if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text))
          throw new Error("File không phải văn bản thuần.");
        pages = [{ page: 1, text: text.trim() }];
      }
      if (closed || !get(id)) return;
      let text = "";
      const offsets = [];
      for (const page of pages) {
        const start = text.length;
        text += page.text;
        offsets.push({ page: page.page, start, end: text.length });
        text += "\n\n";
      }
      text = text.trimEnd();
      if (!text.trim())
        throw new Error(
          doc.extension === ".pdf"
            ? "PDF không có văn bản có thể trích xuất (có thể là bản scan). Cần OCR trước khi tải lên."
            : "Tài liệu không có nội dung.",
        );
      if (Buffer.byteLength(text, "utf8") > 262144)
        throw new Error("Văn bản vượt quá 256 KiB. Hãy chia nhỏ tài liệu.");
      db.prepare("UPDATE documents SET status='indexing' WHERE id=?").run(id);
      const path = join(directory(root, "uploads"), id + ".txt");
      writeFileSync(path, text, { flag: "wx", mode: 0o600 });
      try {
        db.transaction(() => {
          db.prepare("DELETE FROM document_pages WHERE document_id=?").run(id);
          for (const p of offsets)
            db.prepare(
              "INSERT INTO document_pages(document_id,page,start_offset,end_offset) VALUES (?,?,?,?)",
            ).run(id, p.page, p.start, p.end);
          db.prepare(
            "UPDATE documents SET status='ready',page_count=? WHERE id=?",
          ).run(pages.length, id);
        })();
        rag.refresh();
        const count = rag.getChunks(doc.source).length;
        db.prepare("UPDATE documents SET chunk_count=? WHERE id=?").run(
          count,
          id,
        );
      } catch (error) {
        unlinkSync(path);
        db.prepare("DELETE FROM document_pages WHERE document_id=?").run(id);
        throw error;
      }
    } catch (error) {
      if (!closed && get(id))
        db.prepare(
          "UPDATE documents SET status='error',error=?,page_count=0,chunk_count=0 WHERE id=?",
        ).run(
          /^(PDF|Văn bản|File phải|File không|Tài liệu không|Xử lý|Không đủ|Không đọc|Kho kiến thức)/.test(
            error.message,
          )
            ? error.message
            : "Không thể xử lý tài liệu. Hãy kiểm tra quyền ghi hoặc thử lại.",
          id,
        );
    }
  }
  function pump() {
    if (closed) return;
    while (running < 2 && queue.length) {
      const id = queue.shift();
      running++;
      processDocument(id).finally(() => {
        running--;
        pump();
      });
    }
  }
  function enqueue(id) {
    queue.push(id);
    queueMicrotask(pump);
  }
  return {
    get,
    original,
    enqueue,
    accept(file) {
      const extension = extname(file.originalname).toLowerCase();
      if (![".pdf", ".md", ".txt"].includes(extension))
        throw new PublicError(400, "Chỉ hỗ trợ PDF, Markdown (.md) và TXT.");
      if (
        extension === ".pdf" &&
        !file.buffer.subarray(0, 1024).toString("latin1").includes("%PDF-")
      )
        throw new PublicError(400, "File không có định dạng PDF hợp lệ.");
      if (!file.size) throw new PublicError(400, "File rỗng.");
      if (
        db
          .prepare(
            "SELECT count(*) AS n FROM documents WHERE status IN ('queued','processing','indexing')",
          )
          .get().n >= 20
      )
        throw new PublicError(
          429,
          "Đang xử lý quá nhiều tài liệu. Hãy đợi rồi tải tiếp.",
        );
      const id = randomUUID();
      mkdirSync(storageRoot, { recursive: true });
      const path = join(directory(storageRoot), id + extension);
      writeFileSync(path, file.buffer, { flag: "wx", mode: 0o600 });
      try {
        let originalName = file.originalname;
        try {
          if ([...originalName].every((c) => c.charCodeAt(0) < 256))
            originalName = new TextDecoder("utf-8", { fatal: true }).decode(
              Buffer.from(originalName, "latin1"),
            );
        } catch {}
        const name =
          originalName
            .normalize("NFC")
            .split(/[\\/]/)
            .at(-1)
            .replace(/[\x00-\x1F\x7F]/g, "")
            .slice(0, 180) || "Tài liệu" + extension;
        db.prepare(
          "INSERT INTO documents(id,name,extension,size,source,status) VALUES (?,?,?,?,?,'queued')",
        ).run(id, name, extension, file.size, "uploads/" + id + ".txt");
      } catch (error) {
        unlinkSync(path);
        throw error;
      }
      enqueue(id);
      return get(id);
    },
    remove(id) {
      const doc = get(id);
      if (!doc) throw new PublicError(404, "Không tìm thấy tài liệu.");
      workers.get(id)?.terminate();
      const index = queue.indexOf(id);
      if (index >= 0) queue.splice(index, 1);
      const paths = [];
      if (existsSync(storageRoot))
        paths.push(join(directory(storageRoot), id + doc.extension));
      if (existsSync(join(root, "uploads")))
        paths.push(join(directory(root, "uploads"), id + ".txt"));
      for (const path of paths)
        if (existsSync(path)) unlinkSync(regularFile(path));
      db.prepare("DELETE FROM documents WHERE id=?").run(id);
      rag.refresh();
    },
    close() {
      closed = true;
      queue.length = 0;
      return Promise.all([...workers.values()].map((w) => w.terminate()));
    },
  };
}
export function documentRoutes(manager, db, rag) {
  const router = Router();
  router.get("/documents", (_, res) =>
    res.json(
      db.prepare("SELECT * FROM documents ORDER BY created_at DESC,id").all(),
    ),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: UPLOAD_LIMIT, files: 1, fields: 0, parts: 2 },
  }).single("file");
  router.post("/documents", (req, res, next) =>
    upload(req, res, (error) => {
      if (error)
        return next(
          new PublicError(
            error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
            error.code === "LIMIT_FILE_SIZE"
              ? "File vượt quá 10 MiB."
              : "Chỉ gửi một file với trường “file”, không kèm trường khác.",
          ),
        );
      if (!req.file)
        return next(new PublicError(400, "Hãy chọn một file để tải lên."));
      try {
        res.status(202).json(manager.accept(req.file));
      } catch (e) {
        next(e);
      }
    }),
  );
  router.use("/documents/:id", (req, res, next) => {
    if (!z.uuid().safeParse(req.params.id).success)
      throw new PublicError(400, "ID tài liệu không hợp lệ.");
    if (!manager.get(req.params.id))
      throw new PublicError(404, "Không tìm thấy tài liệu.");
    next();
  });
  router.get("/documents/:id/file", (req, res) => {
    const doc = manager.get(req.params.id);
    res.set("X-Content-Type-Options", "nosniff");
    res.download(manager.original(doc), doc.name, { dotfiles: "allow" });
  });
  router.post("/documents/:id/retry", (req, res) => {
    if (!z.object({}).strict().safeParse(req.body).success)
      throw new PublicError(400, "Yêu cầu không hợp lệ.");
    if (manager.get(req.params.id).status !== "error")
      throw new PublicError(409, "Chỉ thử lại tài liệu bị lỗi.");
    manager.original(manager.get(req.params.id));
    db.prepare(
      "UPDATE documents SET status='queued',error=NULL WHERE id=?",
    ).run(req.params.id);
    manager.enqueue(req.params.id);
    res.status(202).json(manager.get(req.params.id));
  });
  router.delete("/documents/:id", (req, res) => {
    manager.remove(req.params.id);
    res.json({ ok: true });
  });
  router.get("/knowledge/source", (req, res) => {
    const p = z
      .object({
        path: z.string().min(1).max(300),
        chunk: z.coerce.number().int().min(1).max(10000),
        hash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
      })
      .strict()
      .safeParse(req.query);
    if (!p.success) throw new PublicError(400, "Nguồn tài liệu không hợp lệ.");
    const entries = rag.getChunks(p.data.path),
      entry = entries[p.data.chunk - 1];
    if (!entry)
      throw new PublicError(
        404,
        "Đoạn nguồn không còn tồn tại. Tài liệu có thể đã thay đổi hoặc bị xoá.",
      );
    if (p.data.hash && p.data.hash !== entry.hash)
      throw new PublicError(
        409,
        "Đoạn nguồn đã thay đổi sau câu trả lời này. Hãy tra cứu lại để nhận trích dẫn cập nhật.",
      );
    res.json({ ...entry, totalChunks: entries.length });
  });
  return router;
}
