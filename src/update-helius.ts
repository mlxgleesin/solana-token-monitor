// ============================================================
// 每日任务（GitHub Actions 每天跑一次）：
//   1. 从 Birdeye 拉最新 top15 持仓地址
//   2. 与 Helius webhook 当前监控列表做 diff
//   3. 有变化则更新 webhook 并在 Telegram 通知（庄家分仓/换钱包本身就是信号）
//
// 前提：先在 https://dashboard.helius.dev 手动创建一个 webhook：
//   - Webhook Type: Enhanced
//   - Transaction Type: TRANSFER
//   - Webhook URL: 你的 Cloudflare Worker 地址（含 secret 路径）
//   然后把 webhook ID 填到 secret HELIUS_WEBHOOK_ID
// ============================================================
import { TOKEN_ADDRESS, ENV } from "./config.js";
import { fetchTopHolders } from "./birdeye.js";
import { sendTelegram } from "./telegram.js";

const HELIUS_BASE = "https://api.helius.xyz/v0/webhooks";

interface HeliusWebhook {
  webhookID: string;
  webhookURL: string;
  transactionTypes: string[];
  accountAddresses: string[];
  webhookType: string;
}

async function getWebhook(): Promise<HeliusWebhook | null> {
  const res = await fetch(
    `${HELIUS_BASE}/${ENV.heliusWebhookId}?api-key=${ENV.heliusApiKey}`,
  );
  if (!res.ok) {
    console.error("[helius] 获取 webhook 失败:", res.status, await res.text());
    return null;
  }
  return (await res.json()) as HeliusWebhook;
}

async function updateWebhookAddresses(
  webhook: HeliusWebhook,
  addresses: string[],
): Promise<boolean> {
  const res = await fetch(
    `${HELIUS_BASE}/${ENV.heliusWebhookId}?api-key=${ENV.heliusApiKey}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webhookURL: webhook.webhookURL,
        transactionTypes: webhook.transactionTypes,
        accountAddresses: addresses,
        webhookType: webhook.webhookType,
      }),
    },
  );
  if (!res.ok) {
    console.error("[helius] 更新 webhook 失败:", res.status, await res.text());
    return false;
  }
  return true;
}

async function main() {
  if (!ENV.heliusApiKey || !ENV.heliusWebhookId) {
    console.log("未配置 HELIUS_API_KEY / HELIUS_WEBHOOK_ID，跳过");
    return;
  }

  const holders = await fetchTopHolders(TOKEN_ADDRESS, 15);
  if (!holders.length) {
    console.error("未获取到 top holders（检查 BIRDEYE_API_KEY 或端点版本）");
    return;
  }
  const newList = holders.map((h) => h.owner);

  const webhook = await getWebhook();
  if (!webhook) return;

  const oldSet = new Set(webhook.accountAddresses);
  const newSet = new Set(newList);
  const added = newList.filter((a) => !oldSet.has(a));
  const removed = webhook.accountAddresses.filter((a) => !newSet.has(a));

  if (!added.length && !removed.length) {
    console.log("top holders 无变化");
    return;
  }

  const ok = await updateWebhookAddresses(webhook, newList);
  if (!ok) return;

  // top 持仓名单变动本身就是重要信号（分仓、换钱包）
  const lines = [
    "<b>🔄 Top 持仓名单变动</b>（已同步到 Helius 监控）",
    added.length
      ? "新进入 top15:\n" + added.map((a) => `<code>${a}</code>`).join("\n")
      : "",
    removed.length
      ? "移出 top15:\n" + removed.map((a) => `<code>${a}</code>`).join("\n")
      : "",
    "⚠️ 若旧地址余额转移到新地址，可能是庄家分仓（出货前奏），建议到 Solscan 追一下资金流向。",
  ].filter(Boolean);
  await sendTelegram(lines.join("\n\n"));
  console.log(`已更新监控列表: +${added.length} / -${removed.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
