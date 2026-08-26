// ============================================================
// Telegram 告警消息格式化（纯函数，可单测）
// 设计目标：信息完整（完整地址链接/美元估值/余额）、
// 同一发送方多笔聚合、按严重度排序、附模式分析提示。
// ============================================================

export interface TransferEvent {
  signature: string;
  from: string;
  to: string;
  amount: number;
  /** 资金类转账（弹药信号）：SOL / 稳定币；缺省表示被监控代币本身 */
  asset?: "SOL" | "USDC" | "USDT";
}

export interface FormatContext {
  tokenAddress: string;
  /** 当前价格（美元），拉取失败时为 null，估值相关内容自动省略 */
  priceUsd: number | null;
  cexAddresses: Record<string, string>;
  /** 发送方转账后的代币余额（查询失败的地址缺省） */
  senderBalances?: Record<string, number | null>;
}

export function fmtAmount(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function fmtUsd(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${n.toFixed(1)}`;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const acct = (a: string) => `<a href="https://solscan.io/account/${a}">${short(a)}</a>`;
const txLink = (s: string, label = "TX↗") => `<a href="https://solscan.io/tx/${s}">${label}</a>`;
const isBurn = (a: string) => a.startsWith("1nc1nerator") || /burn/i.test(a);

const SEPARATOR = "━━━━━━━━━━━━";

/** 结构化字段卡：标题 + ├ 字段行 + └ 收尾行 */
function card(title: string, fields: [string, string][], last: string): string {
  return [title, ...fields.map(([k, v]) => `├ ${k}　${v}`), `└ ${last}`].join("\n");
}

/** 按转出占比给出货程度的定性分析 */
function sellAnalysis(amount: number, balanceAfter: number | null | undefined): string {
  if (typeof balanceAfter !== "number") {
    return "大户资金进入交易所通常是出货前置动作，无法获取其余额，建议人工核对持仓变化";
  }
  const pct = (amount / (amount + balanceAfter)) * 100;
  if (pct < 5) {
    return `仅动用持仓 ${pct < 0.1 ? "<0.1" : pct.toFixed(1)}%，更像试探性出货；若出现连续充值或余额骤降，警惕转为正式出货`;
  }
  if (pct < 30) {
    return `转出占持仓 ${pct.toFixed(0)}%，属明显减仓动作，密切关注后续充值节奏`;
  }
  return `转出占持仓 ${pct.toFixed(0)}%，大幅出货，清仓风险高，注意价格端联动反应`;
}

export function formatAlerts(events: TransferEvent[], ctx: FormatContext): string {
  const usd = (amt: number) => (ctx.priceUsd == null ? "" : ` ≈ ${fmtUsd(amt * ctx.priceUsd)}`);
  const balanceField = (from: string): [string, string][] => {
    const bal = ctx.senderBalances?.[from];
    return typeof bal === "number" ? [["余额", `${fmtAmount(bal)} 枚（转出后）`]] : [];
  };

  const funding = events.filter((e) => e.asset);
  const tokenEvents = events.filter((e) => !e.asset);
  const cex = tokenEvents.filter((e) => ctx.cexAddresses[e.to]);
  const burns = tokenEvents.filter((e) => !ctx.cexAddresses[e.to] && isBurn(e.to));
  const rest = tokenEvents.filter((e) => !ctx.cexAddresses[e.to] && !isBurn(e.to));

  // 同一发送方多笔转出 → 聚合
  const bySender = new Map<string, TransferEvent[]>();
  for (const e of rest) bySender.set(e.from, [...(bySender.get(e.from) ?? []), e]);

  const blocks: string[] = [];

  for (const e of cex) {
    blocks.push(
      card(
        "🚨🚨 <b>出货警报 · 转入交易所</b>",
        [
          ["发送", acct(e.from)],
          ["接收", `<b>${ctx.cexAddresses[e.to]}</b>`],
          ["数量", `${fmtAmount(e.amount)} 枚${usd(e.amount)}`],
          ...balanceField(e.from),
          ["分析", sellAnalysis(e.amount, ctx.senderBalances?.[e.from])],
        ],
        txLink(e.signature, "查看交易 ↗"),
      ),
    );
  }

  for (const e of funding) {
    blocks.push(
      card(
        "💰 <b>弹药到位</b>",
        [
          ["来源", acct(e.from)],
          ["流入", acct(e.to)],
          ["数量", `${fmtAmount(e.amount)} ${e.asset}`],
          ["分析", "大户收到大额资金，常见于扫货或拉盘前的资金准备，关注该地址后续是否买入"],
        ],
        txLink(e.signature, "查看交易 ↗"),
      ),
    );
  }

  for (const e of burns) {
    blocks.push(
      card(
        "🔥 <b>转入销毁地址</b>",
        [
          ["发送", acct(e.from)],
          ["接收", acct(e.to)],
          ["数量", `${fmtAmount(e.amount)} 枚${usd(e.amount)}`],
          ["分析", "销毁减少流通供给，一般视为利好；建议确认接收地址确为无私钥的销毁地址"],
        ],
        txLink(e.signature, "查看交易 ↗"),
      ),
    );
  }

  const circled = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
  for (const [from, evs] of bySender) {
    if (evs.length >= 2) {
      const total = evs.reduce((s, e) => s + e.amount, 0);
      blocks.push(
        card(
          `⚠️ <b>分散转出 ×${evs.length}</b>`,
          [
            ["发送", acct(from)],
            ["合计", `${fmtAmount(total)} 枚${usd(total)} → ${evs.length} 个地址`],
            ...evs.map(
              (e, i): [string, string] => [
                circled[i] ?? `${i + 1}.`,
                `${acct(e.to)} — ${fmtAmount(e.amount)} 枚 · ${txLink(e.signature)}`,
              ],
            ),
            ...balanceField(from),
            [
              "分析",
              "小额多地址分散常见于分仓、测试转账或交易所批量充值前的准备；接收方若是新钱包需持续跟踪",
            ],
          ],
          txLink(evs[0].signature, "查看首笔交易 ↗"),
        ),
      );
    } else {
      const e = evs[0];
      blocks.push(
        card(
          "⚠️ <b>大户转出</b>",
          [
            ["发送", acct(e.from)],
            ["接收", acct(e.to)],
            ["数量", `${fmtAmount(e.amount)} 枚${usd(e.amount)}`],
            ...balanceField(e.from),
            [
              "分析",
              "接收方可能是交易所个人充值地址（随后会归集）或新钱包，点击地址跟踪后续去向",
            ],
          ],
          txLink(e.signature, "查看交易 ↗"),
        ),
      );
    }
  }

  const priceNote = ctx.priceUsd == null ? "" : ` · 价格 $${ctx.priceUsd}`;
  const header = `🐋 <b>大户异动</b> <code>${short(ctx.tokenAddress)}</code>${priceNote}`;

  return [header, ...blocks].join(`\n\n${SEPARATOR}\n\n`);
}
