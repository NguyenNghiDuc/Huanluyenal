const KEY = "al.session.v1";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pages = new Set(["chat", "memories", "knowledge", "learned"]);
export function readSession() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY));
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
export function saveSession(conversationId, page) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ conversationId, page }));
  } catch {
    /* Browser storage may be disabled; chat still works. */
  }
}
