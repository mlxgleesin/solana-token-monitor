// ============================================================
// 主监控脚本（由 GitHub Actions 每 5 分钟跑一次）
// 检查项：
//   0. 主池切换（跨池 LP 对比无意义，重置基线并提示）
//   1. LP 变化 ±20%（加池=拉盘前奏 / 撤池=跑路）
//   2. 1h 量能 > 滚动均值 3 倍（配合买卖比标注，最多累计 7 天样本）
//   3. holder 数增速（每小时采样一次，日增速超阈值告警）
//
// 告警先收集、发送成功后才记录冷却时间；发送失败时整轮 state
// 不落盘，下一轮会重新评估并重发（宁可重复也不静默丢告警）。
// ============================================================
import { TOKEN_ADDRESS, THRESHOLDS } from "./config.js";
import { fetchMainPair } from "./dexscreener.js";
import { fetchHolderCount } from "./birdeye.js";
import { loadState, saveState, canAlert, markAlerted, latestSampleOlderThan } from "./state.js";
import { classifyPriceMove } from "./pricemove.js";
import { sendTelegram } from "./telegram.js";

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

async function main() {
  const state = await loadState();
  const pending: { key: string; text: string }[] = [];
  const now = Date.now();

  const pair = await fetchMainPair(TOKEN_ADDRESS);
  if (!pair) {
    console.error("未获取到交易对数据，检查合约地址是否正确");
    return;
  }

  const liq = pair.liquidity?.usd ?? 0;
  const volH1 = pair.volume?.h1 ?? 0;
  const { buys = 0, sells = 0 } = pair.txns?.h1 ?? {};
  const totalTx = buys + sells;
  const buyRatio = totalTx > 0 ? buys / totalTx : 0.5;

  // ---------- 0. 主池切换 ----------
  if (state.lastPairAddress && state.lastPairAddress !== pair.pairAddress) {
    if (canAlert(state, "pair_switch", THRESHOLDS.alertCooldownMinutes, now)) {
      pending.push({
        key: "pair_switch",
        text:
          `🔀 主池变更（LP 基线已重置）\n` +
          `<code>${state.lastPairAddress}</code>\n→ <code>${pair.pairAddress}</code>\n` +
          `可能是原主池被撤或有人开二池，建议到 Solscan 人工确认`,
      });
    }
    state.lastLiquidityUsd = null;
  }
  state.lastPairAddress = pair.pairAddress;

  // ---------- 1. LP 变化 ----------
  if (state.lastLiquidityUsd !== null && state.lastLiquidityUsd > 0) {
    const change = (liq - state.lastLiquidityUsd) / state.lastLiquidityUsd;
    if (Math.abs(change) > THRESHOLDS.lpChangeRatio) {
      const key = change > 0 ? "lp_add" : "lp_remove";
      if (canAlert(state, key, THRESHOLDS.alertCooldownMinutes, now)) {
        const icon = change > 0 ? "🟡 加池子（可能是拉盘前奏）" : "🔴 撤池子（跑路风险！）";
        pending.push({
          key,
          text: `${icon}\nLP: ${fmt(state.lastLiquidityUsd)} → ${fmt(liq)} (${(change * 100).toFixed(1)}%)`,
        });
      }
    }
  }
  state.lastLiquidityUsd = liq;

  // ---------- 2. 量能异动 ----------
  // 每小时最多记录一条量能样本
  const lastVolSample = state.hourlyVolumes.at(-1);
  if (!lastVolSample || now - lastVolSample.ts >= 55 * 60_000) {
    state.hourlyVolumes.push({ ts: now, volH1 });
  }
  // 至少积累 24 个样本后才开始判断，避免冷启动误报
  if (state.hourlyVolumes.length >= 24) {
    const avg =
      state.hourlyVolumes.reduce((s, v) => s + v.volH1, 0) / state.hourlyVolumes.length;
    if (avg > 0 && volH1 > avg * THRESHOLDS.volumeSpikeMultiple) {
      if (canAlert(state, "volume_spike", THRESHOLDS.alertCooldownMinutes, now)) {
        const skewNote =
          Math.abs(buyRatio - 0.5) > THRESHOLDS.buyRatioSkew
            ? buyRatio > 0.5
              ? "，买盘明显占优（可能真人 FOMO 进场）"
              : "，卖盘明显占优（可能在出货）"
            : "，买卖大致均衡（警惕对倒刷量）";
        pending.push({
          key: "volume_spike",
          text:
            `📈 量能异动\n1h 成交量 ${fmt(volH1)}，为近 ${state.hourlyVolumes.length}h 均值 (${fmt(avg)}) 的 ${(volH1 / avg).toFixed(1)} 倍\n` +
            `1h 买/卖笔数: ${buys}/${sells}，买盘占比 ${(buyRatio * 100).toFixed(0)}%${skewNote}`,
        });
      }
    }
  }

  // ---------- 2.5 价格异动（拉盘/砸盘的点火确认） ----------
  const h1Change = pair.priceChange?.h1;
  if (typeof h1Change === "number") {
    const move = classifyPriceMove(h1Change, buyRatio, {
      priceSpikePct: THRESHOLDS.priceSpikePct,
      buyRatioSkew: THRESHOLDS.buyRatioSkew,
    });
    if (move && canAlert(state, move.key, THRESHOLDS.alertCooldownMinutes, now)) {
      pending.push({ key: move.key, text: move.text });
    }
  }

  // ---------- 3. holder 增速（每小时采样） ----------
  const lastHolderSample = state.holderHistory.at(-1);
  if (!lastHolderSample || now - lastHolderSample.ts >= 55 * 60_000) {
    const count = await fetchHolderCount(TOKEN_ADDRESS);
    if (count !== null) {
      state.holderHistory.push({ ts: now, count });
      // 找最接近 24 小时前的样本对比（而非历史里最老的一条）
      const dayAgo = latestSampleOlderThan(state.holderHistory, now, 23 * 3600_000);
      if (dayAgo && dayAgo.count > 0) {
        const growth = (count - dayAgo.count) / dayAgo.count;
        if (growth > THRESHOLDS.holderGrowthDaily) {
          if (canAlert(state, "holder_growth", THRESHOLDS.holderAlertCooldownMinutes, now)) {
            pending.push({
              key: "holder_growth",
              text: `👥 持有人加速增长\n24h: ${dayAgo.count} → ${count} (+${(growth * 100).toFixed(1)}%)\n真人进场信号，注意配合量能与社交面判断`,
            });
          }
        }
      }
    }
  }

  // ---------- 发送 ----------
  if (pending.length) {
    const header = `<b>🎯 代币监控告警</b>\n<code>${TOKEN_ADDRESS.slice(0, 8)}...</code> | ${pair.dexId}\n价格 $${pair.priceUsd} | LP ${fmt(liq)}\n${pair.url}\n\n`;
    // 发送失败会抛错 → 本轮 state 不保存，下一轮重新评估重发
    await sendTelegram(header + pending.map((p) => p.text).join("\n\n"));
    for (const p of pending) markAlerted(state, p.key, now);
    console.log(`已发送 ${pending.length} 条告警`);
  } else {
    console.log(
      `正常 | 价格 $${pair.priceUsd} | LP ${fmt(liq)} | 1h vol ${fmt(volH1)} | buy% ${(buyRatio * 100).toFixed(0)}`,
    );
  }

  await saveState(state);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
