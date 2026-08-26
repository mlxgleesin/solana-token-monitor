// ============================================================
// Cloudflare Worker：接收 Helius Enhanced Webhook 推送
// 部署：cd worker && npx wrangler deploy
// 环境变量（wrangler secret put ...）：
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, WEBHOOK_SECRET
// Helius webhook URL 填：https://<worker域名>/hook/<WEBHOOK_SECRET>
// ============================================================

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  /** URL 路径中的共享密钥，防止别人乱推 */
  WEBHOOK_SECRET: string;
  /** 监控的代币 mint 地址 */
  TOKEN_ADDRESS: string;
}

/**
 * 已知 CEX 地址标签（与主仓库 config.ts 保持一致）。
 * ⚠️ 到 Solscan 核实官方 label 后填入。
 */
const CEX_ADDRESSES: Record<string, string> = {
  // 2026-08 经 Solscan 官方标注 / Vybe 标注数据核实，与 src/config.ts 保持一致
  "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM": "Binance Hot Wallet",
  "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9": "Binance 2",
  "C68a6RCGLiPskbPYtAcsCjhG8tfTWYcoB4JjCrXFdqyo": "OKX Hot Wallet",
  "is6MTRHEgyFLNTfYcuV4QBWLjrZBfmhVNYR6ccgr8KV": "OKX Hot Wallet 2",
  "5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD": "OKX",
  "AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2": "Bybit Hot Wallet",
  "u6PJ8DtQuPFnfmwHbGFULQ4u4EgjDiyYKjVEsynXq2w": "Gate.io",
  "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE": "Coinbase Hot Wallet 2",
  "D89hHJT5Aqyx1trP6EnGY9jJUB3whgnq3aUvvCqedvzf": "Coinbase Hot Wallet 3",
  "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS": "Kraken Hot Wallet",
  "FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5": "Kraken",
  "AobVSwdW9BbpMdJvTqeCN4hPAmh4rHm7vwLnQ5ATSyrS": "Crypto.com Hot Wallet 2",
  "BY4StcU9Y2BpgH8quZzorg31EGE4L1rjomN8FNsCBEcx": "HTX Hot Wallet",
  "5PAhQiYdLBd6SVdjzBQDxUAEFyDdF5ExNPQfcscnPRj5": "MEXC",
  "7TWnq4WeYcwQWBCwKeEX2Q9xqVtthPGkB7adNvueuVuh": "Bitget Cold Wallet",
};

interface TokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  mint: string;
  tokenAmount?: number;
}

interface HeliusTx {
  signature: string;
  type: string;
  timestamp: number;
  tokenTransfers?: TokenTransfer[];
}

/** 与 src/telegram.ts 的 chunkMessage 保持一致（Worker 独立部署，不共享代码） */
function chunkMessage(text: string, maxLen = 4096): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current) {
      chunks.push(current);
      current = "";
    }
  };
  for (const para of text.split("\n\n")) {
    if (para.length > maxLen) {
      flush();
      for (let i = 0; i < para.length; i += maxLen) chunks.push(para.slice(i, i + maxLen));
      continue;
    }
    const candidate = current ? current + "\n\n" + para : para;
    if (candidate.length > maxLen) {
      flush();
      current = para;
    } else {
      current = candidate;
    }
  }
  flush();
  return chunks;
}

/** 发送成功返回 true；失败返回 false，由调用方回 500 触发 Helius 重试 */
async function sendTelegram(env: Env, text: string): Promise<boolean> {
  for (const chunk of chunkMessage(text)) {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: chunk,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error("[telegram] 发送失败:", res.status, await res.text());
      return false;
    }
  }
  return true;
}

const short = (a: string) => `${a.slice(0, 4)}..${a.slice(-4)}`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== `/hook/${env.WEBHOOK_SECRET}`) {
      return new Response("not found", { status: 404 });
    }

    let txs: HeliusTx[];
    try {
      txs = (await request.json()) as HeliusTx[];
    } catch {
      return new Response("bad json", { status: 400 });
    }

    const lines: string[] = [];
    for (const tx of txs) {
      for (const t of tx.tokenTransfers ?? []) {
        // 只关心被监控代币本身的转移；SOL/USDC 出入也可放开注释一并监控
        if (env.TOKEN_ADDRESS && t.mint !== env.TOKEN_ADDRESS) continue;

        const amount = (t.tokenAmount ?? 0).toLocaleString();
        const cexLabel = CEX_ADDRESSES[t.toUserAccount];
        if (cexLabel) {
          // 最高级别：大户向 CEX 充值 = 准备出货
          lines.push(
            `🚨🚨 <b>大户向交易所转币</b>\n` +
              `${short(t.fromUserAccount)} → <b>${cexLabel}</b>\n` +
              `数量: ${amount}\n` +
              `<a href="https://solscan.io/tx/${tx.signature}">查看交易</a>`,
          );
        } else {
          lines.push(
            `⚠️ <b>监控地址异动</b>\n` +
              `${short(t.fromUserAccount)} → ${short(t.toUserAccount)}\n` +
              `数量: ${amount}\n` +
              `<a href="https://solscan.io/tx/${tx.signature}">查看交易</a>`,
          );
        }
      }
    }

    if (lines.length) {
      const ok = await sendTelegram(env, lines.join("\n\n"));
      // 非 2xx 会让 Helius 重试投递，宁可重复告警也不静默丢失
      if (!ok) return new Response("telegram failed", { status: 500 });
    }
    return new Response("ok");
  },
};
