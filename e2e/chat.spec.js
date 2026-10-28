import { test, expect } from "@playwright/test";
test("Markdown, code copying, regeneration and restoring the open conversation", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Chào bạn, mình là al." }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Tin nhắn", exact: true })
    .fill("Xin chào Markdown");
  await page.getByRole("button", { name: "Gửi ↑", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "■ Dừng", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "↻ Tạo lại", exact: true }),
  ).toBeVisible();
  await expect(page.locator("article.assistant h2")).toHaveText("Xin chào");
  await expect(page.locator(".hljs-keyword")).toContainText("const");
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: "Sao chép mã", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('const greeting = "Xin chào";\nconsole.log(greeting);');
  await page
    .getByRole("button", { name: "Sao chép câu trả lời", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("```javascript");
  await page.reload();
  await expect(page.locator("article.user")).toHaveText(/Xin chào Markdown/);
  await expect(page.locator("article.assistant h2")).toHaveText("Xin chào");
  await page.getByRole("button", { name: "↻ Tạo lại", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "↻ Tạo lại", exact: true }),
  ).toBeVisible();
  await expect(page.locator("article.user")).toHaveCount(1);
  await expect(page.locator("article.assistant")).toHaveCount(1);
  page.once("dialog", (d) => d.accept("Markdown và SQLite"));
  await page
    .getByRole("button", { name: "Đổi tên Xin chào Markdown", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Markdown và SQLite", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".chat-title")).toHaveText("Markdown và SQLite");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Xoá Markdown và SQLite", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Chào bạn, mình là al." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Chào bạn, mình là al." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("searches titles and message contents without accents, opens matching message", async ({
  page,
}) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "Tìm lịch sử hội thoại" });
  await search.fill("co so du lieu");
  await expect(page.locator(".conversation")).toHaveCount(1);
  await expect(page.locator(".conversation-snippet mark")).toHaveText(
    /cơ sở dữ liệu/i,
  );
  await page
    .getByRole("button", { name: /Ghi chú công việc/ })
    .first()
    .click();
  await expect(page.locator("article.search-match")).toContainText(
    /cơ sở dữ liệu/i,
  );
  await expect(page.locator("article.search-match")).toBeFocused();
  await search.fill("sqlite");
  await expect(page.locator(".conversation-snippet")).toContainText("SQLite");
  await page.locator(".conversation-open").click();
  await expect(page.locator("article.search-match")).toHaveClass(/assistant/);
  await search.fill("chắc chắn không tồn tại xyz");
  await expect(
    page.getByText("Không tìm thấy hội thoại phù hợp."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Xoá tìm kiếm" }).click();
  await expect(
    page.locator(".conversation-title", { hasText: "Ghi chú công việc" }),
  ).toBeVisible();
});
test("invalid or deleted saved conversations recover gracefully; other pages are remembered", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "al.session.v1",
      JSON.stringify({
        conversationId: "77777777-7777-4777-8777-777777777777",
        page: "chat",
      }),
    ),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Chào bạn, mình là al." }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("al.session.v1")).conversationId,
      ),
    )
    .toBe(null);
  await page.getByRole("button", { name: "◇ Trí nhớ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Trí nhớ của al" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Trí nhớ của al" }),
  ).toBeVisible();
});
test("stop keeps partial text; mobile layout stays inside viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Chào bạn, mình là al." }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Tin nhắn", exact: true })
    .fill("Trả lời chậm");
  await page.getByRole("button", { name: "Gửi ↑", exact: true }).click();
  await expect(page.locator("article.assistant")).toContainText(
    "Đang trả lời từng phần.",
  );
  await page.getByRole("button", { name: "■ Dừng", exact: true }).click();
  await expect(
    page.getByText("Đã dừng hoặc bị gián đoạn", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Tin nhắn", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(
    page.getByText("Đã dừng hoặc bị gián đoạn", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Xoá Trả lời chậm", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Chào bạn, mình là al." }),
  ).toBeVisible();
});
test("broken API response reports an error while the app stays usable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Chào bạn, mình là al." }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Tin nhắn", exact: true })
    .fill("lỗi mạng");
  await page.getByRole("button", { name: "Gửi ↑", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Không thể kết nối dịch vụ AI",
  );
  await expect(
    page.getByRole("button", { name: "↻ Tạo lại", exact: true }),
  ).toBeEnabled();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Xoá lỗi mạng", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Chào bạn, mình là al." }),
  ).toBeVisible();
});
