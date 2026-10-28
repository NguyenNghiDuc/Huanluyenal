import { z } from "zod";
export default {
  name: "get_time",
  description:
    "Lấy thời gian hiện tại theo múi giờ IANA, mặc định Asia/Ho_Chi_Minh.",
  input_schema: {
    type: "object",
    properties: {
      timezone: { type: "string", description: "Ví dụ Asia/Ho_Chi_Minh" },
    },
    additionalProperties: false,
  },
  schema: z
    .object({ timezone: z.string().max(80).default("Asia/Ho_Chi_Minh") })
    .strict(),
  async execute({ timezone }) {
    return {
      iso: new Date().toISOString(),
      timezone,
      local: new Intl.DateTimeFormat("vi-VN", {
        timeZone: timezone,
        dateStyle: "full",
        timeStyle: "long",
      }).format(new Date()),
    };
  },
};
