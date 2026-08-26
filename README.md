# Solana 代币庄家行为监控

监控高控盘代币的启动/出货信号，Telegram 实时告警。

## 架构

```
┌─ GitHub Actions (每5分钟)──────────────┐
│  DexScreener → LP变化 / 量能异动 / 买卖比 │──┐
│  Birdeye     → holder 增速（每小时采样）  │  │
└────────────────────────────────────────┘  ├──→ Telegram
┌─ GitHub Actions (每天) ─────────────────┐  │
│  Birdeye top15 → diff → 更新 Helius 监控 │──┤
└────────────────────────────────────────┘  │
┌─ Helius Webhook (实时) ─────────────────┐  │
│  top持仓地址转账 → Cloudflare Worker      │──┘
│  （命中 CEX 充值地址 = 最高级别预警）       │
└────────────────────────────────────────┘
```

## 部署步骤

### 0. 准备

- Telegram bot：找 @BotFather 建 bot 拿 token；给 bot 发条消息后访问
  `https://api.telegram.org/bot<TOKEN>/getUpdates` 拿到你的 `chat_id`
- Birdeye 免费 API key：https://bds.birdeye.so/
- Helius 免费账号：https://dashboard.helius.dev

### 1. 部署 Worker（实时大户监控）

```bash
cd worker
# 先在 wrangler.toml 里填 TOKEN_ADDRESS
npx wrangler deploy
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put WEBHOOK_SECRET   # openssl rand -hex 24 生成
```

记下 Worker 域名，webhook URL 为 `https://<域名>/hook/<WEBHOOK_SECRET>`。

### 2. 创建 Helius Webhook

在 Helius dashboard 创建 webhook：

- Webhook Type: **Enhanced**
- Transaction Types: **TRANSFER**
- Account Addresses: 先手动填当前 top10~15 持仓地址（Solscan/GMGN 上查），之后每日任务会自动同步
- Webhook URL: 上一步的 URL

记下 **Webhook ID**。

### 3. 填 CEX 地址标签

到 Solscan 查 Gate.io 等交易所的官方标注热钱包地址，填入两处（保持一致）：

- `src/config.ts` 的 `CEX_ADDRESSES`
- `worker/src/index.ts` 的 `CEX_ADDRESSES`

### 4. 推到 GitHub 并配置 Secrets

仓库 Settings → Secrets and variables → Actions，添加：

| Secret | 说明 |
|---|---|
| `TOKEN_ADDRESS` | 代币 mint 地址 |
| `TELEGRAM_BOT_TOKEN` | bot token |
| `TELEGRAM_CHAT_ID` | 你的 chat id |
| `BIRDEYE_API_KEY` | Birdeye key |
| `HELIUS_API_KEY` | Helius key |
| `HELIUS_WEBHOOK_ID` | 第 2 步的 webhook ID |

推送后 Actions 自动按 cron 运行；也可以在 Actions 页面手动 `workflow_dispatch` 跑一次验证。

## 告警一览

| 信号 | 级别 | 含义 |
|---|---|---|
| 大户 → CEX 充值地址 | 🚨🚨 最高 | 准备出货 |
| 撤池子 | 🔴 高 | 跑路风险 |
| 加池子 | 🟡 中 | 可能是拉盘前奏 |
| 量能 > 滚动均值 3 倍 | 📈 中 | 均值窗口最多 7 天；看买卖比：买盘占优=FOMO 进场；均衡=警惕对倒 |
| holder 日增 > 5% | 👥 中 | 真人进场（最难伪造的指标） |
| top15 名单变动 | 🔄 中 | 庄家分仓/换钱包 |
| 主池变更 | 🔀 中 | 原主池被撤或有人开二池，LP 基线自动重置 |

## 注意事项

- GitHub Actions cron 有排队延迟，实际间隔 5~15 分钟浮动；需要更实时可把轮询逻辑迁到 Cloudflare Workers Cron（免费档支持 1 分钟）。
- **仓库必须是公开仓库**（Actions 免费无限时长）：`*/5` cron 每月约 8600 次运行，私有仓库每月 2000 分钟的免费额度远远不够。推公开仓库前确认 `.gitignore` 生效（`worker/.wrangler/`、`.env` 等本地文件不能入库）。
- 告警发送失败时该轮 state 不落盘，下一轮会重新评估并重发（workflow 显示红色属预期，宁可重复也不丢告警）。
- 改动逻辑后跑 `npm test`（node:test，零额外依赖）和 `npm run typecheck` 验证。
- 冷启动需要约 24 小时积累量能基线，期间量能告警不会触发（防误报）。
- Birdeye 端点偶有版本变动，若报 404 对照官方文档调整 `src/birdeye.ts` 中的路径。
- 阈值都在 `src/config.ts` 的 `THRESHOLDS` 里，跑几天后按实际噪音水平调。
- state.json 由 workflow 提交回仓库做持久化，属正常行为。

## 最后

监控做得再好，85% 控盘的结构不会变：砸盘是一个区块内的事，任何告警都有延迟。这套系统更适合用来**确认「不参与」的判断**，或在参与时把仓位控制在归零也无所谓的量级。
