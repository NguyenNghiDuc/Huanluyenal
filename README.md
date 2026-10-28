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
- Sidebar quản lý nhiều hội thoại: tạo mới, đổi tên (✎), xoá (×). Lịch sử lưu trong `data/al.sqlite` (WAL). Khi sao lưu, dừng server rồi sao chép thư mục `data/`.
- Đổi tên/giọng điệu/quy tắc trong `server/persona.md`; file được đọc mỗi lượt chat.
- Sau mỗi lượt trả lời hoàn tất, một lần gọi model riêng trích xuất tối đa 5 sự thật người dùng đã xác nhận. Không trích xuất từ lượt bị dừng/lỗi. Trang **Trí nhớ** cho xem/sửa/xoá; tối đa 200 ký ức, 40 mục cập nhật gần nhất được nạp vào prompt. Xoá hội thoại không xoá ký ức. Lỗi trích xuất có cảnh báo, không làm mất câu trả lời.
- Trang **Duyệt kiến thức** chứa đề xuất của tool `propose_knowledge`. Sửa nội dung rồi duyệt để ghi file vào `knowledge/learned/<id>.md`, hoặc từ chối. Model không có tool duyệt hay ghi file. Đây là tích luỹ kiến thức có kiểm soát, không huấn luyện lại trọng số model.

Hội thoại, ký ức liên quan và các đoạn tài liệu sử dụng được gửi đến Anthropic để trả lời. Thêm `BRAVE_SEARCH_API_KEY` vào `server/.env` rồi khởi động lại để bật tool tìm kiếm web (câu truy vấn được gửi đến Brave).

## Thêm kiến thức

Đặt file UTF-8 `.md` hoặc `.txt` trong `knowledge/`, kể cả thư mục con. Không cần khởi động lại: BM25 tự lập lại chỉ mục khi file thay đổi. Đoạn dài 500 ký tự, chồng lấn 80, lấy tối đa 3 đoạn có điểm liên quan và kèm tên file/số đoạn trong prompt. Trang **Kho kiến thức** liệt kê file và số đoạn.

Giới hạn: 256 KiB/file (file lớn hơn bị bỏ qua), 500 file, 10.000 đoạn, độ sâu 8 thư mục. File ẩn và symlink bị bỏ qua; tool đọc file từ chối symlink và đường dẫn ngoài `knowledge/`.

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

GitHub Actions tự chạy khi push lên `main`, khi có pull request, hoặc bấm **Run workflow** tại [Actions](https://github.com/NguyenNghiDuc/Huanluyenal/actions/workflows/ci.yml). CI kiểm thử và build trên Node 22/24; một job riêng chạy Chromium để kiểm tra streaming, sao chép, tìm lịch sử, khôi phục trang, dừng/tạo lại, đổi tên/xoá và giao diện mobile. Khi browser test lỗi, tải báo cáo/trace ở mục Artifacts. CI không cần API key và chỉ có quyền đọc mã nguồn.

Test backend bao phủ SSE, validation/CORS/rate limit, dữ liệu SQLite, persona, ký ức, BM25, tool loop, duyệt kiến thức và tìm lịch sử. Test frontend bao phủ Markdown an toàn, tô màu mã, clipboard, tiếng Việt và storage bị chặn. SDK Anthropic được kiểm tra với dữ liệu SSE trong test; cần key thật để kiểm tra câu trả lời từ API Anthropic.

Input tối đa 8000 ký tự, JSON body 64 KiB, giới hạn 120 request API/phút/IP và 15 lượt chat/phút/IP. Mỗi lượt chat có timeout tổng 90 giây; SDK timeout 60 giây, trích xuất trí nhớ 20 giây. Lịch sử gửi model giới hạn 40 tin nhắn/60.000 ký tự gần nhất. Giới hạn rate mặc định dùng IP socket; khi triển khai sau proxy cần cấu hình `trust proxy` theo đúng hạ tầng.

## Cấu trúc

```text
server/       index.js, llm.js, db.js, memory.js, rag.js, learning.js,
              persona.md, tools/, test/, .env.example
web/src/      App.jsx, api.js, components/, session.js, search.js, test/, style.css
.github/      workflows/ci.yml
e2e/          kiểm thử Chromium và server fixture
knowledge/    .md/.txt, learned/ (nội dung đã duyệt)
data/         SQLite, được loại khỏi git
```
