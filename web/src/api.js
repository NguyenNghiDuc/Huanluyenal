export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
export async function api(path, options = {}) {
  const response = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(data.error || "Yêu cầu thất bại.", response.status);
  return data;
}
export async function streamChat(
  body,
  signal,
  onEvent,
  workspaceId = "personal",
) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Workspace-Id": workspaceId,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error((await response.json()).error);
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const part = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const lines = part.split("\n");
        const event = lines.find((l) => l.startsWith("event: "))?.slice(7);
        const data = lines.find((l) => l.startsWith("data: "));
        if (!data) continue;
        const parsed = JSON.parse(data.slice(6));
        if (event === "error") throw new Error(parsed.error);
        if (event === "done") finished = true;
        onEvent(event, parsed);
      }
    }
    if (!finished)
      throw new Error("Kết nối bị gián đoạn. Bạn có thể tạo lại câu trả lời.");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
