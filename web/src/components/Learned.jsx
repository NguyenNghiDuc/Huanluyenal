import React, { useEffect, useState } from "react";
import { api } from "../api";
export default function Learned() {
  const [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false);
  const load = async () => setItems(await api("/learned"));
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  function edit(id, key, value) {
    setItems((ms) => ms.map((m) => (m.id === id ? { ...m, [key]: value } : m)));
  }
  async function review(item, action) {
    if (
      action === "approve" &&
      !confirm("Duyệt nội dung này vào kho kiến thức?")
    )
      return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await api("/learned/" + item.id + "/" + action, {
        method: "POST",
        body: JSON.stringify(
          action === "approve"
            ? { title: item.title, content: item.content }
            : {},
        ),
      });
      await load();
      setNotice(
        action === "approve"
          ? "Đã lưu vào " + result.path
          : "Đã từ chối đề xuất.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="page">
      <h1>Duyệt kiến thức</h1>
      <p>
        al có thể đề xuất điều hữu ích để học. Hãy kiểm tra tính chính xác và
        sửa nội dung trước khi duyệt. Chỉ đề xuất được duyệt mới được thêm vào
        kho kiến thức.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {loading ? (
        <p>Đang tải…</p>
      ) : !items.length ? (
        <p className="empty">
          Chưa có đề xuất. Bạn có thể nhắn: “Hãy đề xuất lưu kiến thức này để
          tôi duyệt.”
        </p>
      ) : (
        items.map((item) => (
          <div className="card" key={item.id}>
            <span className="badge">
              {item.status === "pending"
                ? "Chờ duyệt"
                : item.status === "approved"
                  ? "Đã duyệt"
                  : "Đã từ chối"}
            </span>
            {item.status === "pending" ? (
              <>
                <p>
                  <label htmlFor={"title-" + item.id}>Tiêu đề</label>
                </p>
                <input
                  id={"title-" + item.id}
                  value={item.title}
                  maxLength={120}
                  onChange={(e) => edit(item.id, "title", e.target.value)}
                />
                <p>
                  <label htmlFor={"content-" + item.id}>
                    Nội dung kiến thức
                  </label>
                </p>
                <textarea
                  id={"content-" + item.id}
                  value={item.content}
                  maxLength={8000}
                  onChange={(e) => edit(item.id, "content", e.target.value)}
                />
              </>
            ) : (
              <>
                <h3>{item.title}</h3>
                <div className="knowledge-content">{item.content}</div>
              </>
            )}
            <p>Lý do đề xuất: {item.reason}</p>
            {item.status === "pending" && (
              <div className="actions">
                <button
                  disabled={
                    saving || !item.title.trim() || !item.content.trim()
                  }
                  onClick={() => review(item, "approve")}
                >
                  ✓ Duyệt và thêm kiến thức
                </button>
                <button
                  className="danger"
                  disabled={saving}
                  onClick={() => review(item, "reject")}
                >
                  Từ chối
                </button>
              </div>
            )}
            {item.approved_path && <small>Đã lưu: {item.approved_path}</small>}
          </div>
        ))
      )}
    </div>
  );
}
