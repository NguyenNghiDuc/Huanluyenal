import React, { useEffect, useState } from "react";
import { api } from "../api";
export default function Knowledge() {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/knowledge")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="page">
      <h1>Kho kiến thức</h1>
      <p>
        Tài liệu trong knowledge/ được tìm kiếm tự động. al lấy tối đa 3 đoạn
        liên quan cho mỗi câu hỏi và dẫn nguồn khi sử dụng.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data ? (
        <>
          <p>
            {data.files.length} tài liệu · {data.chunks} đoạn đã lập chỉ mục
            BM25
          </p>
          {data.files.map((f) => (
            <div key={f.source} className="card">
              <strong>{f.source}</strong>
              <p>{(f.size / 1024).toFixed(1)} KB</p>
            </div>
          ))}
        </>
      ) : (
        !error && <p>Đang tải…</p>
      )}
    </div>
  );
}
