import { z } from "zod";
import { readFileSync, statSync } from "node:fs";
import { safeKnowledgePath } from "../rag.js";
export default {
  name: "read_file",
  description:
    "Đọc một phần file .md/.txt trong knowledge/. Dùng đường dẫn tương đối, không dùng symlink.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", maxLength: 240 },
      offset: { type: "integer", minimum: 0 },
      limit: { type: "integer", minimum: 1, maximum: 8000 },
    },
    required: ["path"],
    additionalProperties: false,
  },
  schema: z
    .object({
      path: z.string().min(1).max(240),
      offset: z.number().int().min(0).max(262144).default(0),
      limit: z.number().int().min(1).max(8000).default(4000),
    })
    .strict(),
  async execute({ path, offset, limit }, { root }) {
    const full = safeKnowledgePath(root, path);
    if (statSync(full).size > 262144) throw new Error("File quá lớn.");
    const text = readFileSync(full, "utf8");
    return {
      source: path,
      offset,
      content: text.slice(offset, offset + limit),
      hasMore: text.length > offset + limit,
    };
  },
};
