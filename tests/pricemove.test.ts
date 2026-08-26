import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyPriceMove } from "../src/pricemove.js";

const TH = { priceSpikePct: 10, buyRatioSkew: 0.1 };

test("1h 涨幅超阈值且买盘主导 → 拉盘启动信号", () => {
  const r = classifyPriceMove(15.2, 0.68, TH);
  assert.ok(r);
  assert.equal(r.key, "price_spike_up");
  assert.ok(r.text.includes("🚀"));
  assert.ok(r.text.includes("15.2%"));
  assert.ok(r.text.includes("买盘主导"), "买盘占优时给出真金白银推动的分析");
});

test("涨幅超阈值但买卖均衡 → 提示对倒自拉可能", () => {
  const r = classifyPriceMove(12, 0.5, TH);
  assert.ok(r);
  assert.equal(r.key, "price_spike_up");
  assert.ok(r.text.includes("对倒"), "买卖均衡的上涨提示对倒风险");
});

test("1h 跌幅超阈值且卖压主导 → 砸盘信号", () => {
  const r = classifyPriceMove(-18, 0.25, TH);
  assert.ok(r);
  assert.equal(r.key, "price_spike_down");
  assert.ok(r.text.includes("📉"));
  assert.ok(r.text.includes("卖压主导"));
});

test("跌幅超阈值但买盘在接 → 提示可能是洗盘", () => {
  const r = classifyPriceMove(-11, 0.55, TH);
  assert.ok(r);
  assert.equal(r.key, "price_spike_down");
  assert.ok(r.text.includes("洗盘"));
});

test("涨跌幅未超阈值 → 不告警", () => {
  assert.equal(classifyPriceMove(9.9, 0.9, TH), null);
  assert.equal(classifyPriceMove(-9.9, 0.1, TH), null);
  assert.equal(classifyPriceMove(0, 0.5, TH), null);
});
