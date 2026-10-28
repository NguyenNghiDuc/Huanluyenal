import React, { useEffect, useState, useRef, useCallback } from "react";
import { api, streamChat } from "./api";
import Sidebar from "./components/Sidebar";
import Chat from "./components/Chat";
import Memories from "./components/Memories";
import Knowledge from "./components/Knowledge";
import Learned from "./components/Learned";
import { readSession, saveSession } from "./session";
import useConversationSearch from "./useConversationSearch";
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
async function settledConversation(id, signal) {
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
  const initial = useRef(null);
  if (!initial.current) initial.current = readSession();
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
    [focusMessageId, setFocusMessageId] = useState(null);
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
    if (ready) saveSession(selected, page);
  }, [selected, page, ready]);
  async function select(item) {
    if (busyRef.current) return;
    const seq = ++selectionSeq.current;
    selectionAbort.current?.abort();
    const controller = new AbortController();
    selectionAbort.current = controller;
    setLoading(true);
    setError("");
    try {
      const data = await settledConversation(item.id, controller.signal);
      if (seq !== selectionSeq.current) return;
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
  function newChat() {
    if (busyRef.current || !ready) return;
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
    let id = selected;
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
          ...(id ? { conversationId: id } : {}),
          ...(regenerate ? { regenerate: true } : { message: text }),
        },
        abort.current.signal,
        (event, data) => {
          if (event === "meta") {
            id = data.conversationId;
            setSelected(id);
            saveSession(id, "chat");
          }
          if (event === "sources") setSources(data.sources);
          if (event === "delta")
            setMessages((m) =>
              m.map((x, i) =>
                i === m.length - 1
                  ? { ...x, content: x.content + data.text }
                  : x,
              ),
            );
          if (event === "warning") setError(data.message);
          if (event === "status") setStatus(data.message);
        },
      );
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
      else setStatus("Đã dừng.");
    } finally {
      if (id) {
        try {
          const data = await settledConversation(id);
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
        {loading ? (
          <div className="page" role="status">
            <p>Đang tải và đồng bộ hội thoại…</p>
          </div>
        ) : !ready ? (
          <div className="page">
            <h1>Chưa thể tải dữ liệu</h1>
            <button onClick={initialize}>Tải lại hội thoại</button>
          </div>
        ) : page === "memories" ? (
          <Memories />
        ) : page === "knowledge" ? (
          <Knowledge />
        ) : page === "learned" ? (
          <Learned />
        ) : (
          <Chat
            key={selected || "new"}
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
      </main>
    </div>
  );
}
