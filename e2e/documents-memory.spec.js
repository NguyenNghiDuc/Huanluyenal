import { test, expect } from "./fixtures/test.js";
import { makePdf } from "./fixtures/pdf.js";
test("upload PDF, read the correct page, open and restore citations, then remove source", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "▤ Kiến thức", exact: true }).click();
  await page.getByLabel("Tải tài liệu", { exact: true }).setInputFiles({
    name: "Atlas.pdf",
    mimeType: "application/pdf",
    buffer: makePdf(["Atlas planning first page", "Orion project second page"]),
  });
  const doc = page.locator(".document-card").filter({ hasText: "Atlas.pdf" });
  await expect(doc.getByText("Sẵn sàng", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await doc.getByRole("button", { name: "Xem nội dung" }).click();
  const dialog = page.getByRole("dialog", { name: "Nguồn tham khảo" });
  await expect(dialog).toContainText("Atlas planning first page");
  await dialog.getByRole("button", { name: "Đoạn sau →" }).click();
  await expect(dialog).toContainText("Orion project second page");
  await expect(dialog).toContainText("Trang 2");
  await dialog.getByRole("button", { name: "Đóng cửa sổ" }).click();
  await page
    .getByRole("button", { name: "＋ Cuộc trò chuyện mới", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Tin nhắn", exact: true })
    .fill("Orion project second page");
  await page.getByRole("button", { name: "Gửi ↑", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "↻ Tạo lại", exact: true }),
  ).toBeVisible();
  const citation = page
    .locator("article.assistant .citation")
    .filter({ hasText: "Atlas.pdf" })
    .first();
  await expect(citation).toContainText("trang 2");
  await citation.click();
  await expect(page.getByRole("dialog")).toContainText(
    "Orion project second page",
  );
  await page.getByRole("button", { name: "Đóng cửa sổ" }).click();
  await page.reload();
  await expect(
    page
      .locator("article.assistant .citation")
      .filter({ hasText: "Atlas.pdf" })
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "▤ Kiến thức", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .locator(".document-card")
    .filter({ hasText: "Atlas.pdf" })
    .getByRole("button", { name: "Xoá tài liệu" })
    .click();
  await expect(
    page.locator(".document-card").filter({ hasText: "Atlas.pdf" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "◌ Trò chuyện", exact: true }).click();
  await page
    .locator("article.assistant .citation")
    .filter({ hasText: "Atlas.pdf" })
    .first()
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "không còn tồn tại",
  );
});
test("manual memory, conflict review and explicit controls work on web", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Tin nhắn", exact: true })
    .fill("Tôi sống ở Hà Nội.");
  await page.getByRole("button", { name: "Gửi ↑", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "↻ Tạo lại", exact: true }),
  ).toBeVisible();
  await page
    .locator("article.user")
    .getByRole("button", { name: "Ghi nhớ điều này", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Ghi nhớ điều này" });
  await expect(
    dialog.getByRole("textbox", { name: "Nội dung ký ức" }),
  ).toHaveValue("Tôi sống ở Hà Nội.");
  await dialog.getByRole("button", { name: "Lưu ký ức", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "◇ Trí nhớ", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Sự thật đã ghi nhớ" }),
  ).toHaveValue("Tôi sống ở Hà Nội.");
  await page
    .getByRole("button", { name: "＋ Thêm ký ức", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Ghi nhớ điều này" });
  await dialog
    .getByRole("textbox", { name: "Nội dung ký ức" })
    .fill("Tôi sống ở Đà Nẵng.");
  await dialog.getByRole("button", { name: "Lưu ký ức", exact: true }).click();
  await expect(page.locator(".conflict-card")).toContainText(
    "Tôi sống ở Hà Nội.",
  );
  await expect(page.locator(".conflict-card")).toContainText(
    "Tôi sống ở Đà Nẵng.",
  );
  await page
    .getByRole("button", { name: "Dùng thông tin mới", exact: true })
    .click();
  await expect(page.locator(".conflict-card")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Sự thật đã ghi nhớ" }),
  ).toHaveValue("Tôi sống ở Đà Nẵng.");
  await page
    .getByRole("checkbox", { name: "Tự ghi nhớ khi trò chuyện", exact: false })
    .uncheck();
  await expect(
    page.getByRole("checkbox", {
      name: "Tự ghi nhớ khi trò chuyện",
      exact: false,
    }),
  ).not.toBeChecked();
  await page.reload();
  await expect(
    page.getByRole("checkbox", {
      name: "Tự ghi nhớ khi trò chuyện",
      exact: false,
    }),
  ).not.toBeChecked();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Xoá ký ức", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Sự thật đã ghi nhớ" }),
  ).toHaveCount(0);
});
test("temporary mode stays out of history and forgets its content after reload", async ({
  page,
  request,
}) => {
  const before = await (await request.get("/api/conversations")).json(),
    memories = await (await request.get("/api/memories")).json();
  await page.goto("/");
  await page.getByRole("switch", { name: "Chat không lưu" }).click();
  await expect(
    page.getByText("Cuộc trò chuyện tạm thời", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Tin nhắn", exact: true })
    .fill("PRIVATE_NOT_SAVED_123");
  await page.getByRole("button", { name: "Gửi ↑", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "↻ Tạo lại", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ghi nhớ điều này", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("article.user")).toContainText(
    "PRIVATE_NOT_SAVED_123",
  );
  expect((await (await request.get("/api/conversations")).json()).length).toBe(
    before.length,
  );
  expect(await (await request.get("/api/memories")).json()).toEqual(memories);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Chào bạn, mình là al." }),
  ).toBeVisible();
  await expect(page.getByText("PRIVATE_NOT_SAVED_123")).toHaveCount(0);
  await expect(
    page.getByRole("switch", { name: "Chat không lưu" }),
  ).toHaveAttribute("aria-checked", "false");
});
test("drag and drop preserves Vietnamese filenames and reports unsupported files", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "▤ Kiến thức", exact: true }).click();
  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["Kiến thức về cây cà phê."], "ghi-chú.md", {
        type: "text/markdown",
      }),
    );
    return transfer;
  });
  await page.locator(".upload-zone").dispatchEvent("drop", { dataTransfer });
  const doc = page.locator(".document-card").filter({ hasText: "ghi-chú.md" });
  await expect(doc.getByText("Sẵn sàng", { exact: true })).toBeVisible();
  await doc.getByRole("button", { name: "Xem nội dung" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Kiến thức về cây cà phê.",
  );
  await page.getByRole("button", { name: "Đóng cửa sổ" }).click();
  await page
    .getByLabel("Tải tài liệu", { exact: true })
    .setInputFiles({
      name: "unsupported.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("binary"),
    });
  await expect(page.getByRole("alert")).toContainText(
    "Chỉ hỗ trợ PDF, Markdown và TXT.",
  );
});
