import React, { useEffect, useState } from "react";
import { api } from "../api";
import MemoryEditor from "./MemoryEditor";
export default function Memories() {
  const [items, setItems] = useState([]),
    [conflicts, setConflicts] = useState([]),
    [settings, setSettings] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [adding, setAdding] = useState(false);
  const load = async () => {
    const [memories, pending, preferences] = await Promise.all([
      api("/memories"),
      api("/memory-conflicts"),
      api("/memory-settings"),
    ]);
    setItems(memories);
    setConflicts(pending);
    setSettings(preferences);
  };
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function mutate(task, message) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await task();
      await load();
      setNotice(message);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function preference(key, value) {
    const previous = settings;
    setSettings({ ...settings, [key]: value });
    setSaving(true);
    setError("");
    try {
      setSettings(
        await api("/memory-settings", {
          method: "PATCH",
          body: JSON.stringify({ [key]: value }),
        }),
      );
      setNotice("Đã cập nhật lựa chọn trí nhớ.");
    } catch (e) {
      setSettings(previous);
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-heading">
        <h1>Trí nhớ của al</h1>
        <button disabled={saving} onClick={() => setAdding(true)}>
          ＋ Thêm ký ức
        </button>
      </div>
      <p>
        Bạn quyết định al ghi nhớ và sử dụng điều gì. Xoá hội thoại không xoá ký
        ức đã lưu; chat tạm thời luôn bỏ qua trí nhớ.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Đang tải trí nhớ…</p>
      ) : (
        <>
          {settings && (
            <div className="card memory-settings">
              <h2>Quyền kiểm soát của bạn</h2>
              <label>
                <input
                  type="checkbox"
                  checked={settings.autoRemember}
                  disabled={saving}
                  onChange={(e) => preference("autoRemember", e.target.checked)}
                />
                <span>
                  <strong>Tự ghi nhớ khi trò chuyện</strong>
                  <small>
                    Tắt để chỉ lưu những điều bạn chủ động chọn bằng nút “Ghi
                    nhớ điều này”.
                  </small>
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={settings.useMemories}
                  disabled={saving}
                  onChange={(e) => preference("useMemories", e.target.checked)}
                />
                <span>
                  <strong>Dùng ký ức trong câu trả lời</strong>
                  <small>
                    Tắt để trò chuyện mà không nạp ký ức đã lưu vào prompt.
                  </small>
                </span>
              </label>
            </div>
          )}
          <section aria-label="Ký ức cần xác nhận">
            <h2>
              Cần bạn xác nhận{" "}
              <span className="count-badge">{conflicts.length}</span>
            </h2>
            {!conflicts.length ? (
              <p className="muted">Không có ký ức mâu thuẫn đang chờ.</p>
            ) : (
              conflicts.map((c) => (
                <div className="card conflict-card" key={c.id}>
                  <p>
                    Thông tin mới có thể thay đổi ký ức hiện có. Nội dung mới
                    chưa được đưa vào câu trả lời.
                  </p>
                  <div className="memory-comparison">
                    <div>
                      <small>Đang ghi nhớ</small>
                      {c.existing.map((m) => (
                        <p key={m.id}>{m.content}</p>
                      ))}
                    </div>
                    <div>
                      <small>Thông tin mới</small>
                      <p>{c.new_content}</p>
                    </div>
                  </div>
                  <div className="actions">
                    <button
                      disabled={saving}
                      className="secondary"
                      onClick={() =>
                        mutate(
                          () =>
                            api("/memory-conflicts/" + c.id + "/resolve", {
                              method: "POST",
                              body: JSON.stringify({ action: "keep_old" }),
                            }),
                          "Đã giữ ký ức cũ.",
                        )
                      }
                    >
                      Giữ ký ức cũ
                    </button>
                    <button
                      disabled={saving}
                      onClick={() =>
                        mutate(
                          () =>
                            api("/memory-conflicts/" + c.id + "/resolve", {
                              method: "POST",
                              body: JSON.stringify({ action: "replace" }),
                            }),
                          "Đã thay bằng thông tin mới.",
                        )
                      }
                    >
                      Dùng thông tin mới
                    </button>
                    <button
                      disabled={saving}
                      className="secondary"
                      onClick={() =>
                        mutate(
                          () =>
                            api("/memory-conflicts/" + c.id + "/resolve", {
                              method: "POST",
                              body: JSON.stringify({ action: "keep_both" }),
                            }),
                          "Đã giữ cả hai ký ức.",
                        )
                      }
                    >
                      Giữ cả hai
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
          <h2>
            Đã ghi nhớ <span className="count-badge">{items.length}/200</span>
          </h2>
          {!items.length ? (
            <p className="empty">
              Chưa có ký ức. Bạn có thể thêm thủ công hoặc bật tự ghi nhớ.
            </p>
          ) : (
            items.map((item) => (
              <div className="card" key={item.id}>
                <div className="document-heading">
                  <label htmlFor={"memory-" + item.id}>
                    Sự thật đã ghi nhớ
                  </label>
                  <span className="state-badge">
                    {item.origin === "manual" ? "Bạn chọn lưu" : "al ghi nhận"}
                  </span>
                </div>
                <textarea
                  id={"memory-" + item.id}
                  maxLength={500}
                  value={item.content}
                  onChange={(e) =>
                    setItems((ms) =>
                      ms.map((m) =>
                        m.id === item.id
                          ? { ...m, content: e.target.value }
                          : m,
                      ),
                    )
                  }
                />
                <small>
                  Cập nhật: {new Date(item.updated_at).toLocaleString("vi-VN")}
                </small>
                <div className="actions">
                  <button
                    disabled={saving || !item.content.trim()}
                    onClick={() =>
                      mutate(
                        () =>
                          api("/memories/" + item.id, {
                            method: "PATCH",
                            body: JSON.stringify({ content: item.content }),
                          }),
                        "Đã lưu chỉnh sửa.",
                      )
                    }
                  >
                    Lưu chỉnh sửa
                  </button>
                  <button
                    disabled={saving}
                    className="danger"
                    onClick={() => {
                      if (confirm("Xoá ký ức này?"))
                        mutate(
                          () =>
                            api("/memories/" + item.id, { method: "DELETE" }),
                          "Đã xoá ký ức.",
                        );
                    }}
                  >
                    Xoá ký ức
                  </button>
                </div>
              </div>
            ))
          )}
        </>
      )}
      {adding && (
        <MemoryEditor
          message={{ content: "" }}
          onClose={() => setAdding(false)}
          onSaved={(result) => {
            load().catch((e) => setError(e.message));
            setNotice(
              result.status === "conflict"
                ? "Thông tin cần bạn xác nhận ở phía dưới."
                : result.status === "existing"
                  ? "Ký ức này đã được lưu trước đó."
                  : result.comparisonLimited
                    ? "Đã lưu ký ức; hiện chỉ kiểm tra mâu thuẫn cơ bản."
                    : "Đã lưu ký ức.",
            );
          }}
        />
      )}
    </div>
  );
}
