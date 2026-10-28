import React, { useEffect, useState } from "react";
import { api } from "../api";
import Modal from "./Modal";
export default function SourceViewer({ source, onClose }) {
  const [chunk, setChunk] = useState(source.chunk),
    [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    api(
      "/knowledge/source?path=" +
        encodeURIComponent(source.source) +
        "&chunk=" +
        chunk +
        (source.hash && chunk === source.chunk ? "&hash=" + source.hash : ""),
      { signal: controller.signal },
    )
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [source.source, chunk]);
  return (
    <Modal title="Nguồn tham khảo" onClose={onClose}>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !data ? (
        <p role="status">Đang mở nguồn…</p>
      ) : (
        <>
          <h3>{data.name || data.source}</h3>
          <p className="muted">
            {data.page ? `Trang ${data.page} · ` : ""}Đoạn {data.chunk}/
            {data.totalChunks}
          </p>
          <div className="source-passage">{data.content}</div>
          <div className="actions">
            <button
              className="secondary"
              disabled={chunk <= 1}
              onClick={() => setChunk((c) => c - 1)}
            >
              ← Đoạn trước
            </button>
            <button
              className="secondary"
              disabled={chunk >= data.totalChunks}
              onClick={() => setChunk((c) => c + 1)}
            >
              Đoạn sau →
            </button>
            {data.documentId && (
              <a
                className="button-link"
                href={"/api/documents/" + data.documentId + "/file"}
              >
                Tải bản gốc
              </a>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
