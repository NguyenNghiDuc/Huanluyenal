// Keep private history only in React memory and below the server's JSON limit.
export function temporaryHistory(messages, text, regenerate = false) {
  let history = regenerate
    ? messages.slice(0, messages.map((m) => m.role).lastIndexOf("user") + 1)
    : [...messages, { role: "user", content: text }];
  history = history
    .filter((m) => m.content)
    .map(({ role, content }) => ({ role, content }))
    .slice(-40);
  while (history[0]?.role === "assistant") history.shift();
  const bytes = () =>
    new TextEncoder().encode(
      JSON.stringify({ temporary: true, messages: history }),
    ).length;
  while (history.length > 1 && bytes() > 55000) {
    history.shift();
    while (history[0]?.role === "assistant") history.shift();
  }
  return history;
}
