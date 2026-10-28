// Test-only HTTP wrapper: each test gets fresh production routes and temporary data.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { createApp } from "../../server/index.js";
import { openDB, createConversation, addMessage } from "../../server/db.js";
let app,
  db,
  root,
  sent = [];
async function reset() {
  sent = [];
  if (app) {
    await app.locals.close();
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
  root = mkdtempSync(join(tmpdir(), "al-e2e-"));
  writeFileSync(join(root, "garden.md"), "Cà phê cần tưới nước hợp lý.");
  db = openDB(join(root, "test.sqlite"));
  const seeded = createConversation(db, "Ghi chú công việc");
  addMessage(
    db,
    seeded.id,
    "user",
    "Tôi đang tìm hiểu lập trình và cơ sở dữ liệu.",
  );
  addMessage(
    db,
    seeded.id,
    "assistant",
    "## SQLite\n\nCơ sở dữ liệu **nhỏ gọn**, dùng cho ứng dụng cá nhân.",
  );
  app = createApp({
    db,
    knowledgeRoot: root,
    documentsRoot: join(root, ".originals"),
    extract: async () => [],
    compareMemory: async () => ({ conflictsWith: [], checked: true }),
    workflowGenerate: async ({ kind }) => ({
      kind,
      title:
        kind === "document" ? "Bản nháp từ hội thoại" : "Kế hoạch từ hội thoại",
      summary: "Các bước để bạn xem và chỉnh sửa.",
      body: "## Mục tiêu\n\nHoàn thành các bước trong kế hoạch.",
      tasks:
        kind === "document"
          ? []
          : [
              {
                title: "Đọc tài liệu nền tảng",
                notes: "Ghi lại những điều cần làm rõ.",
                dueDate: null,
                priority: "normal",
              },
              {
                title: "Thực hành và tự đánh giá",
                notes: "Hoàn thành một bài tập nhỏ.",
                dueDate: null,
                priority: "normal",
              },
            ],
    }),
    externalConfig: () => ({
      url: "https://receiver.example.test/al",
      host: "receiver.example.test",
      label: "Hộp nhận thử nghiệm",
      hash: "fixture-destination",
    }),
    sendExternal: async ({ payload, idempotencyKey }) => {
      sent.push({ payload, idempotencyKey });
      return { ok: true };
    },
    generate: async ({ messages, onText, signal }) => {
      const last = messages.at(-1).content;
      if (last.includes("lỗi mạng")) throw new Error("Network error");
      const chunks = last.includes("chậm")
        ? ["Đang trả lời từng phần. ", "Nội dung tiếp theo."]
        : [
            "## Xin chào\n\nMình là **al**.\n\n",
            '```javascript\nconst greeting = "Xin chào";\nconsole.log(greeting);\n```\n\n',
            "| Mục | Trạng thái |\n| --- | --- |\n| Chat | Sẵn sàng |\n\n[Tham khảo](https://example.com)",
          ];
      for (const chunk of chunks) {
        onText(chunk);
        await delay(last.includes("chậm") ? 3000 : 100, undefined, { signal });
      }
    },
  });
}
await reset();
const server = createServer(async (req, res) => {
  if (req.url === "/api/__test/sends" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(sent));
  } else if (req.url === "/api/__test/reset" && req.method === "POST") {
    await reset();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{}");
  } else app(req, res);
});
server.listen(3001, "127.0.0.1", () => console.log("E2E fixture ready"));
let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  server.close(async () => {
    await app.locals.close();
    db.close();
    rmSync(root, { recursive: true, force: true });
    process.exit(0);
  });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
