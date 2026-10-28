import React, { useEffect, useState, useRef, useCallback } from "react";
import { useWorkspaceApi } from "./WorkspaceContext";
import WorkspaceShell from "./WorkspaceShell";
const Workspaces = React.lazy(() => import("./components/Workspaces"));
const Actions = React.lazy(() => import("./components/Actions"));
const ActionComposer = React.lazy(() => import("./components/ActionComposer"));
import Sidebar from "./components/Sidebar";
import Chat from "./components/Chat";
import Memories from "./components/Memories";
import Knowledge from "./components/Knowledge";
import Learned from "./components/Learned";
import { readSession, saveSession } from "./session";
import useConversationSearch from "./useConversationSearch";
import { temporaryHistory } from "./temporary";
import SourceViewer from "./components/SourceViewer";
import MemoryEditor from "./components/MemoryEditor";
const pause = (ms, signal) =>
  new Promise((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    if (signal?.aborted) stop();
    else signal?.addEventListener("abort", stop, { once: true });
  });
async function settledConversation(api, id, signal) {
  let data = await api("/conversations/" + id, { signal });
  for (let retry = 0; data.generating && retry < 45; retry++) {
    await pause(2000, signal);
    data = await api("/conversations/" + id, { signal });
  }
  if (data.generating)
    throw new Error("Hội thoại vẫn đang được xử lý. Hãy mở lại sau ít phút.");
  return data;
}
export default function App() {
  return (
    <WorkspaceShell>
      {(props) => <AssistantApp key={props.workspace.id} {...props} />}
    </WorkspaceShell>
  );
}
function AssistantApp({
  workspace,
  workspaces,
  selectWorkspace,
  refreshWorkspaces,
}) {
  const { api, streamChat } = useWorkspaceApi();
  const initial = useRef(null);
  if (!initial.current) initial.current = readSession(workspace.id);
  const [items, setItems] = useState([]),
    [selected, setSelected] = useState(null),
    [messages, setMessages] = useState([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [page, setPage] = useState(initial.current.page),
    [status, setStatus] = useState(""),
    [sources, setSources] = useState([]),
    [query, setQuery] = useState(""),
    [focusMessageId, setFocusMessageId] = useState(null),
    [temporary, setTemporary] = useState(false),
    [openSource, setOpenSource] = useState(null),
    [rememberMessage, setRememberMessage] = useState(null),
    [notice, setNotice] = useState(""),
    [composeMessage, setComposeMessage] = useState(null),
    [actionNotice, setActionNotice] = useState("");
  const abort = useRef(),
    selectionAbort = useRef(),
    busyRef = useRef(false),
    selectionSeq = useRef(0);
  const search = useConversationSearch(query, items);
  const refresh = useCallback(
    async () => setItems(await api("/conversations")),
    [],
  );
  const initialize = useCallback(async () => {
    const seq = ++selectionSeq.current;
    selectionAbort.current?.abort();
    const controller = new AbortController();
    selectionAbort.current = controller;
    setLoading(true);
    setError("");
    try {
      const list = await api("/conversations", { signal: controller.signal });
      let data = null;
      const saved = initial.current;
      if (saved.conversationId) {
        try {
          data = await settledConversation(
            api,
            saved.conversationId,
            controller.signal,
          );
        } catch (e) {
          if (e.status !== 404) throw e;
          saved.conversationId = null;
        }
      }
      if (seq !== selectionSeq.current) return;
      setItems(list);
      setSelected(data?.conversation.id || null);
      setMessages(data?.messages || []);
      setPage(saved.page);
      setReady(true);
    } catch (e) {
      if (e.name !== "AbortError" && seq === selectionSeq.current)
        setError("Không tải được hội thoại. " + e.message);
    } finally {
      if (seq === selectionSeq.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    initialize();
    return () => {
      ++selectionSeq.current;
      selectionAbort.current?.abort();
      abort.current?.abort();
    };
  }, [initialize]);
  useEffect(() => {
    if (ready) saveSession(selected, page, workspace.id);
  }, [selected, page, ready]);
  async function select(item) {
    if (busyRef.current) return;
    if (
      temporary &&
      messages.length &&
      !confirm("Rời chat tạm thời? Nội dung sẽ không thể khôi phục.")
    )
      return;
    const seq = ++selectionSeq.current;
    selectionAbort.current?.abort();
    const controller = new AbortController();
    selectionAbort.current = controller;
    setLoading(true);
    setError("");
    try {
      const data = await settledConversation(api, item.id, controller.signal);
      if (seq !== selectionSeq.current) return;
      setTemporary(false);
      setNotice("");
      setSelected(item.id);
      setSources([]);
      setMessages(data.messages);
      setFocusMessageId(item.match_message_id || null);
      setPage("chat");
    } catch (e) {
      if (e.name !== "AbortError" && seq === selectionSeq.current) {
        setError(e.message);
        if (e.status === 404) {
          if (selected === item.id) {
            setSelected(null);
            setMessages([]);
          }
          await refresh().catch(() => {});
        }
      }
    } finally {
      if (seq === selectionSeq.current) setLoading(false);
    }
  }
  function newChat(privateMode = false) {
    if (busyRef.current || !ready) return;
    if (
      temporary &&
      messages.length &&
      !confirm("Rời chat tạm thời? Nội dung sẽ không thể khôi phục.")
    )
      return;
    setTemporary(privateMode === true);
    setNotice("");
    ++selectionSeq.current;
    selectionAbort.current?.abort();
    setLoading(false);
    setSelected(null);
    setSources([]);
    setMessages([]);
    setFocusMessageId(null);
    setQuery("");
    setPage("chat");
    setError("");
  }
  async function rename(item) {
    const title = prompt("Tên cuộc trò chuyện", item.title);
    if (!title?.trim()) return;
    try {
      await api("/conversations/" + item.id, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }
  async function remove(item) {
    if (!confirm("Xoá cuộc trò chuyện “" + item.title + "”?")) return;
    try {
      await api("/conversations/" + item.id, { method: "DELETE" });
      if (selected === item.id) newChat();
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }
  async function send(text, regenerate = false) {
    if (busyRef.current || loading || !ready) return;
    busyRef.current = true;
    ++selectionSeq.current;
    selectionAbort.current?.abort();
    setBusy(true);
    setError("");
    setStatus("Đang suy nghĩ…");
    setSources([]);
    setFocusMessageId(null);
    setPage("chat");
    abort.current = new AbortController();
    let id = temporary ? null : selected;
    const privateMessages = temporary
      ? temporaryHistory(messages, text, regenerate)
      : null;
    setMessages((m) =>
      regenerate
        ? [
            ...m.slice(0, m.map((x) => x.role).lastIndexOf("user") + 1),
            { role: "assistant", content: "" },
          ]
        : [
            ...m,
            { role: "user", content: text },
            { role: "assistant", content: "" },
          ],
    );
    try {
      await streamChat(
        {
          ...(temporary
            ? { temporary: true, messages: privateMessages }
            : {
                ...(id ? { conversationId: id } : {}),
                ...(regenerate ? { regenerate: true } : { message: text }),
              }),
        },
        abort.current.signal,
        (event, data) => {
          if (event === "meta" && !temporary) {
            id = data.conversationId;
            setSelected(id);
            saveSession(id, "chat", workspace.id);
          }
          if (event === "artifact")
            setActionNotice("Đã tạo bản nháp: " + data.title);
          if (event === "sources") {
            setSources(data.sources);
            setMessages((ms) =>
              ms.map((m, i) =>
                i === ms.length - 1 ? { ...m, sources: data.sources } : m,
              ),
            );
          }
          if (event === "delta")
            setMessages((m) =>
              m.map((x, i) =>
                i === m.length - 1
                  ? { ...x, content: x.content + data.text }
                  : x,
              ),
            );
          if (event === "memory_conflict") setNotice(data.message);
          if (event === "warning") setError(data.message);
          if (event === "status") setStatus(data.message);
        },
      );
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
      else {
        setStatus("Đã dừng.");
        if (temporary)
          setMessages((ms) =>
            ms.map((m, i) =>
              i === ms.length - 1 ? { ...m, status: "interrupted" } : m,
            ),
          );
      }
    } finally {
      if (id && !temporary) {
        try {
          const data = await settledConversation(api, id);
          setMessages(data.messages);
        } catch (e) {
          setError(e.message);
        }
      }
      try {
        await refresh();
      } catch (e) {
        setError(e.message);
      }
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="layout">
      <Sidebar
        workspace={workspace}
        workspaces={workspaces}
        onWorkspace={(id) => {
          if (
            temporary &&
            messages.length &&
            !confirm("Rời chat tạm thời? Nội dung sẽ không thể khôi phục.")
          )
            return;
          selectWorkspace(id);
        }}
        items={search.items}
        selected={selected}
        busy={busy || loading || !ready}
        onSelect={select}
        onNew={newChat}
        onRename={rename}
        onDelete={remove}
        onPage={setPage}
        page={page}
        query={query}
        onQuery={setQuery}
        search={search}
      />
      <main>
        {error && (
          <div className="error" role="alert">
            {error}
            <div>
              {!ready && (
                <button onClick={initialize} disabled={loading}>
                  Thử lại
                </button>
              )}
              <button onClick={() => setError("")} aria-label="Đóng thông báo">
                ×
              </button>
            </div>
          </div>
        )}
        {actionNotice && (
          <div className="notice" role="status">
            {actionNotice}
            <button onClick={() => setPage("actions")}>Mở Công việc</button>
            <button
              aria-label="Đóng thông báo công việc"
              onClick={() => setActionNotice("")}
            >
              ×
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button onClick={() => setPage("memories")}>Mở Trí nhớ</button>
            <button
              aria-label="Đóng thông báo trí nhớ"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}
        <React.Suspense
          fallback={
            <div className="page" role="status">
              Đang mở trang…
            </div>
          }
        >
          {loading ? (
            <div className="page" role="status">
              <p>Đang tải và đồng bộ hội thoại…</p>
            </div>
          ) : !ready ? (
            <div className="page">
              <h1>Chưa thể tải dữ liệu</h1>
              <button onClick={initialize}>Tải lại hội thoại</button>
            </div>
          ) : page === "actions" ? (
            <Actions />
          ) : page === "workspaces" ? (
            <Workspaces
              workspace={workspace}
              onChanged={refreshWorkspaces}
              onSelect={selectWorkspace}
            />
          ) : page === "memories" ? (
            <Memories />
          ) : page === "knowledge" ? (
            <Knowledge onOpenSource={setOpenSource} />
          ) : page === "learned" ? (
            <Learned />
          ) : (
            <Chat
              key={temporary ? "temporary" : selected || "new"}
              temporary={temporary}
              onToggleTemporary={() => newChat(!temporary)}
              onRemember={setRememberMessage}
              onCreateAction={setComposeMessage}
              onOpenSource={setOpenSource}
              title={items.find((i) => i.id === selected)?.title}
              focusMessageId={focusMessageId}
              sources={sources}
              messages={messages}
              busy={busy}
              status={status}
              onSend={send}
              onStop={() => abort.current?.abort()}
              onRegenerate={() => send(null, true)}
            />
          )}
        </React.Suspense>
      </main>
      {composeMessage && (
        <React.Suspense
          fallback={
            <div className="notice" role="status">
              Đang mở trình soạn bản nháp…
            </div>
          }
        >
          <ActionComposer
            message={composeMessage}
            onClose={() => setComposeMessage(null)}
            onCreated={(a) => {
              setActionNotice("Đã tạo bản nháp: " + a.title);
              setComposeMessage(null);
              setPage("actions");
            }}
          />
        </React.Suspense>
      )}
      {openSource && (
        <SourceViewer
          key={openSource.source + ":" + openSource.chunk}
          source={openSource}
          onClose={() => setOpenSource(null)}
        />
      )}
      {rememberMessage && (
        <MemoryEditor
          message={rememberMessage}
          onClose={() => setRememberMessage(null)}
          onSaved={(result) =>
            setNotice(
              result.status === "conflict"
                ? "Thông tin mới có thể mâu thuẫn với ký ức cũ. Hãy chọn điều cần ghi nhớ."
                : result.status === "existing"
                  ? "Thông tin này đã có trong trí nhớ."
                  : result.comparisonLimited
                    ? "Đã lưu ký ức; hiện chỉ kiểm tra mâu thuẫn cơ bản. Bạn có thể xem và sửa trong Trí nhớ."
                    : "Đã lưu ký ức theo lựa chọn của bạn.",
            )
          }
        />
      )}
    </div>
  );
}
