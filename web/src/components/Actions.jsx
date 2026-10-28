import React, { useEffect, useState } from "react";
import { useWorkspaceApi } from "../WorkspaceContext";
import Modal from "./Modal";
import Markdown from "./Markdown";
const kinds = {
  task_list: "Danh sách việc",
  study_plan: "Kế hoạch học tập",
  document: "Bản nháp tài liệu",
};
const states = {
  draft: "Bản nháp",
  active: "Đang thực hiện",
  archived: "Đã lưu trữ",
};
const taskStates = { todo: "Chưa làm", doing: "Đang làm", done: "Hoàn tất" };
function TaskEditor({ task, onSave, onDelete, busy, onDirty }) {
  const [title, setTitle] = useState(task.title),
    [notes, setNotes] = useState(task.notes),
    [dueDate, setDueDate] = useState(task.due_date || ""),
    [priority, setPriority] = useState(task.priority);
  return (
    <details className="task-details">
      <summary>Chi tiết và chỉnh sửa</summary>
      <fieldset className="settings-form" disabled={busy}>
        <label>
          Tên việc
          <input
            aria-label="Tên việc"
            maxLength={160}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              onDirty(task.id);
            }}
          />
        </label>
        <label>
          Ghi chú
          <textarea
            aria-label="Ghi chú công việc"
            maxLength={1200}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              onDirty(task.id);
            }}
          />
        </label>
        <div className="field-row">
          <label>
            Ngày hạn
            <input
              aria-label="Ngày hạn"
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                onDirty(task.id);
              }}
            />
          </label>
          <label>
            Ưu tiên
            <select
              aria-label="Ưu tiên"
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                onDirty(task.id);
              }}
            >
              <option value="low">Thấp</option>
              <option value="normal">Bình thường</option>
              <option value="high">Cao</option>
            </select>
          </label>
        </div>
        <div className="actions">
          <button
            type="button"
            disabled={busy || !title.trim()}
            onClick={() =>
              onSave({ title, notes, dueDate: dueDate || null, priority })
            }
          >
            Lưu việc
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() => {
              if (confirm("Xoá công việc con này?")) onDelete();
            }}
          >
            Xoá việc
          </button>
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              setTitle(task.title);
              setNotes(task.notes);
              setDueDate(task.due_date || "");
              setPriority(task.priority);
              onDirty(null);
            }}
          >
            Huỷ chỉnh sửa việc
          </button>
        </div>
      </fieldset>
    </details>
  );
}
function ArtifactEditor({ id, onClose, onUpdated, onQueue }) {
  const { api, downloadUrl } = useWorkspaceApi();
  const [data, setData] = useState(null),
    [title, setTitle] = useState(""),
    [summary, setSummary] = useState(""),
    [body, setBody] = useState(""),
    [status, setStatus] = useState("draft"),
    [newTask, setNewTask] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [dirty, setDirty] = useState(false),
    [taskDraft, setTaskDraft] = useState(null),
    [preview, setPreview] = useState(false);
  function hydrate(a) {
    setData(a);
    setTitle(a.title);
    setSummary(a.summary);
    setBody(a.body);
    setStatus(a.status);
    setDirty(false);
    setTaskDraft(null);
  }
  useEffect(() => {
    const controller = new AbortController();
    api("/artifacts/" + id, { signal: controller.signal })
      .then(hydrate)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [id, api]);
  async function mutate(path, method, values, message) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api(path, {
        method,
        body: JSON.stringify({ revision: data.revision, ...values }),
      });
      hydrate(result);
      await onUpdated();
      setNotice(message);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirm("Xoá “" + data.title + "” cùng các công việc con?")) return;
    setBusy(true);
    try {
      await api("/artifacts/" + id, {
        method: "DELETE",
        body: JSON.stringify({ revision: data.revision }),
      });
      await onUpdated();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    setBusy(true);
    setError("");
    try {
      await api("/artifacts/" + id + "/share", {
        method: "POST",
        body: JSON.stringify({ revision: data.revision }),
      });
      await onUpdated();
      onQueue();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const change = (setter) => (e) => {
    setter(e.target.value);
    setDirty(true);
  };
  return (
    <Modal
      title="Chi tiết công việc"
      onClose={() => {
        if (busy) return;
        if ((!dirty && !taskDraft) || confirm("Bỏ các chỉnh sửa chưa lưu?"))
          onClose();
      }}
    >
      {error && (
        <p className="error" role="alert">
          {error}
          <button
            disabled={busy}
            onClick={() =>
              api("/artifacts/" + id)
                .then(hydrate)
                .then(() => setError(""))
                .catch((e) => setError(e.message))
            }
          >
            Tải bản mới nhất
          </button>
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {!data ? (
        <p role="status">Đang tải bản nháp…</p>
      ) : (
        <>
          <p className="muted">
            {kinds[data.kind]} · Phiên bản {data.revision}
          </p>
          <form
            className="settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              mutate(
                "/artifacts/" + id,
                "PATCH",
                { title, summary, body, status },
                "Đã lưu nội dung.",
              );
            }}
          >
            <label>
              Tiêu đề
              <input
                aria-label="Tiêu đề công việc"
                disabled={busy || !!taskDraft}
                maxLength={120}
                value={title}
                onChange={change(setTitle)}
              />
            </label>
            <label>
              Tóm tắt
              <textarea
                aria-label="Tóm tắt công việc"
                disabled={busy || !!taskDraft}
                maxLength={1000}
                value={summary}
                onChange={change(setSummary)}
              />
            </label>
            <label>
              Trạng thái
              <select
                aria-label="Trạng thái bản nháp"
                disabled={busy || !!taskDraft}
                value={status}
                onChange={change(setStatus)}
              >
                {Object.entries(states).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nội dung Markdown
              <textarea
                className="draft-body"
                aria-label="Nội dung bản nháp"
                disabled={busy || !!taskDraft}
                maxLength={20000}
                value={body}
                onChange={change(setBody)}
              />
            </label>
            <div className="actions">
              <button disabled={busy || !!taskDraft || !title.trim() || !dirty}>
                Lưu nội dung
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => setPreview((p) => !p)}
              >
                {preview ? "Ẩn xem trước" : "Xem trước Markdown"}
              </button>
            </div>
          </form>
          {preview && (
            <div className="card">
              <Markdown content={body || "Chưa có nội dung."} />
            </div>
          )}
          {taskDraft && (
            <p className="muted">
              Có chỉnh sửa chưa lưu trong công việc con. Hãy lưu hoặc huỷ chỉnh
              sửa đó trước khi đổi nội dung khác.
            </p>
          )}
          {data.kind !== "document" && (
            <section aria-label="Các công việc">
              <h3>
                Tiến độ {data.tasks.filter((t) => t.status === "done").length}/
                {data.tasks.length}
              </h3>
              <progress
                value={data.tasks.filter((t) => t.status === "done").length}
                max={data.tasks.length || 1}
              />
              {data.tasks.map((task) => (
                <div className="task-card" key={task.id}>
                  <div className="task-top">
                    <strong className={task.status === "done" ? "done" : ""}>
                      {task.title}
                    </strong>
                    <select
                      aria-label={"Trạng thái " + task.title}
                      value={task.status}
                      disabled={busy || dirty || !!taskDraft}
                      onChange={(e) =>
                        mutate(
                          "/artifacts/" + id + "/tasks/" + task.id,
                          "PATCH",
                          { status: e.target.value },
                          "Đã cập nhật tiến độ.",
                        )
                      }
                    >
                      {Object.entries(taskStates).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {task.due_date && (
                    <p className="muted">Hạn: {task.due_date}</p>
                  )}
                  <TaskEditor
                    key={task.id + data.revision}
                    task={task}
                    busy={
                      busy || dirty || (!!taskDraft && taskDraft !== task.id)
                    }
                    onDirty={setTaskDraft}
                    onSave={(values) =>
                      mutate(
                        "/artifacts/" + id + "/tasks/" + task.id,
                        "PATCH",
                        values,
                        "Đã lưu việc.",
                      )
                    }
                    onDelete={() =>
                      mutate(
                        "/artifacts/" + id + "/tasks/" + task.id,
                        "DELETE",
                        {},
                        "Đã xoá việc.",
                      )
                    }
                  />
                </div>
              ))}
              <form
                className="add-task"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutate(
                    "/artifacts/" + id + "/tasks",
                    "POST",
                    { task: { title: newTask } },
                    "Đã thêm việc.",
                  ).then((ok) => {
                    if (ok) setNewTask("");
                  });
                }}
              >
                <input
                  aria-label="Công việc mới"
                  maxLength={160}
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  placeholder="Thêm một việc cụ thể…"
                />
                <button
                  disabled={busy || dirty || !!taskDraft || !newTask.trim()}
                >
                  Thêm việc
                </button>
              </form>
              {dirty && (
                <p className="muted">
                  Lưu nội dung trước khi thay đổi danh sách việc.
                </p>
              )}
            </section>
          )}
          <div className="actions export-actions">
            <a
              className="button-link secondary"
              href={downloadUrl("/api/artifacts/" + id + "/export?format=md")}
            >
              Xuất Markdown
            </a>
            <a
              className="button-link secondary"
              href={downloadUrl("/api/artifacts/" + id + "/export?format=json")}
            >
              Xuất JSON
            </a>
            {taskDraft && (
              <p className="muted">
                Có chỉnh sửa chưa lưu trong công việc con. Hãy lưu hoặc huỷ
                chỉnh sửa đó trước khi đổi nội dung khác.
              </p>
            )}
            {data.kind !== "document" && (
              <a
                className="button-link secondary"
                href={downloadUrl(
                  "/api/artifacts/" + id + "/export?format=ics",
                )}
              >
                Xuất lịch .ics
              </a>
            )}
            <button disabled={busy || dirty || !!taskDraft} onClick={share}>
              Tạo yêu cầu gửi ra ngoài
            </button>
            <button className="danger" disabled={busy} onClick={remove}>
              Xoá mục này
            </button>
          </div>
          <p className="muted">
            Chỉ bản đã lưu được xuất hoặc gửi. Gửi ra ngoài cần duyệt thêm nội
            dung và đích nhận ở Hộp chờ duyệt.
          </p>
        </>
      )}
    </Modal>
  );
}
export default function Actions() {
  const { api } = useWorkspaceApi();
  const [items, setItems] = useState([]),
    [outbox, setOutbox] = useState([]),
    [capabilities, setCapabilities] = useState(null),
    [tab, setTab] = useState("library"),
    [kind, setKind] = useState(""),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(null),
    [creating, setCreating] = useState(false),
    [newKind, setNewKind] = useState("task_list"),
    [newTitle, setNewTitle] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function reload() {
    const [list, queue, caps] = await Promise.all([
      api("/artifacts"),
      api("/outbox"),
      api("/action-capabilities"),
    ]);
    setItems(list);
    setOutbox(queue);
    setCapabilities(caps);
  }
  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, [api]);
  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const a = await api("/artifacts", {
        method: "POST",
        body: JSON.stringify({ kind: newKind, title: newTitle }),
      });
      await reload();
      setCreating(false);
      setNewTitle("");
      setSelected(a.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function review(item, action) {
    if (
      action === "approve" &&
      !confirm(
        `Duyệt gửi “${item.payload.title}” tới ${item.destination_label} (${item.destination_host})?${item.status === "failed" ? " Lần trước chưa xác nhận được; hãy kiểm tra bên nhận để tránh trùng." : ""}`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api("/outbox/" + item.id + "/" + action, {
        method: "POST",
        body: "{}",
      });
      await reload();
      setNotice(
        action === "approve" ? "Đã gửi thành công." : "Đã từ chối yêu cầu.",
      );
    } catch (e) {
      setError(e.message);
      await reload().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const visible = items.filter(
    (a) =>
      (!kind || a.kind === kind) &&
      (filter === "all" || a.status === filter) &&
      a.title.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")),
  );
  const pending = outbox.filter((o) =>
    ["pending", "failed"].includes(o.status),
  ).length;
  return (
    <div className="page">
      <div className="page-heading">
        <h1>Công việc & bản nháp</h1>
        <button onClick={() => setCreating(true)}>＋ Tạo thủ công</button>
      </div>
      <p>
        Biến hội thoại thành việc có thể làm, kế hoạch học tập hoặc tài liệu.
        Dùng nút “Tạo công việc / tài liệu” dưới tin nhắn để al soạn bản nháp.
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
      <div className="tab-bar" role="tablist" aria-label="Công việc">
        <button
          role="tab"
          aria-selected={tab === "library"}
          onClick={() => setTab("library")}
        >
          Thư viện ({items.length})
        </button>
        <button
          role="tab"
          aria-selected={tab === "outbox"}
          onClick={() => setTab("outbox")}
        >
          Hộp chờ duyệt ({pending})
        </button>
      </div>
      {tab === "library" ? (
        <>
          <div className="action-filters">
            <input
              aria-label="Tìm công việc"
              placeholder="Tìm tiêu đề…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="Lọc loại công việc"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="">Mọi loại</option>
              {Object.entries(kinds).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Lọc trạng thái"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">Mọi trạng thái</option>
              {Object.entries(states).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {!visible.length ? (
            <p className="empty">
              Chưa có mục phù hợp. Bạn có thể tạo thủ công hoặc từ tin nhắn.
            </p>
          ) : (
            <div className="artifact-grid">
              {visible.map((a) => (
                <div className="card artifact-card" key={a.id}>
                  <div className="document-heading">
                    <span className="state-badge">{kinds[a.kind]}</span>
                    <small>{states[a.status]}</small>
                  </div>
                  <h2>{a.title}</h2>
                  <p>
                    {a.summary ||
                      "Mở để bổ sung nội dung và các bước tiếp theo."}
                  </p>
                  {a.kind !== "document" && (
                    <>
                      <p className="muted">
                        {a.done_count}/{a.task_count} việc hoàn tất
                      </p>
                      <progress value={a.done_count} max={a.task_count || 1} />
                    </>
                  )}
                  <button onClick={() => setSelected(a.id)}>
                    Mở và chỉnh sửa
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {capabilities?.error && (
            <p className="error" role="alert">
              {capabilities.error}
            </p>
          )}
          <p>
            {capabilities?.externalEnabled
              ? `Đích được server cấu hình: ${capabilities.destination.label} (${capabilities.destination.host}). Hãy xem đầy đủ bản gửi trước khi duyệt.`
              : "Chưa cấu hình gửi ra ngoài. Bạn có thể xuất Markdown, JSON hoặc lịch để sử dụng. Cấu hình webhook trong server/.env để bật gửi."}
          </p>
          {!outbox.length ? (
            <p className="empty">Chưa có yêu cầu gửi.</p>
          ) : (
            outbox.map((item) => (
              <div className="card outbox-card" key={item.id}>
                <div className="document-heading">
                  <h2>{item.payload.title}</h2>
                  <span className="state-badge">
                    {
                      {
                        pending: "Chờ duyệt",
                        sending: "Đang gửi",
                        sent: "Đã gửi",
                        failed: "Chưa xác nhận",
                        rejected: "Đã từ chối",
                      }[item.status]
                    }
                  </span>
                </div>
                <p>
                  Đích: {item.destination_label} · {item.destination_host} ·
                  Phiên bản {item.artifact_revision}
                </p>
                <p>{item.payload.summary}</p>
                <div className="card">
                  <Markdown
                    content={
                      item.payload.body || "_Không có nội dung tài liệu._"
                    }
                  />
                  {!!item.payload.tasks.length && (
                    <ul>
                      {item.payload.tasks.map((t) => (
                        <li key={t.id}>
                          <strong>{t.title}</strong> — {taskStates[t.status]}
                          {t.dueDate ? " · " + t.dueDate : ""} · Ưu tiên{" "}
                          {t.priority}
                          {t.notes && <p>{t.notes}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <details className="outbox-json">
                  <summary>Xem dữ liệu JSON sẽ gửi</summary>
                  <pre>{JSON.stringify(item.payload, null, 2)}</pre>
                </details>
                {item.error && (
                  <p className="error" role="alert">
                    {item.error}
                  </p>
                )}
                {["pending", "failed"].includes(item.status) && (
                  <div className="actions">
                    <button
                      disabled={busy}
                      onClick={() => review(item, "approve")}
                    >
                      {item.status === "failed"
                        ? "Duyệt và thử lại"
                        : "Duyệt và gửi"}
                    </button>
                    <button
                      disabled={busy}
                      className="danger"
                      onClick={() => review(item, "reject")}
                    >
                      Từ chối gửi
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}
      {creating && (
        <Modal
          title="Tạo mục công việc"
          onClose={() => {
            if (!busy) setCreating(false);
          }}
        >
          <form className="settings-form" onSubmit={create}>
            <label>
              Loại nội dung
              <select
                aria-label="Loại mục mới"
                value={newKind}
                onChange={(e) => setNewKind(e.target.value)}
              >
                {Object.entries(kinds).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tiêu đề
              <input
                autoFocus
                aria-label="Tiêu đề mục mới"
                maxLength={120}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </label>
            <button disabled={busy || !newTitle.trim()}>Tạo bản nháp</button>
          </form>
        </Modal>
      )}
      {selected && (
        <ArtifactEditor
          id={selected}
          onClose={() => setSelected(null)}
          onUpdated={reload}
          onQueue={() => {
            setTab("outbox");
            setNotice("Yêu cầu đã vào hộp chờ. Chưa gửi dữ liệu ra ngoài.");
          }}
        />
      )}
    </div>
  );
}
