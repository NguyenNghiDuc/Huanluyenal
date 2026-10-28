import { it, expect } from "vitest";
import { temporaryHistory } from "../temporary";
it("private history retains the latest user turn, bounds UTF-8 bytes and excludes display metadata", () => {
  const messages = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    role: i % 2 ? "assistant" : "user",
    content: "Nội dung riêng tư ".repeat(150),
    sources: [{ source: "notes.md" }],
  }));
  const result = temporaryHistory(messages, "Tin nhắn mới");
  expect(result.length).toBeLessThanOrEqual(40);
  expect(result[0].role).toBe("user");
  expect(result.at(-1).content).toBe("Tin nhắn mới");
  expect(
    new TextEncoder().encode(
      JSON.stringify({ temporary: true, messages: result }),
    ).length,
  ).toBeLessThan(55000);
  expect(result.every((m) => Object.keys(m).length === 2)).toBe(true);
});
it("private regeneration reuses the last user message without duplicating it", () => {
  const messages = [
    { role: "user", content: "Hỏi" },
    { role: "assistant", content: "Đáp" },
  ];
  expect(temporaryHistory(messages, null, true)).toEqual([
    { role: "user", content: "Hỏi" },
  ]);
});
