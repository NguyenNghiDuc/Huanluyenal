import React, { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { WorkspaceProvider } from "./WorkspaceContext";
const KEY = "al.workspace.v1";
const valid = (id) =>
  id === "personal" ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id || "",
  );
function initial() {
  try {
    const value = localStorage.getItem(KEY);
    return valid(value) ? value : "personal";
  } catch {
    return "personal";
  }
}
export default function WorkspaceShell({ children }) {
  const [id, setId] = useState(initial),
    [items, setItems] = useState(null),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const list = await api("/workspaces");
    setItems(list);
    return list;
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (items && !items.some((w) => w.id === id)) setId("personal");
  }, [items, id]);
  const select = useCallback((value) => {
    setId(value);
    try {
      localStorage.setItem(KEY, value);
    } catch {}
  }, []);
  const workspace = items?.find((w) => w.id === id);
  if (!workspace)
    return (
      <div className="workspace-loading">
        <div className="orb">al</div>
        <p role="status">Đang mở không gian của bạn…</p>
        {error && (
          <>
            <p role="alert">{error}</p>
            <button
              onClick={() =>
                refresh()
                  .then(() => setError(""))
                  .catch((e) => setError(e.message))
              }
            >
              Thử lại
            </button>
          </>
        )}
      </div>
    );
  return (
    <WorkspaceProvider workspace={workspace}>
      {children({
        workspace,
        workspaces: items,
        selectWorkspace: select,
        refreshWorkspaces: refresh,
      })}
    </WorkspaceProvider>
  );
}
