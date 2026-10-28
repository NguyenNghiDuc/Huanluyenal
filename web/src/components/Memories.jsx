import React, { useEffect, useState } from "react";
import { api } from "../api";
export default function Memories() {
  const [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false);
  const load = async () => {
    setItems(await api("/memories"));
  };
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function save(item) {
    setSaving(true);
    setError("");
    try {
      await api("/memories/" + item.id, {
        method: "PATCH",
        body: JSON.stringify({ content: item.content }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function remove(item) {
    if (!confirm("Xoá ký ức này?")) return;
    setSaving(true);
    setError("");
    try {
      await api("/memories/" + item.id, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="page">
      <h1>Trí nhớ của al</h1>
      <p>
        Những điều bạn chia sẻ giúp al hỗ trợ bạn tốt hơn ở các cuộc trò chuyện
        sau. Bạn có thể sửa hoặc xoá bất kỳ lúc nào. Xoá hội thoại không xoá ký
        ức đã lưu.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading ? (
        <p>Đang tải…</p>
      ) : !items.length ? (
        <p className="empty">
          Chưa có ký ức. al sẽ ghi nhớ các sự thật quan trọng khi bạn trò
          chuyện.
        </p>
      ) : (
        items.map((item) => (
          <div className="card" key={item.id}>
            <label htmlFor={"memory-" + item.id}>Sự thật đã ghi nhớ</label>
            <textarea
              id={"memory-" + item.id}
              maxLength={500}
              value={item.content}
              onChange={(e) =>
                setItems((ms) =>
                  ms.map((m) =>
                    m.id === item.id ? { ...m, content: e.target.value } : m,
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
                onClick={() => save(item)}
              >
                Lưu chỉnh sửa
              </button>
              <button
                disabled={saving}
                className="danger"
                onClick={() => remove(item)}
              >
                Xoá ký ức
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
