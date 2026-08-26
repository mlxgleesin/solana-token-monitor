// ============================================================
// 监控配置 —— 部署前只需要改这个文件 + 配置 GitHub Secrets
// ============================================================

/** 要监控的代币合约地址（mint address） */
export const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS ?? "在这里填合约地址";

/** 告警阈值 */
export const THRESHOLDS = {
  /** LP 环比变化超过该比例告警（0.2 = ±20%） */
  lpChangeRatio: 0.2,
  /** 1h 成交量超过 7 日滚动均值的倍数 */
  volumeSpikeMultiple: 3,
  /** 买盘占比偏离 50% 超过该值时在量能告警中标注（0.2 = 低于30%或高于70%） */
  buyRatioSkew: 0.2,
  /** holder 日增速超过该比例告警（0.05 = 5%/天） */
  holderGrowthDaily: 0.05,
  /** 1h 价格涨跌幅告警阈值（百分数，10 = ±10%），配合买卖比给定性分析 */
  priceSpikePct: 10,
  /** 同类告警冷却时间（分钟），防止刷屏 */
  alertCooldownMinutes: 30,
  /** holder 增速告警冷却时间（分钟），指标本身按日计算，冷却更长 */
  holderAlertCooldownMinutes: 360,
} as const;

/**
 * 已知 CEX 充值/热钱包地址（Solana）。
 * ⚠️ 请自行到 Solscan 验证后填入：搜索交易所名 -> 看带官方 label 的地址。
 * 大户向这些地址转账 = 最高级别预警（准备出货）。
 */
export const CEX_ADDRESSES: Record<string, string> = {
  // 2026-08 经 Solscan 官方标注 / Vybe 标注数据核实，并用 RPC 确认链上存在。
  // 注意：大户充值到「个人充值地址」时不经过这些热钱包，只会触发普通异动告警。
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

/** 环境变量（在 GitHub Secrets / Worker 环境变量中配置） */
export const ENV = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? "",
  birdeyeApiKey: process.env.BIRDEYE_API_KEY ?? "",
  heliusApiKey: process.env.HELIUS_API_KEY ?? "",
  heliusWebhookId: process.env.HELIUS_WEBHOOK_ID ?? "",
};
