import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { calculate } from "../tools/calculator.js";
import { createTools } from "../tools/index.js";
import { answer } from "../llm.js";
test("step 6: calculator, time, confined read and argument validation", async () => {
  assert.equal(calculate("(2+3)*4^2"), 80);
  assert.equal(calculate("2^3^2"), 512);
  assert.throws(() => calculate("process.exit()"));
  assert.throws(() => calculate("1/0"));
  const root = mkdtempSync(join(tmpdir(), "al-tools-"));
  try {
    writeFileSync(join(root, "test.md"), "xin chào");
    const tools = createTools({ root });
    const exec = (name, input) => tools.execute({ id: "tool1", name, input });
    assert.equal(
      JSON.parse((await exec("read_file", { path: "test.md" })).content)
        .content,
      "xin chào",
    );
    assert.equal(
      (await exec("read_file", { path: "../secret.txt" })).is_error,
      true,
    );
    assert.equal(
      (await exec("calculator", { expression: "1+1", extra: true })).is_error,
      true,
    );
    assert.equal(
      JSON.parse((await exec("get_time", {})).content).timezone,
      "Asia/Ho_Chi_Minh",
    );
    assert.equal(
      (await exec("get_time", { timezone: "invalid" })).is_error,
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("step 6: agent uses results and stops after five tool rounds", async () => {
  let calls = 0,
    requests = [],
    text = "";
  const api = {
    messages: {
      stream(params) {
        requests.push(params);
        let callback;
        return {
          on(_, cb) {
            callback = cb;
          },
          async finalMessage() {
            if (params.tools?.length && params.tool_choice?.type !== "none") {
              return {
                content: [
                  {
                    type: "tool_use",
                    id: "call" + requests.length,
                    name: "calculator",
                    input: { expression: "1+1" },
                  },
                ],
              };
            }
            callback("Kết quả 2");
            return { content: [{ type: "text", text: "Kết quả 2" }] };
          },
        };
      },
    },
  };
  const tools = createTools({ root: tmpdir() });
  const execute = tools.execute;
  tools.execute = async (...args) => {
    calls++;
    return execute(...args);
  };
  await answer({
    api,
    messages: [{ role: "user", content: "Tính" }],
    system: "al",
    tools,
    onText: (t) => (text += t),
  });
  assert.equal(calls, 5);
  assert.equal(requests.length, 6);
  assert.equal(requests[5].tool_choice.type, "none");
  assert.equal(requests[1].messages[2].content[0].type, "tool_result");
  assert.match(text, /Kết quả 2/);
});
