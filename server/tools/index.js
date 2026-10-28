import getTime from "./get_time.js";
import calculator from "./calculator.js";
import readFile from "./read_file.js";
import webSearch from "./web_search.js";
import proposeKnowledge from "./propose_knowledge.js";
export function createTools(context) {
  const tools = [
    getTime,
    calculator,
    readFile,
    ...(context.db ? [proposeKnowledge] : []),
    ...(process.env.BRAVE_SEARCH_API_KEY ? [webSearch] : []),
  ];
  return {
    definitions: tools.map(({ name, description, input_schema }) => ({
      name,
      description,
      input_schema,
    })),
    async execute(block, signal) {
      const tool = tools.find((t) => t.name === block.name);
      if (!tool)
        return {
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: "Công cụ không khả dụng.",
        };
      const input = tool.schema.safeParse(block.input);
      if (!input.success)
        return {
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: "Tham số công cụ không hợp lệ.",
        };
      try {
        if (signal?.aborted) throw new Error("Stopped");
        const result = await tool.execute(input.data, { ...context, signal });
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        };
      } catch {
        return {
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content:
            "Không thể thực hiện công cụ. Kiểm tra tham số, quyền truy cập, đường dẫn hoặc thử lại sau.",
        };
      }
    },
  };
}
