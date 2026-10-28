import { test, expect } from "./fixtures/test.js";
const work = "00000000-0000-4000-8000-000000000002";
const message = (page) =>
  page.getByRole("textbox", { name: "Tin nhắn", exact: true });
async function send(page, text) {
  await message(page).fill(text);
  await page.getByRole("button", { name: "Gửi ↑", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "↻ Tạo lại", exact: true }),
  ).toBeVisible();
}
test("workspace switching isolates history and restores each selected conversation on reload", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(message(page)).toBeVisible();
  await send(page, "PERSONAL CHAT ONLY");
  await page
    .getByRole("combobox", { name: "Không gian làm việc", exact: true })
    .selectOption(work);
  await expect(
    page.getByRole("heading", { name: "Chào bạn, mình là al." }),
  ).toBeVisible();
  await expect(page.locator(".conversation-title")).toHaveCount(0);
  await send(page, "WORK CHAT ONLY");
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Không gian làm việc", exact: true }),
  ).toHaveValue(work);
  await expect(page.locator("article.user")).toContainText("WORK CHAT ONLY");
  await page
    .getByRole("combobox", { name: "Không gian làm việc", exact: true })
    .selectOption("personal");
  await expect(page.locator("article.user")).toContainText(
    "PERSONAL CHAT ONLY",
  );
  await expect(
    page.locator(".conversation-title", { hasText: "WORK CHAT ONLY" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("workspace creation, persona settings, archive and restore work on web", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "⚙ Không gian", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Tên không gian mới", exact: true })
    .fill("Nghiên cứu riêng");
  await page
    .getByRole("button", { name: "Tạo không gian", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Không gian làm việc", exact: true }),
  ).toHaveText(/Nghiên cứu riêng/);
  await send(page, "Nghiên cứu được giữ lại");
  await page.getByRole("button", { name: "⚙ Không gian", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Persona riêng", exact: true })
    .fill("Giải thích bằng ví dụ thực hành.");
  await page.getByRole("button", { name: "Lưu cấu hình", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu cấu hình");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Persona riêng", exact: true }),
  ).toHaveValue("Giải thích bằng ví dụ thực hành.");
  const card = page
    .locator(".card")
    .filter({ has: page.getByText("Nghiên cứu riêng", { exact: true }) });
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Lưu trữ không gian" }).click();
  await expect(
    page.getByRole("combobox", { name: "Không gian làm việc", exact: true }),
  ).toHaveValue("personal");
  await page.getByRole("button", { name: "⚙ Không gian", exact: true }).click();
  const archived = page
    .locator(".card")
    .filter({ has: page.getByText("Nghiên cứu riêng", { exact: true }) });
  await archived
    .getByRole("button", { name: "Khôi phục", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Không gian làm việc", exact: true })
    .selectOption({ label: "Nghiên cứu riêng" });
  await page.getByRole("button", { name: "◌ Trò chuyện", exact: true }).click();
  await expect(page.locator("article.user")).toContainText(
    "Nghiên cứu được giữ lại",
  );
});
test("conversation becomes a study plan with editable tasks, due dates, progress and exports", async ({
  page,
}) => {
  await page.goto("/");
  await expect(message(page)).toBeVisible();
  await send(page, "Giúp tôi lập kế hoạch học Python");
  await page
    .locator("article.user")
    .getByRole("button", { name: "Tạo công việc / tài liệu", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Từ hội thoại thành hành động",
  });
  await dialog
    .getByRole("combobox", { name: "Loại nội dung" })
    .selectOption("study_plan");
  await dialog
    .getByRole("textbox", { name: "Yêu cầu thêm" })
    .fill("Chia thành bước có thể thực hiện.");
  await dialog.getByRole("button", { name: "Tạo bản nháp bằng AI" }).click();
  await expect(
    page.getByRole("heading", { name: "Công việc & bản nháp", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mở và chỉnh sửa", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Chi tiết công việc" });
  await expect(
    dialog.getByRole("heading", { name: "Tiến độ 0/2" }),
  ).toBeVisible();
  await dialog
    .getByRole("combobox", {
      name: "Trạng thái Đọc tài liệu nền tảng",
      exact: true,
    })
    .selectOption("done");
  await expect(
    dialog.getByRole("heading", { name: "Tiến độ 1/2" }),
  ).toBeVisible();
  await dialog.locator(".task-details summary").first().click();
  await dialog
    .getByRole("textbox", { name: "Tên việc", exact: true })
    .first()
    .fill("Đọc tài liệu chính thức");
  await dialog
    .getByLabel("Ngày hạn", { exact: true })
    .first()
    .fill("2027-09-21");
  await dialog.getByRole("button", { name: "Lưu việc", exact: true }).click();
  await expect(
    dialog.getByText("Đọc tài liệu chính thức", { exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("link", { name: "Xuất lịch .ics", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
  await dialog
    .getByRole("textbox", { name: "Công việc mới", exact: true })
    .fill("Tự kiểm tra kiến thức");
  await dialog.getByRole("button", { name: "Thêm việc", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "Tiến độ 1/3" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Đóng cửa sổ" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Mở và chỉnh sửa", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Tiến độ 1/3" }),
  ).toBeVisible();
});
test("document drafts are editable and external delivery only happens after explicit approval", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "☑ Công việc", exact: true }).click();
  await page
    .getByRole("button", { name: "＋ Tạo thủ công", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Tạo mục công việc" });
  await dialog
    .getByRole("combobox", { name: "Loại mục mới" })
    .selectOption("document");
  await dialog
    .getByRole("textbox", { name: "Tiêu đề mục mới" })
    .fill("Đề xuất dự án");
  await dialog
    .getByRole("button", { name: "Tạo bản nháp", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Chi tiết công việc" });
  await dialog
    .getByRole("textbox", { name: "Nội dung bản nháp", exact: true })
    .fill("## Mục tiêu\n\nTriển khai bản thử nghiệm.");
  await dialog
    .getByRole("button", { name: "Lưu nội dung", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Đã lưu nội dung");
  await dialog.getByRole("button", { name: "Xem trước Markdown" }).click();
  await expect(dialog.locator(".markdown h2")).toHaveText("Mục tiêu");
  await dialog
    .getByRole("button", { name: "Tạo yêu cầu gửi ra ngoài" })
    .click();
  await expect(
    page.getByRole("tab", { name: "Hộp chờ duyệt (1)" }),
  ).toHaveAttribute("aria-selected", "true");
  expect(await (await request.get("/api/__test/sends")).json()).toEqual([]);
  const row = page.locator(".outbox-card");
  await expect(row).toContainText("receiver.example.test");
  await row.locator("summary").click();
  await expect(row.locator("pre")).toContainText("Triển khai bản thử nghiệm.");
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Duyệt và gửi", exact: true }).click();
  await expect(row.getByText("Đã gửi", { exact: true })).toBeVisible();
  const sent = await (await request.get("/api/__test/sends")).json();
  expect(sent.length).toBe(1);
  expect(sent[0].payload.title).toBe("Đề xuất dự án");
  await expect(
    row.getByRole("button", { name: "Duyệt và gửi", exact: true }),
  ).toHaveCount(0);
});
test("task lists are isolated between workspaces and rejected requests never send", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "☑ Công việc", exact: true }).click();
  await page
    .getByRole("button", { name: "＋ Tạo thủ công", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Tạo mục công việc" });
  await dialog
    .getByRole("textbox", { name: "Tiêu đề mục mới" })
    .fill("Việc riêng cá nhân");
  await dialog
    .getByRole("button", { name: "Tạo bản nháp", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Chi tiết công việc" });
  await dialog
    .getByRole("textbox", { name: "Công việc mới" })
    .fill("Việc cần làm");
  await dialog.getByRole("button", { name: "Thêm việc", exact: true }).click();
  await expect(dialog.getByText("Việc cần làm", { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: "Tạo yêu cầu gửi ra ngoài" })
    .click();
  await page.getByRole("button", { name: "Từ chối gửi", exact: true }).click();
  await expect(
    page.locator(".outbox-card").getByText("Đã từ chối", { exact: true }),
  ).toBeVisible();
  expect(await (await request.get("/api/__test/sends")).json()).toEqual([]);
  await page
    .getByRole("combobox", { name: "Không gian làm việc", exact: true })
    .selectOption(work);
  await page.getByRole("button", { name: "☑ Công việc", exact: true }).click();
  await expect(page.locator(".artifact-card")).toHaveCount(0);
  await page.getByRole("tab", { name: "Hộp chờ duyệt (0)" }).click();
  await expect(page.locator(".outbox-card")).toHaveCount(0);
});
test("mobile workspace controls and task editor stay usable inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Không gian làm việc", exact: true })
    .selectOption(work);
  await page.getByRole("button", { name: "☑ Công việc", exact: true }).click();
  await page
    .getByRole("button", { name: "＋ Tạo thủ công", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Tạo mục công việc" });
  await dialog
    .getByRole("textbox", { name: "Tiêu đề mục mới" })
    .fill("Việc trên điện thoại");
  await dialog
    .getByRole("button", { name: "Tạo bản nháp", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Chi tiết công việc" });
  await dialog
    .getByRole("textbox", { name: "Công việc mới" })
    .fill("Đọc 10 trang sách");
  await dialog.getByRole("button", { name: "Thêm việc", exact: true }).click();
  await expect(
    dialog.getByText("Đọc 10 trang sách", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("combobox", {
      name: "Trạng thái Đọc 10 trang sách",
      exact: true,
    })
    .selectOption("done");
  await expect(
    dialog.getByRole("heading", { name: "Tiến độ 1/1" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Đóng cửa sổ" }).click();
  await expect(page.locator(".artifact-card")).toContainText(
    "1/1 việc hoàn tất",
  );
});
