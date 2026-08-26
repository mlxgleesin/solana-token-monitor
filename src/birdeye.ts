import { ENV } from "./config.js";

// Birdeye 公共 API（需免费 key: https://bds.birdeye.so/）
// ⚠️ Birdeye 端点偶有版本变动，若 404 请对照最新文档调整路径。
const BASE = "https://public-api.birdeye.so";

function headers() {
  return {
    accept: "application/json",
    "x-api-key": ENV.birdeyeApiKey,
    "x-chain": "solana",
  };
}

/** 获取 holder 总数（来自 token overview） */
export async function fetchHolderCount(tokenAddress: string): Promise<number | null> {
  if (!ENV.birdeyeApiKey) return null;
  const res = await fetch(
    `${BASE}/defi/token_overview?address=${tokenAddress}`,
    { headers: headers() },
  );
  if (!res.ok) {
    console.error("[birdeye] token_overview 失败:", res.status);
    return null;
  }
  const data = (await res.json()) as { data?: { holder?: number } };
  return data.data?.holder ?? null;
}

/** 获取 top N 持仓地址 */
export async function fetchTopHolders(
  tokenAddress: string,
  limit = 15,
): Promise<{ owner: string; uiAmount: number }[]> {
  if (!ENV.birdeyeApiKey) return [];
  const res = await fetch(
    `${BASE}/defi/v3/token/holder?address=${tokenAddress}&offset=0&limit=${limit}`,
    { headers: headers() },
  );
  if (!res.ok) {
    console.error("[birdeye] holder 列表失败:", res.status);
    return [];
  }
  const data = (await res.json()) as {
    data?: { items?: { owner: string; ui_amount: number }[] };
  };
  return (data.data?.items ?? []).map((i) => ({ owner: i.owner, uiAmount: i.ui_amount }));
}
