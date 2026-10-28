import React, { useState, useEffect, useRef } from "react";
import Markdown from "./Markdown";
import CopyButton from "./CopyButton";
export default function Chat({
  title,
  temporary,
  onToggleTemporary,
  onRemember,
  onOpenSource,
  focusMessageId,
  messages,
  busy,
  onSend,
  onStop,
  onRegenerate,
  status,
  sources,
}) {
  const [input, setInput] = useState("");
  const bottom = useRef();
  const container = useRef();
  const pinned = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  useEffect(() => {
    if (!focusMessageId) return;
    const target = document.getElementById("message-" + focusMessageId);
    if (target) {
      pinned.current = false;
      setAtBottom(false);
      target.scrollIntoView({ block: "center", behavior: "instant" });
      target.focus({ preventScroll: true });
    }
  }, [focusMessageId]);
  useEffect(() => {
    if (pinned.current && !focusMessageId)
      bottom.current?.scrollIntoView({ block: "end", behavior: "instant" });
  }, [messages, status, focusMessageId]);
  function scrollLatest() {
    pinned.current = true;
    setAtBottom(true);
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }
  function onScroll() {
    const el = container.current;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    pinned.current = near;
    setAtBottom(near);
  }

  const submit = (e) => {
    e.preventDefault();
    if (input.trim() && !busy) {
      onSend(input.trim());
      setInput("");
    }
  };
  return (
    <>
      <header>
        <div>
          <b>al</b>
          <span className="chat-title" title={title}>
            {title || "Luôn sẵn sàng lắng nghe"}
          </span>
        </div>
        <div className="chat-header-actions">
          <button
            className={"privacy-switch " + (temporary ? "active" : "")}
            type="button"
            role="switch"
            aria-checked={temporary}
            aria-label="Chat không lưu"
            disabled={busy}
            onClick={onToggleTemporary}
          >
            {temporary ? "◈ Đang chat không lưu" : "◇ Chat không lưu"}
          </button>
          <span className="badge">Claude Sonnet 4.6</span>
        </div>
      </header>
      {temporary && (
        <div className="privacy-banner">
          <strong>Cuộc trò chuyện tạm thời</strong>
          <span>
            Không lưu lịch sử, không đọc/ghi trí nhớ, không tạo kiến thức mới.
            Nội dung vẫn được gửi tới dịch vụ AI để trả lời. Tải lại hoặc rời
            chat sẽ xoá nội dung này.
          </span>
        </div>
      )}
      <section
        className="messages"
        ref={container}
        onScroll={onScroll}
        aria-label="Nội dung hội thoại"
      >
        {!messages.length && (
          <div className="welcome">
            <div className="orb">al</div>
            <h1>Chào bạn, mình là al.</h1>
            <p>Một nơi để hỏi, suy nghĩ và cùng tìm lời giải.</p>
            <div className="suggestions">
              {[
                "Giúp tôi lập kế hoạch học tập",
                "Giải thích một khái niệm khó",
                "Cùng tôi phát triển một ý tưởng",
              ].map((s) => (
                <button disabled={busy} key={s} onClick={() => onSend(s)}>
                  {s} ↗
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <article
            id={m.id ? "message-" + m.id : undefined}
            tabIndex={-1}
            key={m.id || "local" + i}
            className={
              m.role + (m.id === focusMessageId ? " search-match" : "")
            }
          >
            <small>{m.role === "user" ? "Bạn" : "al"}</small>
            {m.content ? (
              m.role === "assistant" ? (
                <Markdown content={m.content} onOpenSource={onOpenSource} />
              ) : (
                <div className="plain-message">{m.content}</div>
              )
            ) : (
              <p>{busy ? "Đang suy nghĩ…" : "Chưa có nội dung."}</p>
            )}
            {m.content && (
              <div className="message-actions">
                {!temporary && !busy && m.id && (
                  <button
                    className="copy-button"
                    type="button"
                    onClick={() => onRemember(m)}
                  >
                    Ghi nhớ điều này
                  </button>
                )}
                <CopyButton
                  text={m.content}
                  label={
                    m.role === "assistant"
                      ? "Sao chép câu trả lời"
                      : "Sao chép tin nhắn"
                  }
                />
              </div>
            )}

            {!!m.sources?.length && (
              <div className="citation-list" aria-label="Nguồn của câu trả lời">
                {m.sources.map((s, index) => (
                  <button
                    className="citation"
                    key={s.source + s.chunk}
                    onClick={() => onOpenSource(s)}
                  >
                    [{index + 1}] {s.name || s.source}
                    {s.page ? ` · trang ${s.page}` : ""} · đoạn {s.chunk}
                  </button>
                ))}
              </div>
            )}
            {m.status === "interrupted" && (
              <small>Đã dừng hoặc bị gián đoạn</small>
            )}
          </article>
        ))}
        {!!sources?.length && !messages.at(-1)?.sources?.length && (
          <div className="sources">
            Đoạn tài liệu tham khảo:
            {sources.map((s) => (
              <button
                className="citation"
                key={s.source + s.chunk}
                onClick={() => onOpenSource(s)}
              >
                {s.name || s.source}
                {s.page ? ` · trang ${s.page}` : ""} · đoạn {s.chunk}
              </button>
            ))}
          </div>
        )}
        {busy && status && (
          <p className="status" role="status">
            {status}
          </p>
        )}
        <div ref={bottom} />
      </section>
      {!atBottom && messages.length > 0 && (
        <button className="jump-latest" type="button" onClick={scrollLatest}>
          ↓ Tin nhắn mới nhất
        </button>
      )}
      <div className="composer">
        <form onSubmit={submit}>
          <textarea
            aria-label="Tin nhắn"
            value={input}
            maxLength={8000}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                submit(e);
              }
            }}
            placeholder="Nhắn cho al…"
          />
          <div className="composer-actions">
            <small>{input.length}/8000 · Shift + Enter xuống dòng</small>
            <div>
              {busy ? (
                <button type="button" onClick={onStop}>
                  ■ Dừng
                </button>
              ) : (
                <>
                  <button
                    className="secondary"
                    type="button"
                    disabled={!messages.some((m) => m.role === "user")}
                    onClick={onRegenerate}
                  >
                    ↻ Tạo lại
                  </button>
                  <button disabled={!input.trim()}>Gửi ↑</button>
                </>
              )}
            </div>
          </div>
        </form>
        <p className="hint">
          al có thể mắc lỗi. Hãy kiểm tra thông tin quan trọng.
        </p>
      </div>
    </>
  );
}
