import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import Markdown from "../components/Markdown";
import CopyButton from "../components/CopyButton";
import { readSession, saveSession } from "../session";
import { matchRanges } from "../search";
afterEach(() => {
  cleanup();
  localStorage.clear();
});
describe("rich chat", () => {
  it("renders headings, GFM tables, inline and highlighted fenced code", () => {
    const { container } = render(
      <Markdown
        content={
          "## Tiêu đề\n\n**Đậm** và `inline`.\n\n```javascript\nconst x = 1;\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |"
        }
      />,
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Tiêu đề",
    );
    expect(container.querySelector("strong").textContent).toBe("Đậm");
    expect(screen.getByRole("table")).toBeTruthy();
    expect(container.querySelector(".hljs-keyword")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sao chép mã" })).toBeTruthy();
  });
  it("blocks raw HTML, executable links and remote image loading; escapes code", () => {
    const content =
      '<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>\n\n[evil](javascript:alert%281%29)\n\n![tracker](https://evil.test/track)\n\n```html\n<img src=x onerror="alert(1)">\n```';
    const { container } = render(<Markdown content={content} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(
      [...container.querySelectorAll("a")].some((a) =>
        a.href.startsWith("javascript:"),
      ),
    ).toBe(false);
    expect(container.querySelector("pre").textContent).toContain("<img src=x");
    for (const link of container.querySelectorAll("a"))
      expect(link.rel).toContain("noopener");
  });
  it("handles unfinished fences, unsupported languages and very long code", () => {
    const { container, rerender } = render(
      <Markdown content={"```unknown\n<script>"} />,
    );
    expect(container.querySelector("pre").textContent).toBe("<script>");
    expect(container.querySelector("script")).toBeNull();
    rerender(<Markdown content={"```js\n" + "x".repeat(31000) + "\n```"} />);
    expect(container.querySelector("pre").textContent.length).toBe(31000);
  });
  it("copies exactly the original text and confirms success", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(
      <CopyButton text={"**Nội dung**\nDòng 2"} label="Sao chép câu trả lời" />,
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("**Nội dung**\nDòng 2"),
    );
    await screen.findByRole("button", { name: "Sao chép câu trả lời" });
    expect(screen.getByRole("status").textContent).toBe("Đã sao chép");
  });
  it("reports clipboard failures without crashing", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    Object.defineProperty(document, "execCommand", {
      value: () => false,
      configurable: true,
    });
    render(<CopyButton text="x" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Không sao chép được",
      ),
    );
    expect(document.querySelectorAll("textarea").length).toBe(0);
  });
});
describe("session and search", () => {
  it("remembers only a valid conversation ID and page", () => {
    const id = "d7ac7aaa-9204-49dc-8ca6-f5d9f6936ec8";
    saveSession(id, "chat");
    expect(readSession()).toEqual({ conversationId: id, page: "chat" });
    localStorage.setItem("al.session.v1", "bad json");
    expect(readSession()).toEqual({ conversationId: null, page: "chat" });
    localStorage.setItem(
      "al.session.v1",
      JSON.stringify({ conversationId: "<script>", page: "evil" }),
    );
    expect(readSession()).toEqual({ conversationId: null, page: "chat" });
  });
  it("survives unavailable browser storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => saveSession(null, "chat")).not.toThrow();
    expect(readSession()).toEqual({ conversationId: null, page: "chat" });
  });
  it("highlights Vietnamese matches including decomposed accents and literal symbols", () => {
    expect(matchRanges("Học ĐẠI học", "dai")).toEqual([[4, 7]]);
    expect(matchRanges("Tiếng Việt", "tieng")).toEqual([[0, 6]]);
    expect(matchRanges("100% + _", "%")).toEqual([[3, 4]]);
    expect(matchRanges("abc", "")).toEqual([]);
  });
});
