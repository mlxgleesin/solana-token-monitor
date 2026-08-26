import { test } from "node:test";
import assert from "node:assert/strict";
import { latestSampleOlderThan, canAlert, markAlerted, type State } from "../src/state.js";

const H = 3600_000;

function makeState(overrides: Partial<State> = {}): State {
  return {
    lastLiquidityUsd: null,
    lastPairAddress: null,
    hourlyVolumes: [],
    holderHistory: [],
    lastAlertAt: {},
    ...overrides,
  };
}

// ---------- latestSampleOlderThan ----------
// 修复目标：holder 日增速应该对比「最接近 24h 前」的样本，
// 而不是历史里最老的一条（旧实现 find 永远命中 7 天前的样本）。

test("latestSampleOlderThan 返回满足最小年龄的最新样本，而非最老样本", () => {
  const now = 1_000_000 * H;
  const history = [
    { ts: now - 170 * H, count: 100 },
    { ts: now - 100 * H, count: 500 },
    { ts: now - 25 * H, count: 900 },
    { ts: now - 24 * H, count: 950 },
    { ts: now - 1 * H, count: 1000 },
  ];
  const sample = latestSampleOlderThan(history, now, 23 * H);
  assert.deepEqual(sample, { ts: now - 24 * H, count: 950 });
});

test("latestSampleOlderThan 没有足够老的样本时返回 undefined", () => {
  const now = 1_000_000 * H;
  const history = [
    { ts: now - 10 * H, count: 100 },
    { ts: now - 1 * H, count: 110 },
  ];
  assert.equal(latestSampleOlderThan(history, now, 23 * H), undefined);
});

test("latestSampleOlderThan 空历史返回 undefined", () => {
  assert.equal(latestSampleOlderThan([], 1_000_000, 23 * H), undefined);
});

// ---------- canAlert / markAlerted ----------
// 修复目标：判断与记录分离。canAlert 只读不写，
// 发送成功后才 markAlerted，发送失败时不会误标记为「已告警」。

test("canAlert 对新 key 返回 true 且不修改 state", () => {
  const state = makeState();
  const now = 1_000_000 * H;
  assert.equal(canAlert(state, "lp_remove", 30, now), true);
  assert.deepEqual(state.lastAlertAt, {}, "canAlert 不应有副作用");
});

test("markAlerted 后冷却期内 canAlert 返回 false，冷却期过后返回 true", () => {
  const state = makeState();
  const now = 1_000_000 * H;
  markAlerted(state, "lp_remove", now);
  assert.equal(canAlert(state, "lp_remove", 30, now + 29 * 60_000), false);
  assert.equal(canAlert(state, "lp_remove", 30, now + 31 * 60_000), true);
});

test("不同 key 的冷却互不影响", () => {
  const state = makeState();
  const now = 1_000_000 * H;
  markAlerted(state, "lp_remove", now);
  assert.equal(canAlert(state, "volume_spike", 30, now + 60_000), true);
});
