import { ENV } from "./config.js";

/** 把超长消息按空行段落切成不超过 maxLen 的块（Telegram 上限 4096） */
export function chunkMessage(text: string, maxLen = 4096): string[] {
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
      // 单段落本身超限：硬切为独立块
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

/**
 * 发送 Telegram 消息（HTML 格式），超长自动分块。
 * 发送失败会抛错，调用方据此决定是否保留告警状态（避免静默丢告警）。
 */
export async function sendTelegram(text: string): Promise<void> {
  if (!ENV.telegramBotToken || !ENV.telegramChatId) {
    console.log("[telegram] 未配置 token/chatId，仅打印:\n" + text);
    return;
  }
  const url = `https://api.telegram.org/bot${ENV.telegramBotToken}/sendMessage`;
  for (const chunk of chunkMessage(text)) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ENV.telegramChatId,
        text: chunk,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error("[telegram] 发送失败:", res.status, await res.text());
      throw new Error(`Telegram 发送失败: ${res.status}`);
    }
  }
}
