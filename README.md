# al — Trợ lý AI cá nhân

[![CI](https://github.com/NguyenNghiDuc/Huanluyenal/actions/workflows/ci.yml/badge.svg)](https://github.com/NguyenNghiDuc/Huanluyenal/actions/workflows/ci.yml)

React + Vite, Express, SQLite (`better-sqlite3`), Anthropic SDK với model `claude-sonnet-4-6`. Cần Node.js **22.22.2+ hoặc 24.15+** (khuyến nghị 24 LTS, có file `.nvmrc`), npm và API key Anthropic có hạn mức.

## Cài và chạy

```bash
cd server
npm ci
cp .env.example .env
# Sửa .env: ANTHROPIC_API_KEY=key_của_bạn
npm start
```

Mở terminal thứ hai, từ thư mục gốc:

```bash
cd web
npm ci
npm run dev
```

Mở **http://localhost:5173**. Vite chuyển `/api` sang server ở `http://localhost:3001`. API key chỉ được đọc trong server; không đặt key vào `web/` hoặc biến `VITE_*`. Không commit `.env`.

Server mặc định chỉ lắng nghe `127.0.0.1:3001`. `WEB_ORIGIN` mặc định `http://localhost:5173`, phải trùng chính xác origin bạn mở (kể cả port). Nếu đổi port server, sửa đích proxy trong `web/vite.config.js`. Chỉ đặt `HOST=0.0.0.0` khi cần truy cập qua mạng; đây là ứng dụng cá nhân, cần bổ sung xác thực/HTTPS trước khi công khai.

## Sử dụng

- Chat truyền từng đoạn bằng SSE (`POST /api/chat`). **Dừng** huỷ request và giữ phần đã sinh; **Tạo lại** thay câu trả lời cuối, không nhân đôi tin nhắn người dùng. Mất kết nối có thể tải lại hội thoại để xem phần đã lưu.
- Câu trả lời hỗ trợ Markdown/GFM: tiêu đề, danh sách, bảng, trích dẫn, liên kết và khối mã tô màu (JavaScript/TypeScript, Python, JSON, Bash, CSS, HTML/XML, SQL, Markdown). Ngôn ngữ khác vẫn hiển thị mã thuần. Nút **Sao chép mã** chép riêng khối mã; **Sao chép câu trả lời** chép Markdown gốc. HTML thô bị bỏ qua, URL thực thi bị chặn; ảnh ngoài được hiển thị thành liên kết.
- Ô **Tìm trong lịch sử** tìm cả tiêu đề lẫn nội dung người dùng/trợ lý, không phân biệt hoa/thường hoặc dấu tiếng Việt. Kết quả có đoạn trích, bấm để mở đúng tin nhắn khớp gần nhất. Trả tối đa 100 kết quả mới nhất; tìm lại ngay khi đổi tên, xoá hoặc có tin nhắn mới.
- Tự khôi phục hội thoại và trang đang xem khi tải lại. Trình duyệt chỉ lưu ID hội thoại/trang trong `localStorage`; nội dung vẫn ở SQLite. Nếu hội thoại đã xoá, mở màn hình chat mới. Khi đang đọc tin cũ, chữ streaming không kéo bạn xuống; dùng **Tin nhắn mới nhất** để quay lại.
- Sidebar quản lý nhiều hội thoại: tạo mới, đổi tên (✎), xoá (×). Lịch sử lưu trong `data/al.sqlite` (WAL). Khi sao lưu, dừng server rồi sao chép cả `data/` và `knowledge/`.
- Đổi tên/giọng điệu/quy tắc trong `server/persona.md`; file được đọc mỗi lượt chat.
- Sau mỗi lượt trả lời hoàn tất, một lần gọi model riêng trích xuất tối đa 5 sự thật người dùng đã xác nhận. Không trích xuất từ lượt bị dừng/lỗi. Trang **Trí nhớ** cho xem/sửa/xoá; tối đa 200 ký ức, 40 mục cập nhật gần nhất được nạp vào prompt. Xoá hội thoại không xoá ký ức. Lỗi trích xuất có cảnh báo, không làm mất câu trả lời.
- Nút **Ghi nhớ điều này** dưới tin nhắn đã lưu mở hộp chỉnh sửa (tối đa 500 ký tự). Bạn cũng có thể thêm ký ức trực tiếp trong trang **Trí nhớ**. Hai lựa chọn riêng cho phép bật/tắt **tự ghi nhớ** và **dùng ký ức trong câu trả lời**.
- Ký ức có thể mâu thuẫn được giữ ở hàng chờ, chưa nạp vào prompt. Trang **Trí nhớ** cho chọn **Giữ ký ức cũ**, **Dùng thông tin mới**, hoặc **Giữ cả hai**. Model so sánh ngữ nghĩa khi trích xuất tự động và khi lưu thủ công có API key; kiểm tra cơ bản về nơi ở/tên/tuổi/nghề/phủ định vẫn hoạt động nếu không có API. Web thông báo khi so sánh ngữ nghĩa bị giới hạn. Việc phát hiện có thể chưa bao phủ mọi cách diễn đạt; bạn luôn có thể sửa/xoá. Thay đổi thủ công không bị tác vụ tự ghi nhớ đang chạy ghi đè.
- Bật **Chat không lưu** ở đầu khung chat để bắt đầu phiên tạm thời: lịch sử chỉ ở RAM của tab; không tạo hội thoại/tin nhắn, không đọc/cập nhật ký ức, không dùng tool đề xuất kiến thức. Vẫn có thể tra cứu tài liệu và dùng tool chỉ đọc. Tải lại/rời phiên sẽ mất nội dung; không thể khôi phục. Đây là chế độ không lưu **trong ứng dụng**; nội dung vẫn gửi đến Anthropic (và câu truy vấn gửi Brave nếu gọi tìm kiếm web), theo chính sách của nhà cung cấp.
- Trang **Duyệt kiến thức** chứa đề xuất của tool `propose_knowledge`. Sửa nội dung rồi duyệt để ghi file vào `knowledge/learned/<id>.md`, hoặc từ chối. Model không có tool duyệt hay ghi file. Đây là tích luỹ kiến thức có kiểm soát, không huấn luyện lại trọng số model.

Hội thoại, ký ức liên quan và các đoạn tài liệu sử dụng được gửi đến Anthropic để trả lời. Thêm `BRAVE_SEARCH_API_KEY` vào `server/.env` rồi khởi động lại để bật tool tìm kiếm web (câu truy vấn được gửi đến Brave).

## Tải tài liệu và tra cứu nguồn

Mở **Kho kiến thức**, kéo thả hoặc chọn một/nhiều file `.pdf`, `.md`, `.txt`. Web hiển thị tiến độ tải và trạng thái chờ → trích văn bản → lập chỉ mục → sẵn sàng. File lỗi có lý do, nút thử lại và xoá. Tài liệu đã sẵn sàng được dùng ngay trong RAG; không cần khởi động lại.

- Tối đa **10 MiB/file**, **200 trang PDF**, **256 KiB văn bản sau trích xuất**. TXT/Markdown phải là UTF-8. PDF chỉ chứa ảnh/scan cần OCR trước; PDF có mật khẩu cần mở khoá. Chưa tích hợp OCR.
- PDF được xử lý trong worker riêng, tối đa 2 tác vụ đồng thời, hàng chờ 20 tài liệu, timeout 30 giây/tác vụ. Nếu server dừng giữa chừng, lần chạy sau đánh dấu lỗi và cho thử lại từ bản gốc; file xử lý dở không đi vào RAG.
- Bản gốc ở `data/documents/`, văn bản dẫn xuất ở `knowledge/uploads/`, metadata/số trang ở SQLite. Các file tải lên bị loại khỏi git. Khi sao lưu, dừng server và sao chép cả `data/` lẫn `knowledge/`.
- Bấm nguồn dưới câu trả lời hoặc liên kết trích dẫn để mở đúng đoạn, số trang PDF, chuyển đoạn trước/sau và tải bản gốc. Nguồn được lưu cùng câu trả lời nên vẫn mở được sau reload. Kiểm tra hash ngăn việc hiển thị đoạn đã sửa như nguồn cũ; nếu tài liệu bị xoá/thay đổi, web báo rõ.
- Xoá tài liệu trên web xoá bản gốc và văn bản dẫn xuất khỏi RAG. Câu trả lời cũ vẫn giữ nội dung, nhưng nguồn đã xoá không còn mở được.

Vẫn có thể đặt file UTF-8 `.md`/`.txt` trực tiếp trong `knowledge/`, kể cả thư mục con. BM25 tự cập nhật khi file thay đổi. Đoạn dài khoảng 500 ký tự, chồng lấn 80; đoạn PDF không vượt qua ranh giới trang. Mỗi câu hỏi lấy tối đa 3 đoạn liên quan kèm nguồn.

Kho tối đa 500 file văn bản, 10.000 đoạn, độ sâu 8 thư mục. File trực tiếp lớn hơn 256 KiB bị bỏ qua. File ẩn/symlink không được lập chỉ mục; tool đọc file từ chối symlink và đường dẫn ngoài `knowledge/`.

## Thêm tool

Tạo `server/tools/my_tool.js`, export mặc định một object gồm:

- `name`, `description`, `input_schema` (JSON Schema gửi Anthropic).
- `schema` (Zod schema nghiêm ngặt để validate đầu vào).
- `async execute(input, context)` trả về dữ liệu JSON; context có `root`, `db`, `conversationId`, `signal` để huỷ tác vụ.

Import và thêm vào mảng trong `server/tools/index.js`, rồi khởi động lại. Xem `get_time.js` làm ví dụ hoàn chỉnh. Tool mặc định: `get_time`, `calculator` (parser số học, không `eval`), `read_file`, `propose_knowledge`; `web_search` chỉ được quảng bá khi có key. Agent thực thi tối đa 5 lượt tool, tối đa 8 tool mỗi lượt; sau đó buộc model trả lời không gọi thêm tool.

## Kiểm tra và CI

Từ thư mục gốc, cài công cụ kiểm thử (chỉ cần khi phát triển):

```bash
npm ci
npm ci --prefix server
npm ci --prefix web
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

`npm test` chạy test backend và frontend. E2E dùng server fixture riêng ở `e2e/fixtures/server.mjs`, SQLite/tài liệu tạm và model giả lập; không tiêu phí API hay chạm vào `data/` thật. Đóng server/web đang chạy trên port 3001/5173 trước khi chạy E2E. Nếu đã có Chromium hệ thống, có thể đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/đường/dẫn/chromium`.

GitHub Actions tự chạy khi push lên `main`, khi có pull request, hoặc bấm **Run workflow** tại [Actions](https://github.com/NguyenNghiDuc/Huanluyenal/actions/workflows/ci.yml). CI kiểm thử và build trên Node 22/24; một job riêng chạy Chromium để kiểm tra streaming, sao chép, tìm lịch sử, khôi phục trang, dừng/tạo lại, đổi tên/xoá, upload PDF/mở nguồn, quản lý ký ức, chat không lưu và giao diện mobile. Khi browser test lỗi, tải báo cáo/trace ở mục Artifacts. CI không cần API key và chỉ có quyền đọc mã nguồn.

Test backend bao phủ SSE, validation/CORS/rate limit, dữ liệu SQLite, persona, ký ức, BM25, tool loop, duyệt kiến thức và tìm lịch sử; có PDF thật hai trang, giới hạn upload, thử lại/khôi phục xử lý dở, nguồn bị thay đổi và tính riêng tư của chat tạm thời. Test frontend bao phủ Markdown an toàn, tô màu mã, clipboard, tiếng Việt và storage bị chặn. SDK Anthropic được kiểm tra với dữ liệu SSE trong test; cần key thật để kiểm tra câu trả lời từ API Anthropic.

Input tối đa 8000 ký tự, JSON body 64 KiB, giới hạn 120 request API/phút/IP và 15 lượt chat/phút/IP. Mỗi lượt chat có timeout tổng 90 giây; SDK timeout 60 giây, trích xuất trí nhớ 20 giây, so sánh ký ức thủ công 10 giây. Upload giới hạn riêng 10 lần/phút/IP. Lịch sử gửi model giới hạn 40 tin nhắn/60.000 ký tự gần nhất. Giới hạn rate mặc định dùng IP socket; khi triển khai sau proxy cần cấu hình `trust proxy` theo đúng hạ tầng.

## Cấu trúc

```text
server/       index.js, llm.js, db.js, memory.js, memory-routes.js,
              documents.js, pdf-worker.js, rag.js, learning.js,
              persona.md, tools/, test/, .env.example
web/src/      App.jsx, api.js, components/, session.js, search.js, test/, style.css
.github/      workflows/ci.yml
e2e/          kiểm thử Chromium và server fixture
knowledge/    .md/.txt, learned/ (đã duyệt), uploads/ (văn bản dẫn xuất)
data/         SQLite, documents/ (bản gốc), được loại khỏi git
```
