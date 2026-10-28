import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  WorkspaceProvider,
  useWorkspaceApi,
  workspaceUrl,
} from "../WorkspaceContext";
import { readSession, saveSession } from "../session";
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
it("workspace requests and download links retain their scope even after the visible workspace changes", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
  vi.stubGlobal("fetch", fetcher);
  let retained;
  const a = { id: "00000000-0000-4000-8000-000000000002", name: "Công việc" },
    b = { id: "personal", name: "Cá nhân" };
  function Probe() {
    const { api, workspace, downloadUrl } = useWorkspaceApi();
    if (workspace.id === a.id) retained = api;
    return <a href={downloadUrl("/api/documents/123/file")}>Bản gốc</a>;
  }
  const { rerender } = render(
    <WorkspaceProvider workspace={a}>
      <Probe />
    </WorkspaceProvider>,
  );
  expect(screen.getByRole("link").href).toContain("workspace=" + a.id);
  rerender(
    <WorkspaceProvider workspace={b}>
      <Probe />
    </WorkspaceProvider>,
  );
  await retained("/conversations");
  expect(fetcher.mock.calls[0][1].headers["X-Workspace-Id"]).toBe(a.id);
  expect(screen.getByRole("link").href).toContain("workspace=personal");
  expect(workspaceUrl("/api/artifacts/id/export?format=md", a.id)).toContain(
    "&workspace=",
  );
});
it("each workspace restores its own session while old personal sessions stay compatible", () => {
  const a = "00000000-0000-4000-8000-000000000002",
    c = "d7ac7aaa-9204-49dc-8ca6-f5d9f6936ec8";
  saveSession(c, "actions", a);
  saveSession(null, "chat");
  expect(readSession(a)).toEqual({ conversationId: c, page: "actions" });
  expect(readSession()).toEqual({ conversationId: null, page: "chat" });
  expect(JSON.parse(localStorage.getItem("al.session.v1")).page).toBe("chat");
});
