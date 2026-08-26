// ============================================================
// 价格异动分类（纯函数，可单测）
// 拉盘/砸盘的「点火确认」信号：1h 涨跌幅超阈值时，
// 结合买卖比给出定性分析。
// ============================================================

export interface PriceMoveThresholds {
  /** 1h 涨跌幅告警阈值（百分数，10 = ±10%） */
  priceSpikePct: number;
  /** 买盘占比偏离 50% 视为占优的幅度 */
  buyRatioSkew: number;
}

export function classifyPriceMove(
  h1ChangePct: number,
  buyRatio: number,
  th: PriceMoveThresholds,
): { key: string; text: string } | null {
  const buyPct = (buyRatio * 100).toFixed(0);

  if (h1ChangePct >= th.priceSpikePct) {
    const analysis =
      buyRatio > 0.5 + th.buyRatioSkew
        ? "买盘主导，真金白银在推"
        : buyRatio < 0.5 - th.buyRatioSkew
          ? "但卖盘占优，警惕诱多出货"
          : "但买卖大致均衡，警惕对倒自拉";
    return {
      key: "price_spike_up",
      text: `🚀 价格异动 — 疑似拉盘启动\n1h 涨幅 +${h1ChangePct.toFixed(1)}%，买盘占比 ${buyPct}%，${analysis}`,
    };
  }

  if (h1ChangePct <= -th.priceSpikePct) {
    const analysis =
      buyRatio < 0.5 - th.buyRatioSkew
        ? "卖压主导，疑似出货/砸盘"
        : "但买盘仍在承接，可能是洗盘或恐慌错杀";
    return {
      key: "price_spike_down",
      text: `📉 价格异动 — 疑似砸盘\n1h 跌幅 ${h1ChangePct.toFixed(1)}%，买盘占比 ${buyPct}%，${analysis}`,
    };
  }

  return null;
}
