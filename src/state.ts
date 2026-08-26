import { readFile, writeFile } from "node:fs/promises";

const STATE_FILE = new URL("../state.json", import.meta.url);

export interface State {
  /** 上次快照的 LP（USD） */
  lastLiquidityUsd: number | null;
  /** 上次快照的主池地址（主池切换时 LP 跨池对比无意义） */
  lastPairAddress: string | null;
  /** 1h 成交量历史样本（每小时最多记一条，保留 168 条 = 7 天） */
  hourlyVolumes: { ts: number; volH1: number }[];
  /** holder 数历史（每小时一条，保留 168 条） */
  holderHistory: { ts: number; count: number }[];
  /** 各类告警上次触发时间（用于冷却去重） */
  lastAlertAt: Record<string, number>;
}

const DEFAULT_STATE: State = {
  lastLiquidityUsd: null,
  lastPairAddress: null,
  hourlyVolumes: [],
  holderHistory: [],
  lastAlertAt: {},
};

export async function loadState(): Promise<State> {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function saveState(state: State): Promise<void> {
  // 裁剪历史，避免文件无限增长
  state.hourlyVolumes = state.hourlyVolumes.slice(-168);
  state.holderHistory = state.holderHistory.slice(-168);
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

/**
 * 返回满足最小年龄（毫秒）的最新样本。
 * 历史按时间递增排列，从尾部反向找第一个「足够老」的样本，
 * 即最接近目标时间点的那条（如「约 24h 前」），而不是整个历史里最老的。
 */
export function latestSampleOlderThan<T extends { ts: number }>(
  history: T[],
  now: number,
  minAgeMs: number,
): T | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    if (now - history[i].ts >= minAgeMs) return history[i];
  }
  return undefined;
}

/** 告警冷却检查（只读不写；发送成功后再用 markAlerted 记录，避免发送失败丢告警） */
export function canAlert(
  state: State,
  key: string,
  cooldownMinutes: number,
  now = Date.now(),
): boolean {
  const last = state.lastAlertAt[key] ?? 0;
  return now - last >= cooldownMinutes * 60_000;
}

/** 告警实际发送成功后记录触发时间 */
export function markAlerted(state: State, key: string, now = Date.now()): void {
  state.lastAlertAt[key] = now;
}
