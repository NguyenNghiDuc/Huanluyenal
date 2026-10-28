import React from "react";
import Highlight from "./Highlight";
export default function Sidebar({
  items,
  selected,
  busy,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onPage,
  page,
  query,
  onQuery,
  search,
}) {
  return (
    <aside aria-label="Thanh bên">
      <div className="brand">
        <span className="logo">al</span>
        <div>
          Trợ lý của bạn<small>Ghi nhớ · Tìm hiểu · Đồng hành</small>
        </div>
      </div>
      <button className="new" disabled={busy} onClick={onNew}>
        ＋ Cuộc trò chuyện mới
      </button>
      <nav aria-label="Điều hướng">
        {[
          ["chat", "◌ Trò chuyện"],
          ["memories", "◇ Trí nhớ"],
          ["knowledge", "▤ Kiến thức"],
          ["learned", "✓ Duyệt kiến thức"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-current={page === key ? "page" : undefined}
            className={page === key ? "selected" : ""}
            onClick={() => onPage(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="history-heading">
        <p className="label">HỘI THOẠI</p>
        <span>{items.length}</span>
      </div>
      <div className="history-search">
        <input
          type="search"
          aria-label="Tìm lịch sử hội thoại"
          placeholder="Tìm trong lịch sử…"
          value={query}
          maxLength={200}
          onChange={(e) => onQuery(e.target.value)}
        />
        {query && (
          <button aria-label="Xoá tìm kiếm" onClick={() => onQuery("")}>
            ×
          </button>
        )}
      </div>
      <div className="conversation-list" aria-busy={search.loading}>
        {search.loading ? (
          <p className="search-notice" role="status">
            Đang tìm kiếm…
          </p>
        ) : search.error ? (
          <p className="search-notice" role="alert">
            {search.error}
          </p>
        ) : !items.length ? (
          <p className="search-notice" role="status">
            {search.searching
              ? "Không tìm thấy hội thoại phù hợp."
              : "Chưa có cuộc trò chuyện nào."}
          </p>
        ) : (
          items.map((item) => (
            <div
              className={
                "conversation " + (selected === item.id ? "selected" : "")
              }
              key={item.id}
            >
              <button
                className="conversation-open"
                disabled={busy}
                onClick={() => onSelect(item)}
                title={item.title}
                aria-current={selected === item.id ? "true" : undefined}
              >
                <span className="conversation-title">
                  <Highlight text={item.title} query={query} />
                </span>
                {search.searching && item.snippet && (
                  <span className="conversation-snippet">
                    <Highlight text={item.snippet} query={query} />
                  </span>
                )}
              </button>
              <button
                aria-label={"Đổi tên " + item.title}
                disabled={busy}
                onClick={() => onRename(item)}
              >
                ✎
              </button>
              <button
                aria-label={"Xoá " + item.title}
                disabled={busy}
                onClick={() => onDelete(item)}
              >
                ×
              </button>
            </div>
          ))
        )}
        {search.searching && items.length === 100 && (
          <p className="search-notice">
            Hiển thị 100 kết quả mới nhất. Thêm từ khoá để thu hẹp.
          </p>
        )}
      </div>
      <footer>
        <span className="dot" /> al · Không gian cá nhân
      </footer>
    </aside>
  );
}
