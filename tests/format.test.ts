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
