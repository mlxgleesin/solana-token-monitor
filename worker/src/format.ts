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
const txLink = (s: string) => `<a href="https://solscan.io/tx/${s}">TX↗</a>`;
const isBurn = (a: string) => a.startsWith("1nc1nerator") || /burn/i.test(a);

export function formatAlerts(events: TransferEvent[], ctx: FormatContext): string {
  const usd = (amt: number) => (ctx.priceUsd == null ? "" : ` ≈ ${fmtUsd(amt * ctx.priceUsd)}`);
  const balanceLine = (from: string) => {
    const bal = ctx.senderBalances?.[from];
    return typeof bal === "number" ? `\n转出后余额 ${fmtAmount(bal)} 枚` : "";
  };

  const cex = events.filter((e) => ctx.cexAddresses[e.to]);
  const burns = events.filter((e) => !ctx.cexAddresses[e.to] && isBurn(e.to));
  const rest = events.filter((e) => !ctx.cexAddresses[e.to] && !isBurn(e.to));

  // 同一发送方多笔转出 → 聚合
  const bySender = new Map<string, TransferEvent[]>();
  for (const e of rest) bySender.set(e.from, [...(bySender.get(e.from) ?? []), e]);

  const blocks: string[] = [];

  for (const e of cex) {
    blocks.push(
      `🚨🚨 <b>大户向交易所转币 — 出货警报</b>\n` +
        `${acct(e.from)} ➜ <b>${ctx.cexAddresses[e.to]}</b>\n` +
        `${fmtAmount(e.amount)} 枚${usd(e.amount)} · ${txLink(e.signature)}` +
        balanceLine(e.from),
    );
  }

  for (const e of burns) {
    blocks.push(
      `🔥 <b>转入销毁地址</b>\n` +
        `${acct(e.from)} ➜ ${acct(e.to)}\n` +
        `${fmtAmount(e.amount)} 枚${usd(e.amount)} · ${txLink(e.signature)}`,
    );
  }

  for (const [from, evs] of bySender) {
    if (evs.length >= 2) {
      const total = evs.reduce((s, e) => s + e.amount, 0);
      blocks.push(
        `⚠️ <b>分散转出 ×${evs.length}</b>（疑似分仓或交易所批量充值）\n` +
          `${acct(from)} ➜ ${evs.length} 个地址 · 共 ${fmtAmount(total)} 枚${usd(total)}\n` +
          evs
            .map((e) => `· ${acct(e.to)} — ${fmtAmount(e.amount)} 枚 · ${txLink(e.signature)}`)
            .join("\n") +
          balanceLine(from),
      );
    } else {
      const e = evs[0];
      blocks.push(
        `⚠️ <b>大户转出</b>\n` +
          `${acct(e.from)} ➜ ${acct(e.to)}\n` +
          `${fmtAmount(e.amount)} 枚${usd(e.amount)} · ${txLink(e.signature)}` +
          balanceLine(e.from),
      );
    }
  }

  const priceNote = ctx.priceUsd == null ? "" : ` · 价格 $${ctx.priceUsd}`;
  const header = `🐋 <b>大户异动</b> <code>${short(ctx.tokenAddress)}</code>${priceNote}`;
  const footer = rest.length
    ? "💡 陌生接收地址可能是 CEX 个人充值地址（随后会归集），点地址链接可追去向"
    : "";

  return [header, ...blocks, footer].filter(Boolean).join("\n\n");
}
