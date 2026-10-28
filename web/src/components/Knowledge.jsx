import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
const labels = {
  queued: "Đang chờ",
  processing: "Đang trích văn bản",
  indexing: "Đang lập chỉ mục",
  ready: "Sẵn sàng",
  error: "Cần xử lý",
};
function uploadFile(file, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents");
    xhr.responseType = "json";
    xhr.timeout = 60000;
    const stop = () => xhr.abort();
    signal?.addEventListener("abort", stop, { once: true });
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      signal?.removeEventListener("abort", stop);
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.response)
        : reject(new Error(xhr.response?.error || "Không tải được tài liệu."));
    };
    xhr.onerror = () => reject(new Error("Mất kết nối khi tải tài liệu."));
    xhr.ontimeout = () => reject(new Error("Tải tài liệu quá thời gian chờ."));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
export default function Knowledge({ onOpenSource }) {
  const [data, setData] = useState(null),
    [docs, setDocs] = useState([]),
    [error, setError] = useState(""),
    [uploads, setUploads] = useState([]),
    [drag, setDrag] = useState(false),
    [pending, setPending] = useState("");
  const input = useRef(),
    uploadAbort = useRef(new AbortController());
  const load = useCallback(async (signal) => {
    const [info, list] = await Promise.all([
      api("/knowledge", { signal }),
      api("/documents", { signal }),
    ]);
    if (!signal?.aborted) {
      setData(info);
      setDocs(list);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((e) => {
      if (e.name !== "AbortError") setError(e.message);
    });
    return () => {
      controller.abort();
      uploadAbort.current.abort();
    };
  }, [load]);
  useEffect(() => {
    if (
      !docs.some((d) => ["queued", "processing", "indexing"].includes(d.status))
    )
      return;
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        load(controller.signal).catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        }),
      1500,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [docs, load]);
  async function accept(files) {
    setError("");
    for (const file of files) {
      const id = crypto.randomUUID();
      const invalid = !/\.(pdf|md|txt)$/i.test(file.name)
        ? "Chỉ hỗ trợ PDF, Markdown và TXT."
        : file.size > 10 * 1024 * 1024
          ? "File vượt quá 10 MiB."
          : null;
      setUploads((rows) => [
        ...rows,
        {
          id,
          name: file.name,
          progress: 0,
          error: invalid,
          state: invalid ? "error" : "uploading",
        },
      ]);
      if (invalid) continue;
      try {
        await uploadFile(
          file,
          (progress) =>
            setUploads((rows) =>
              rows.map((r) => (r.id === id ? { ...r, progress } : r)),
            ),
          uploadAbort.current.signal,
        );
        setUploads((rows) => rows.filter((r) => r.id !== id));
        await load(uploadAbort.current.signal);
      } catch (e) {
        if (e.name === "AbortError") return;
        setUploads((rows) =>
          rows.map((r) =>
            r.id === id ? { ...r, state: "error", error: e.message } : r,
          ),
        );
      }
    }
  }
  async function act(doc, action) {
    if (
      action === "delete" &&
      !confirm(
        "Xoá tài liệu “" +
          doc.name +
          "” và chỉ mục tìm kiếm? Các trích dẫn cũ sẽ không mở được.",
      )
    )
      return;
    setPending(doc.id);
    setError("");
    try {
      await api("/documents/" + doc.id + (action === "retry" ? "/retry" : ""), {
        method: action === "retry" ? "POST" : "DELETE",
        ...(action === "retry" ? { body: "{}" } : {}),
      });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setPending("");
    }
  }
  const uploadedSources = new Set(docs.map((d) => d.source));
  return (
    <div className="page">
      <h1>Kho kiến thức</h1>
      <p>
        Tải tài liệu của bạn để al tra cứu và dẫn nguồn. Bấm vào nguồn trong câu
        trả lời để đọc đúng đoạn văn bản, kèm số trang PDF.
      </p>
      <div
        className={"upload-zone " + (drag ? "dragging" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          accept([...e.dataTransfer.files]);
        }}
      >
        <span className="upload-icon">↑</span>
        <strong>Kéo thả tài liệu vào đây</strong>
        <p>PDF, Markdown hoặc TXT · Tối đa 10 MiB/file</p>
        <button onClick={() => input.current.click()}>Chọn tài liệu</button>
        <input
          className="sr-only"
          ref={input}
          aria-label="Tải tài liệu"
          type="file"
          accept=".pdf,.md,.txt"
          multiple
          onChange={(e) => {
            accept([...e.target.files]);
            e.target.value = "";
          }}
        />
        <small>
          PDF scan cần OCR trước. Văn bản UTF-8 tối đa 256 KiB sau trích xuất.
        </small>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
          <button
            onClick={() =>
              load()
                .then(() => setError(""))
                .catch((e) => setError(e.message))
            }
          >
            Thử tải lại
          </button>
        </p>
      )}
      {uploads.map((u) => (
        <div className="card" key={u.id}>
          <strong>{u.name}</strong>
          {u.error ? (
            <p role="alert" className="error">
              {u.error}
            </p>
          ) : (
            <>
              <p role="status">Đang tải lên · {u.progress}%</p>
              <progress value={u.progress} max={100} />
            </>
          )}
          <button
            className="secondary"
            disabled={u.state === "uploading"}
            onClick={() =>
              setUploads((rows) => rows.filter((r) => r.id !== u.id))
            }
          >
            Đóng
          </button>
        </div>
      ))}
      {!data ? (
        <p role="status">Đang tải kho kiến thức…</p>
      ) : (
        <>
          <p className="muted">
            {data.files.length} tài liệu · {data.chunks} đoạn đã lập chỉ mục
            BM25
          </p>
          {docs.map((doc) => (
            <div className="card document-card" key={doc.id}>
              <div className="document-heading">
                <strong>{doc.name}</strong>
                <span className={"state-badge " + doc.status}>
                  {labels[doc.status]}
                </span>
              </div>
              <p>
                {(doc.size / 1024).toFixed(1)} KB
                {doc.status === "ready" &&
                  ` · ${doc.page_count} trang · ${doc.chunk_count} đoạn`}
              </p>
              {["queued", "processing", "indexing"].includes(doc.status) && (
                <p role="status" className="muted">
                  Tài liệu sẽ tự xuất hiện trong tìm kiếm khi hoàn tất.
                </p>
              )}
              {doc.error && (
                <p className="error" role="alert">
                  {doc.error}
                </p>
              )}
              <div className="actions">
                {doc.status === "ready" && (
                  <button
                    onClick={() =>
                      onOpenSource({ source: doc.source, chunk: 1 })
                    }
                  >
                    Xem nội dung
                  </button>
                )}
                <a
                  className="button-link secondary"
                  href={"/api/documents/" + doc.id + "/file"}
                >
                  Tải bản gốc
                </a>
                {doc.status === "error" && (
                  <button
                    disabled={pending === doc.id}
                    onClick={() => act(doc, "retry")}
                  >
                    Thử lại
                  </button>
                )}
                <button
                  className="danger"
                  disabled={pending === doc.id}
                  onClick={() => act(doc, "delete")}
                >
                  Xoá tài liệu
                </button>
              </div>
            </div>
          ))}
          {data.files
            .filter((f) => !uploadedSources.has(f.source))
            .map((file) => (
              <div key={file.source} className="card">
                <strong>{file.source}</strong>
                <p>
                  {(file.size / 1024).toFixed(1)} KB · Tài liệu trong thư mục
                  kiến thức
                </p>
                <button
                  className="secondary"
                  onClick={() =>
                    onOpenSource({ source: file.source, chunk: 1 })
                  }
                >
                  Xem nội dung
                </button>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
