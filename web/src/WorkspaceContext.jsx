import React, { createContext, useContext, useMemo } from "react";
import { api, streamChat } from "./api";
const Context = createContext(null);
export function workspaceUrl(path, id = "personal") {
  return (
    path +
    (path.includes("?") ? "&" : "?") +
    "workspace=" +
    encodeURIComponent(id)
  );
}
export function WorkspaceProvider({ workspace, children }) {
  const value = useMemo(
    () => ({
      workspace,
      api: (path, options = {}) =>
        api(path, {
          ...options,
          headers: { ...options.headers, "X-Workspace-Id": workspace.id },
        }),
      streamChat: (body, signal, onEvent) =>
        streamChat(body, signal, onEvent, workspace.id),
      downloadUrl: (path) => workspaceUrl(path, workspace.id),
    }),
    [workspace],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
const fallback = {
  workspace: { id: "personal", name: "Cá nhân" },
  api,
  streamChat,
  downloadUrl: (path) => workspaceUrl(path),
};
export function useWorkspaceApi() {
  return useContext(Context) || fallback;
}
