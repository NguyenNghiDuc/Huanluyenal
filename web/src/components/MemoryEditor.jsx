import React, { useState } from "react";
import { api } from "../api";
import Modal from "./Modal";
export default function MemoryEditor({ message, onClose, onSaved }) {
  const [content, setContent] = useState(message.content.slice(0, 500)),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await api("/memories", {
        method: "POST",
        body: JSON.stringify({
          content,
          ...(message.id ? { sourceMessageId: message.id } : {}),
        }),
      });
      onSaved(result);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Ghi nhớ điều này"
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <p>
        Hãy lưu một sự thật đúng, hữu ích về bạn. Bạn có thể sửa lại trước khi
        lưu; không ghi mật khẩu hay thông tin bí mật.
      </p>
      {message.content.length > 500 && (
        <p className="muted">
          Đã lấy 500 ký tự đầu. Hãy rút gọn thành điều bạn muốn al ghi nhớ.
        </p>
      )}
      <form onSubmit={save}>
        <label htmlFor="new-memory">Nội dung ký ức</label>
        <textarea
          autoFocus
          id="new-memory"
          value={content}
          maxLength={500}
          onChange={(e) => setContent(e.target.value)}
        />
        <small>{content.length}/500</small>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button disabled={saving || !content.trim()}>
            {saving ? "Đang lưu…" : "Lưu ký ức"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={saving}
            onClick={onClose}
          >
            Huỷ
          </button>
        </div>
      </form>
    </Modal>
  );
}
