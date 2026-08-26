import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkMessage } from "../src/telegram.js";

// 修复目标：Telegram 单条消息上限 4096 字符，
// 超长消息（尤其大户批量转账时）需按段落切分，而不是静默发送失败。

test("chunkMessage 短消息原样返回单块", () => {
  assert.deepEqual(chunkMessage("hello", 4096), ["hello"]);
});

test("chunkMessage 按空行段落切分，每块不超过上限", () => {
  const para = (s: string) => s.repeat(100); // 100 字符段落
  const text = [para("a"), para("b"), para("c")].join("\n\n");
  const chunks = chunkMessage(text, 250);
  assert.equal(chunks.length, 2, "100+2+100=202 < 250，前两段合并，第三段单独");
  for (const c of chunks) assert.ok(c.length <= 250);
  assert.equal(chunks.join("\n\n"), text, "内容无丢失");
});

test("chunkMessage 单段落超限时硬切", () => {
  const text = "x".repeat(1000);
  const chunks = chunkMessage(text, 300);
  assert.ok(chunks.length >= 4);
  for (const c of chunks) assert.ok(c.length <= 300);
  assert.equal(chunks.join(""), text, "内容无丢失");
});
