import { artifactInput, createArtifact } from "../workflows.js";
export default {
  name: "create_artifact",
  description:
    "Tạo bản nháp danh sách việc (task_list), kế hoạch học tập (study_plan) hoặc tài liệu (document) trong không gian hiện tại. Chỉ khi người dùng yêu cầu tạo/lưu kế hoạch hoặc công việc. Không thực hiện hay gửi ra ngoài. Dùng tối đa 30 việc và không bịa ngày hạn.",
  input_schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["task_list", "study_plan", "document"] },
      title: { type: "string", maxLength: 120 },
      summary: { type: "string", maxLength: 1000 },
      body: { type: "string", maxLength: 20000 },
      tasks: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          properties: {
            title: { type: "string", maxLength: 160 },
            notes: { type: "string", maxLength: 1200 },
            dueDate: {
              type: ["string", "null"],
              description: "YYYY-MM-DD hoặc null",
            },
            priority: { type: "string", enum: ["low", "normal", "high"] },
          },
          required: ["title"],
          additionalProperties: false,
        },
      },
    },
    required: ["kind", "title"],
    additionalProperties: false,
  },
  schema: artifactInput,
  async execute(input, { db, conversationId, onArtifact }) {
    const a = createArtifact(db, input, { conversationId, deduplicate: true });
    onArtifact?.({ id: a.id, kind: a.kind, title: a.title });
    return {
      id: a.id,
      title: a.title,
      status: a.status,
      message:
        "Đã tạo bản nháp trong trang Công việc; chưa thực hiện hoặc gửi ra ngoài.",
    };
  },
};
