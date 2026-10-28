import React, { useEffect, useState } from "react";
import { useWorkspaceApi } from "../WorkspaceContext";
export default function Workspaces({ workspace, onChanged, onSelect }) {
  const { api } = useWorkspaceApi();
  const [name, setName] = useState(workspace.name),
    [description, setDescription] = useState(workspace.description),
    [persona, setPersona] = useState(workspace.persona),
    [newName, setNewName] = useState(""),
    [rows, setRows] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const reload = async () => setRows(await api("/workspaces?archived=true"));
  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, []);
  async function act(task, message) {
    setBusy(true);
    setError("");
    try {
      await task();
      await reload();
      await onChanged();
      setNotice(message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <h1>Không gian làm việc</h1>
      <p>
        Mỗi không gian có hội thoại, ký ức, tài liệu và công việc riêng. Persona
        bên dưới bổ sung vào quy tắc chung của al.
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
      <form
        className="card settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          act(
            () =>
              api("/workspaces/" + workspace.id, {
                method: "PATCH",
                body: JSON.stringify({ name, description, persona }),
              }),
            "Đã lưu cấu hình không gian.",
          );
        }}
      >
        <h2>Cấu hình {workspace.name}</h2>
        <label>
          Tên không gian
          <input
            aria-label="Tên không gian"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Mô tả
          <textarea
            aria-label="Mô tả không gian"
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Persona riêng
          <textarea
            aria-label="Persona riêng"
            value={persona}
            maxLength={8000}
            placeholder="Ví dụ: Hỗ trợ tôi học lập trình; giải thích từng bước và đưa bài tập thực hành."
            onChange={(e) => setPersona(e.target.value)}
          />
        </label>
        <small>
          {persona.length}/8000 · Có hiệu lực ở lượt chat tiếp theo.
        </small>
        <div className="actions">
          <button disabled={busy || !name.trim()}>Lưu cấu hình</button>
        </div>
      </form>
      <form
        className="card settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          act(async () => {
            const row = await api("/workspaces", {
              method: "POST",
              body: JSON.stringify({ name: newName }),
            });
            await onChanged();
            onSelect(row.id);
          }, "Đã tạo không gian.");
        }}
      >
        <h2>Tạo không gian mới</h2>
        <label>
          Tên mới
          <input
            aria-label="Tên không gian mới"
            value={newName}
            maxLength={80}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Dự án, gia đình, nghiên cứu…"
          />
        </label>
        <button disabled={busy || !newName.trim()}>Tạo không gian</button>
      </form>
      <h2>Quản lý các không gian</h2>
      {rows.map((row) => (
        <div className="card" key={row.id}>
          <div className="document-heading">
            <strong>{row.name}</strong>
            <span className="state-badge">
              {row.archived_at
                ? "Đã lưu trữ"
                : row.id === workspace.id
                  ? "Đang dùng"
                  : "Đang hoạt động"}
            </span>
          </div>
          <p>{row.description || "Chưa có mô tả."}</p>
          <div className="actions">
            {!row.archived_at && (
              <button
                disabled={busy || row.id === workspace.id}
                onClick={() => onSelect(row.id)}
              >
                Mở không gian
              </button>
            )}
            {row.archived_at ? (
              <button
                disabled={busy}
                onClick={() =>
                  act(
                    () =>
                      api("/workspaces/" + row.id + "/restore", {
                        method: "POST",
                        body: "{}",
                      }),
                    "Đã khôi phục không gian.",
                  )
                }
              >
                Khôi phục
              </button>
            ) : (
              row.id !== "personal" && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        "Lưu trữ “" +
                          row.name +
                          "”? Dữ liệu được giữ nguyên và có thể khôi phục.",
                      )
                    )
                      act(async () => {
                        await api("/workspaces/" + row.id + "/archive", {
                          method: "POST",
                          body: "{}",
                        });
                        await onChanged();
                        if (row.id === workspace.id) onSelect("personal");
                      }, "Đã lưu trữ không gian.");
                  }}
                >
                  Lưu trữ không gian
                </button>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
