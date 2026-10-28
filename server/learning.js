import { randomUUID, createHash } from "node:crypto";
import {
  mkdirSync,
  lstatSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
export function propose(db, { title, content, reason }, conversationId) {
  const hash = createHash("sha256").update(content.trim()).digest("hex");
  const existing = db
    .prepare("SELECT id,status FROM learned_pending WHERE content_hash=?")
    .get(hash);
  if (existing)
    return { ...existing, message: "Nội dung đã được đề xuất trước đó." };
  if (
    db
      .prepare(
        "SELECT count(*) AS n FROM learned_pending WHERE status='pending'",
      )
      .get().n >= 100
  )
    throw new Error("Hàng đợi đã đầy.");
  const id = randomUUID();
  db.prepare(
    "INSERT INTO learned_pending(id,title,content,reason,content_hash,source_conversation_id) VALUES (?,?,?,?,?,?)",
  ).run(id, title, content, reason, hash, conversationId || null);
  return {
    id,
    status: "pending",
    message:
      "Đã gửi đề xuất; cần người dùng duyệt trên trang Duyệt kiến thức. Chưa ghi vào kho kiến thức.",
  };
}
export function approve(db, root, id, edits) {
  const proposal = db
    .prepare("SELECT * FROM learned_pending WHERE id=?")
    .get(id);
  if (!proposal) return { status: 404, error: "Không tìm thấy đề xuất." };
  if (proposal.status !== "pending")
    return { status: 409, error: "Đề xuất đã được xử lý." };
  const title = edits.title ?? proposal.title,
    content = edits.content ?? proposal.content;
  const base = realpathSync(root),
    dir = join(base, "learned");
  if (existsSync(dir) && lstatSync(dir).isSymbolicLink())
    throw new Error("Unsafe learned directory");
  mkdirSync(dir, { recursive: true });
  if (realpathSync(dir) !== dir) throw new Error("Unsafe learned directory");
  const file = join(dir, id + ".md");
  const text = `# ${title.replace(/[\r\n]/g, " ")}\n\n${content}\n\n---\nĐã được người dùng duyệt. Mã đề xuất: ${id}\n`;
  let created = false;
  try {
    if (existsSync(file)) {
      if (
        lstatSync(file).isSymbolicLink() ||
        readFileSync(file, "utf8") !== text
      )
        throw new Error("File conflict");
    } else {
      writeFileSync(file, text, { flag: "wx", mode: 0o600 });
      created = true;
    }
    db.prepare(
      "UPDATE learned_pending SET title=?,content=?,status='approved',approved_path=?,reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='pending'",
    ).run(title, content, "learned/" + id + ".md", id);
  } catch (error) {
    if (created) unlinkSync(file);
    throw error;
  }
  return { status: 200, ok: true, path: "learned/" + id + ".md" };
}
