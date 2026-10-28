import { z } from "zod";
export function calculate(expression) {
  const compact = expression.replace(/\s/g, "");
  const tokens =
    compact.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[()+\-*/%^]/gi) || [];
  if (tokens.join("") !== compact || !tokens.length || tokens.length > 200)
    throw new Error("Biểu thức không hợp lệ.");
  let i = 0;
  function atom() {
    const token = tokens[i++];
    if (token === "+") return atom();
    if (token === "-") return -atom();
    if (token === "(") {
      const value = expr(0);
      if (tokens[i++] !== ")") throw new Error("Thiếu dấu đóng ngoặc.");
      return value;
    }
    if (!token || !/^(\d|\.)/.test(token)) throw new Error("Thiếu số.");
    return Number(token);
  }
  const precedence = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3 };
  function expr(min) {
    let left = atom();
    while (i < tokens.length && (precedence[tokens[i]] || 0) > min) {
      const op = tokens[i++],
        p = precedence[op];
      const right = expr(op === "^" ? p - 1 : p);
      left =
        op === "+"
          ? left + right
          : op === "-"
            ? left - right
            : op === "*"
              ? left * right
              : op === "/"
                ? left / right
                : op === "%"
                  ? left % right
                  : left ** right;
      if (!Number.isFinite(left))
        throw new Error("Kết quả không hữu hạn hoặc chia cho 0.");
    }
    return left;
  }
  const result = expr(0);
  if (i !== tokens.length || !Number.isFinite(result))
    throw new Error("Biểu thức không hợp lệ.");
  return result;
}
export default {
  name: "calculator",
  description:
    "Tính số học với + - * / % ^ và ngoặc. Dùng ngoặc rõ ràng cho số âm.",
  input_schema: {
    type: "object",
    properties: { expression: { type: "string", maxLength: 300 } },
    required: ["expression"],
    additionalProperties: false,
  },
  schema: z.object({ expression: z.string().trim().min(1).max(300) }).strict(),
  async execute({ expression }) {
    return { expression, result: calculate(expression) };
  },
};
