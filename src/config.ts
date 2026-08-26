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
  // "地址": "标签",
  // 示例（务必自行在 Solscan 核实后替换）:
  // "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx": "Gate.io Hot Wallet",
};

/** 环境变量（在 GitHub Secrets / Worker 环境变量中配置） */
export const ENV = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? "",
  birdeyeApiKey: process.env.BIRDEYE_API_KEY ?? "",
  heliusApiKey: process.env.HELIUS_API_KEY ?? "",
  heliusWebhookId: process.env.HELIUS_WEBHOOK_ID ?? "",
};
