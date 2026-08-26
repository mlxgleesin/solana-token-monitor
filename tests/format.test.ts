import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAlerts, fmtAmount, type TransferEvent } from "../worker/src/format.js";

const CEX = { BinanceHotWallet11111111111111111111111111: "Binance Hot Wallet" };

const ev = (o: Partial<TransferEvent> = {}): TransferEvent => ({
  signature: "sig111",
  from: "WhaleAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  to: "DestBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  amount: 1000,
  ...o,
});

// ---------- fmtAmount ----------

test("fmtAmount 千/百万/十亿缩写", () => {
  assert.equal(fmtAmount(999), "999");
  assert.equal(fmtAmount(1_500_000), "1.50M");
  assert.equal(fmtAmount(2_000_000_000), "2.00B");
  assert.equal(fmtAmount(1229.508), "1,229.5");
});

// ---------- formatAlerts ----------

test("转入 CEX 的转账渲染为最高级告警并排在最前", () => {
  const events = [
    ev(),
    ev({ to: "BinanceHotWallet11111111111111111111111111", amount: 999999, signature: "sigCEX" }),
  ];
  const msg = formatAlerts(events, { tokenAddress: "MintXYZ", priceUsd: 0.034, cexAddresses: CEX });
  assert.ok(msg.includes("🚨🚨"), "有最高级告警标记");
  assert.ok(msg.includes("Binance Hot Wallet"), "显示交易所标签");
  assert.ok(msg.indexOf("🚨🚨") < msg.indexOf("⚠️"), "CEX 告警排在普通异动之前");
});

test("同一发送方多笔转账聚合为一个分散转出块", () => {
  const events = [
    ev({ to: "Dest1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", amount: 1229.508 }),
    ev({ to: "Dest2BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", amount: 647.705 }),
    ev({ to: "Dest3CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", amount: 689.485 }),
  ];
  const msg = formatAlerts(events, { tokenAddress: "MintXYZ", priceUsd: null, cexAddresses: {} });
  assert.equal(msg.match(/分散转出/g)?.length, 1, "只出现一个聚合块");
  assert.ok(msg.includes("×3") || msg.includes("3 个地址"), "标明笔数");
  assert.ok(msg.includes("2,566.7"), "显示合计数量");
  assert.ok(msg.includes("分仓"), "带模式分析提示");
});

test("有价格时显示美元估值，无价格时不显示 $", () => {
  const withPrice = formatAlerts([ev({ amount: 1_000_000 })], {
    tokenAddress: "MintXYZ",
    priceUsd: 0.034,
    cexAddresses: {},
  });
  assert.ok(withPrice.includes("$34.0k"), "1M × $0.034 = $34.0k");
  const noPrice = formatAlerts([ev()], { tokenAddress: "MintXYZ", priceUsd: null, cexAddresses: {} });
  assert.ok(!noPrice.includes("$"), "无价格时不出现 $");
});

test("转入销毁地址识别为 🔥", () => {
  const msg = formatAlerts(
    [ev({ to: "1nc1nerator11111111111111111111111111111111" })],
    { tokenAddress: "MintXYZ", priceUsd: null, cexAddresses: {} },
  );
  assert.ok(msg.includes("🔥"), "销毁标记");
  assert.ok(msg.includes("销毁"), "销毁说明");
});

test("结构化字段卡：含发送/接收/数量/分析字段与收尾符", () => {
  const msg = formatAlerts([ev({ to: "BinanceHotWallet11111111111111111111111111" })], {
    tokenAddress: "MintXYZ",
    priceUsd: null,
    cexAddresses: CEX,
  });
  for (const field of ["├ 发送", "├ 接收", "├ 数量", "├ 分析", "└ "]) {
    assert.ok(msg.includes(field), `缺少字段 ${field}`);
  }
});

test("多个块之间有分割线", () => {
  const msg = formatAlerts(
    [ev(), ev({ to: "BinanceHotWallet11111111111111111111111111", signature: "sigCEX" })],
    { tokenAddress: "MintXYZ", priceUsd: null, cexAddresses: CEX },
  );
  const parts = msg.split("━━");
  assert.ok(parts.length >= 3, "头部与两个块之间应有分割线");
});

test("CEX 转出占比小 → 分析提示试探性出货；占比大 → 提示清仓风险", () => {
  const cexTo = "BinanceHotWallet11111111111111111111111111";
  const probe = formatAlerts([ev({ to: cexTo, amount: 999_999 })], {
    tokenAddress: "MintXYZ",
    priceUsd: null,
    cexAddresses: CEX,
    senderBalances: { WhaleAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA: 707_990_018 },
  });
  assert.ok(probe.includes("试探"), "0.1% 占比应判为试探性出货");
  const dump = formatAlerts([ev({ to: cexTo, amount: 500_000_000 })], {
    tokenAddress: "MintXYZ",
    priceUsd: null,
    cexAddresses: CEX,
    senderBalances: { WhaleAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA: 100_000_000 },
  });
  assert.ok(dump.includes("清仓"), "83% 占比应提示清仓风险");
});

test("大户收到大额 SOL → 💰 弹药到位告警，排在 CEX 之后、普通异动之前", () => {
  const events = [
    ev(),
    ev({
      from: "SomeFunderCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
      to: "WhaleAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      amount: 120,
      asset: "SOL",
      signature: "sigFund",
    }),
    ev({ to: "BinanceHotWallet11111111111111111111111111", amount: 5000, signature: "sigCEX" }),
  ];
  const msg = formatAlerts(events, { tokenAddress: "MintXYZ", priceUsd: null, cexAddresses: CEX });
  assert.ok(msg.includes("💰"), "弹药标记");
  assert.ok(msg.includes("弹药"), "弹药说明");
  assert.ok(msg.includes("120 SOL"), "SOL 数量带单位");
  assert.ok(msg.indexOf("🚨🚨") < msg.indexOf("💰"), "CEX 出货告警优先级最高");
  assert.ok(msg.indexOf("💰") < msg.indexOf("⚠️"), "弹药排在普通异动之前");
});

test("大户收到大额稳定币 → 💰 告警，金额按美元计", () => {
  const msg = formatAlerts(
    [ev({ amount: 25000, asset: "USDC", to: "WhaleAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" })],
    { tokenAddress: "MintXYZ", priceUsd: null, cexAddresses: {} },
  );
  assert.ok(msg.includes("💰"));
  assert.ok(msg.includes("25,000 USDC"));
});

test("地址与交易带 Solscan 链接，发送方余额展示", () => {
  const msg = formatAlerts([ev()], {
    tokenAddress: "MintXYZ",
    priceUsd: null,
    cexAddresses: {},
    senderBalances: { WhaleAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA: 707_990_018 },
  });
  assert.ok(msg.includes("https://solscan.io/account/WhaleAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"));
  assert.ok(msg.includes("https://solscan.io/tx/sig111"));
  assert.ok(msg.includes("708.0M") || msg.includes("707.99M"), "发送方余额缩写显示");
});
