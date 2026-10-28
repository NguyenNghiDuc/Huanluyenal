const KEY = "al.session.v1";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pages = new Set([
  "chat",
  "memories",
  "knowledge",
  "learned",
  "actions",
  "workspaces",
]);
const sessionKey = (id) => (id === "personal" ? KEY : KEY + ":" + id);
export function readSession(workspaceId = "personal") {
  try {
    const value = JSON.parse(localStorage.getItem(sessionKey(workspaceId)));
    return {
      conversationId: uuid.test(value?.conversationId)
        ? value.conversationId
        : null,
      page: pages.has(value?.page) ? value.page : "chat",
    };
  } catch {
    return { conversationId: null, page: "chat" };
  }
}
export function saveSession(conversationId, page, workspaceId = "personal") {
  try {
    localStorage.setItem(
      sessionKey(workspaceId),
      JSON.stringify({ conversationId, page }),
    );
  } catch {
    /* Browser storage may be disabled; chat still works. */
  }
}
