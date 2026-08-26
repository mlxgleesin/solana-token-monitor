// DexScreener 免费 API，无需 key。文档: https://docs.dexscreener.com/api/reference
export interface PairData {
  pairAddress: string;
  dexId: string;
  priceUsd: string;
  liquidity: { usd: number };
  volume: { h24: number; h6: number; h1: number; m5: number };
  /** 各窗口价格涨跌幅（百分数，如 12.5 = +12.5%） */
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  // 新池子/冷门池子 API 可能缺字段，调用方需兜底
  txns?: {
    h1?: { buys: number; sells: number };
    h24?: { buys: number; sells: number };
  };
  fdv?: number;
  url: string;
}

export async function fetchMainPair(tokenAddress: string): Promise<PairData | null> {
  const res = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
    { headers: { accept: "application/json" } },
  );
  if (!res.ok) {
    console.error("[dexscreener] 请求失败:", res.status);
    return null;
  }
  const data = (await res.json()) as { pairs: PairData[] | null };
  if (!data.pairs?.length) return null;
  // 取流动性最大的池子作为主池
  return data.pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}
