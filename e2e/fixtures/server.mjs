// Test-only server: exercises the production routes/UI without paid API calls.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { createApp } from "../../server/index.js";
import { openDB, createConversation, addMessage } from "../../server/db.js";
const root = mkdtempSync(join(tmpdir(), "al-e2e-"));
writeFileSync(join(root, "garden.md"), "Cà phê cần tưới nước hợp lý.");
const db = openDB(join(root, "test.sqlite"));
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
const app = createApp({
  db,
  knowledgeRoot: root,
  extract: async () => [],
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
const server = app.listen(3001, "127.0.0.1", () =>
  console.log("E2E fixture ready"),
);
let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  server.close(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
    process.exit(0);
  });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
