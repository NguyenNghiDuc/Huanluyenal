import {
  readdirSync,
  readFileSync,
  lstatSync,
  realpathSync,
  statSync,
} from "node:fs";
import { resolve, relative, isAbsolute, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
export const KNOWLEDGE_ROOT = fileURLToPath(
  new URL("../knowledge/", import.meta.url),
);
export function safeKnowledgePath(root, path) {
  if (
    typeof path !== "string" ||
    !path ||
    path.includes("\0") ||
    isAbsolute(path)
  )
    throw new Error("Đường dẫn không hợp lệ.");
  const base = realpathSync(root),
    target = resolve(base, path),
    rel = relative(base, target);
  if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel))
    throw new Error("Chỉ được đọc trong knowledge/.");
  // Reject symlinks at every path segment, even those pointing inside the root.
  let current = base;
  for (const part of rel.split(sep)) {
    if (part.startsWith("."))
      throw new Error("Không cho phép file hoặc thư mục ẩn.");
    current = resolve(current, part);
    if (lstatSync(current).isSymbolicLink())
      throw new Error("Không cho phép symlink.");
  }
  if (
    ![".md", ".txt"].includes(extname(target).toLowerCase()) ||
    !statSync(target).isFile()
  )
    throw new Error("Chỉ hỗ trợ file .md và .txt.");
  return target;
}
export function tokenize(text) {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/đ/g, "d")
      .match(/[\p{L}\p{N}]+/gu) || []
  );
}
export function chunks(text, size = 500, overlap = 80) {
  const result = [];
  for (let start = 0; start < text.length; start += size - overlap) {
    const content = text.slice(start, start + size).trim();
    if (content) result.push(content);
    if (start + size >= text.length) break;
  }
  return result;
}
export function createRag(
  root = KNOWLEDGE_ROOT,
  { metadataForSource = () => null } = {},
) {
  let fingerprint = "",
    documents = [],
    df = new Map(),
    avgLength = 1,
    files = [];
  function refresh() {
    const found = [];
    let visited = 0;
    function walk(dir, depth = 0) {
      if (depth > 8) return;
      for (const entry of readdirSync(dir, { withFileTypes: true }).sort(
        (a, b) => a.name.localeCompare(b.name),
      )) {
        if (++visited > 2000)
          throw new Error("Kho kiến thức vượt quá 2000 mục.");
        if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
        const path = resolve(dir, entry.name);
        if (entry.isDirectory()) walk(path, depth + 1);
        else if (
          entry.isFile() &&
          [".md", ".txt"].includes(extname(entry.name).toLowerCase())
        ) {
          const st = statSync(path);
          if (st.size <= 262144)
            found.push({
              path,
              source: relative(root, path).split(sep).join("/"),
              mtime: st.mtimeMs,
              size: st.size,
            });
        }
      }
    }
    walk(root);
    if (found.length > 500) throw new Error("Kho kiến thức vượt quá 500 file.");
    const key = JSON.stringify(found.map((f) => [f.source, f.mtime, f.size]));
    if (key === fingerprint) return;
    const next = [];
    for (const file of found) {
      const text = readFileSync(safeKnowledgePath(root, file.source), "utf8");
      const metadata = metadataForSource(file.source);
      const chunkList = metadata?.pages?.length
        ? metadata.pages.flatMap((p) =>
            chunks(text.slice(p.start_offset, p.end_offset)).map((content) => ({
              content,
              page: p.page,
            })),
          )
        : chunks(text).map((content) => ({ content }));
      chunkList.forEach(({ content, page }, index) => {
        const tokens = tokenize(content),
          tf = new Map();
        for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
        next.push({
          ...(metadata
            ? {
                documentId: metadata.documentId,
                name: metadata.name,
                page: page || 1,
              }
            : {}),
          source: file.source,
          chunk: index + 1,
          content,
          hash: createHash("sha256").update(content).digest("hex"),
          length: tokens.length,
          tf,
        });
      });
      if (next.length > 10000)
        throw new Error("Kho kiến thức vượt quá 10000 đoạn.");
    }
    documents = next;
    df = new Map();
    for (const doc of documents)
      for (const token of doc.tf.keys())
        df.set(token, (df.get(token) || 0) + 1);
    avgLength =
      documents.reduce((s, d) => s + d.length, 0) / (documents.length || 1) ||
      1;
    files = found.map((f) => ({ source: f.source, size: f.size }));
    fingerprint = key;
  }
  function search(query, limit = 3) {
    refresh();
    const terms = [...new Set(tokenize(query))];
    const scored = documents.map((doc) => {
      let score = 0;
      for (const term of terms) {
        const tf = doc.tf.get(term) || 0;
        if (!tf) continue;
        const idf = Math.log(
          1 +
            (documents.length - (df.get(term) || 0) + 0.5) /
              ((df.get(term) || 0) + 0.5),
        );
        score +=
          (idf * (tf * 2.5)) /
          (tf + 1.5 * (0.25 + (0.75 * doc.length) / avgLength));
      }
      return {
        ...(doc.documentId
          ? { documentId: doc.documentId, name: doc.name, page: doc.page }
          : {}),
        source: doc.source,
        chunk: doc.chunk,
        content: doc.content,
        hash: doc.hash,
        score,
      };
    });
    return scored
      .filter((d) => d.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(3, limit));
  }
  return {
    search,
    getChunks(source) {
      refresh();
      return documents
        .filter((d) => d.source === source)
        .map(({ tf, length, ...d }) => d);
    },
    refresh,
    info() {
      refresh();
      return { files, chunks: documents.length };
    },
    root,
  };
}
export function ragContext(sources) {
  return sources.length
    ? '\n\n<knowledge untrusted="true">\n' +
        JSON.stringify(
          sources.map(
            ({ source, chunk, content, documentId, name, page, hash }) => ({
              source,
              chunk,
              content,
              documentId,
              name,
              page,
              citationUrl:
                "/api/knowledge/source?path=" +
                encodeURIComponent(source) +
                "&chunk=" +
                chunk +
                (hash ? "&hash=" + hash : ""),
            }),
          ),
        ) +
        "\n</knowledge>\nKhi sử dụng kiến thức trên, trích dẫn bằng liên kết Markdown [nguồn: tên file, đoạn N](citationUrl) với đúng citationUrl của đoạn đó."
    : "";
}
