import React, { useRef, useState, useEffect } from "react";
import { useWorkspaceApi } from "../WorkspaceContext";
import Modal from "./Modal";
export default function ActionComposer({ message, onClose, onCreated }) {
  const { api } = useWorkspaceApi();
  const [kind, setKind] = useState("task_list"),
    [instruction, setInstruction] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const abort = useRef();
  useEffect(() => () => abort.current?.abort(), []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    abort.current = new AbortController();
    try {
      onCreated(
        await api("/artifacts/generate", {
          method: "POST",
          body: JSON.stringify({
            kind,
            sourceMessageId: message.id,
            instruction,
          }),
          signal: abort.current.signal,
        }),
      );
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Từ hội thoại thành hành động"
      onClose={() => {
        abort.current?.abort();
        onClose();
      }}
    >
      <p>
        al sẽ dùng ngữ cảnh đến tin nhắn này để soạn bản nháp. Bạn có thể xem,
        sửa và quyết định bước tiếp theo; chưa có thao tác gửi ra ngoài.
      </p>
      <blockquote className="source-excerpt">
        {message.content.slice(0, 500)}
        {message.content.length > 500 ? "…" : ""}
      </blockquote>
      <form className="settings-form" onSubmit={submit}>
        <label>
          Loại nội dung
          <select
            aria-label="Loại nội dung"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            disabled={busy}
          >
            <option value="task_list">Danh sách việc</option>
            <option value="study_plan">Kế hoạch học tập</option>
            <option value="document">Bản nháp tài liệu</option>
          </select>
        </label>
        <label>
          Yêu cầu thêm
          <textarea
            aria-label="Yêu cầu thêm"
            maxLength={2000}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Ví dụ: Chia thành các bước có thể thực hiện trong 2 tuần."
            disabled={busy}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button disabled={busy}>
            {busy ? "Đang soạn bản nháp…" : "Tạo bản nháp bằng AI"}
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              abort.current?.abort();
              onClose();
            }}
          >
            Huỷ
          </button>
        </div>
      </form>
    </Modal>
  );
}
