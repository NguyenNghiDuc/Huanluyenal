import Anthropic from "@anthropic-ai/sdk";
export const MODEL = "claude-sonnet-4-6";
export function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("MISSING_KEY");
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 60000,
    maxRetries: 1,
  });
}
export function friendly(error) {
  if (error.message === "TOOL_LIMIT")
    return "Đã đạt giới hạn 5 lượt gọi công cụ. Hãy chia nhỏ yêu cầu.";
  if (error.message === "MISSING_KEY")
    return "Chưa cấu hình ANTHROPIC_API_KEY trong server/.env.";
  if (
    error.status === 429 ||
    error.status === 402 ||
    /credit balance|billing|quota|insufficient credit/i.test(
      error.message || "",
    )
  )
    return "API đã hết hạn mức hoặc đang quá tải. Vui lòng thử lại sau.";
  if (error.status === 401)
    return "API key không hợp lệ. Vui lòng kiểm tra cấu hình server.";
  if (
    error.name === "AbortError" ||
    /timeout|aborted/i.test((error.message || "") + " " + error.name)
  )
    return "Yêu cầu đã hết thời gian chờ. Vui lòng thử lại.";
  return "Không thể kết nối dịch vụ AI. Vui lòng thử lại sau.";
}
export async function answer({
  messages,
  system,
  signal,
  onText,
  onStatus = () => {},
  tools,
  api,
}) {
  const service = api || client();
  const thread = structuredClone(messages);
  for (let round = 0; round <= 5; round++) {
    if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
    const definitions = tools?.definitions || [];
    const stream = service.messages.stream(
      {
        model: MODEL,
        max_tokens: 4096,
        system,
        messages: thread,
        ...(definitions.length
          ? {
              tools: definitions,
              ...(round === 5 ? { tool_choice: { type: "none" } } : {}),
            }
          : {}),
      },
      { signal },
    );
    stream.on("text", onText);
    const response = await stream.finalMessage();
    const calls = response.content.filter((b) => b.type === "tool_use");
    if (!calls.length) return response;
    if (round === 5 || calls.length > 8) throw new Error("TOOL_LIMIT");
    thread.push({ role: "assistant", content: response.content });
    const results = [];
    for (const call of calls) {
      if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
      onStatus("Đang dùng công cụ " + call.name + "…");
      results.push(await tools.execute(call, signal));
    }
    thread.push({ role: "user", content: results });
    onText("\n");
  }
  throw new Error("TOOL_LIMIT");
}
