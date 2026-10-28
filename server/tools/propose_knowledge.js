import { z } from "zod";
import { propose } from "../learning.js";
export default {
  name: "propose_knowledge",
  description:
    "Đề xuất kiến thức hữu ích, có thể tái sử dụng. Chỉ lưu vào hàng chờ, người dùng phải duyệt trên web trước khi có hiệu lực. Không đề xuất bí mật, dữ liệu cá nhân (dùng trí nhớ), hoặc khẳng định chưa kiểm chứng. Giải thích lý do và ghi nguồn trong nội dung nếu có.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", maxLength: 120 },
      content: { type: "string", maxLength: 8000 },
      reason: { type: "string", maxLength: 500 },
    },
    required: ["title", "content", "reason"],
    additionalProperties: false,
  },
  schema: z
    .object({
      title: z.string().trim().min(1).max(120),
      content: z.string().trim().min(1).max(8000),
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
  async execute(input, { db, conversationId }) {
    return propose(db, input, conversationId);
  },
};
