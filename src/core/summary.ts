/**
 * summary.ts — 以 TypeScript 严格类型实现的账单汇总（迁移示范）。
 *
 * 使用共享的 BillRecord / BillMetadata / Direction 类型，演示 analytics 层向 TS 的渐进迁移。
 * 纯函数、不依赖 DOM，可被渲染层（经 Vite）与未来主进程/CLI 复用。
 */
import type { BillRecord, BillMetadata, Direction } from '../types/bill';

export interface OverviewSummary {
  totalIncome: number;
  totalExpense: number;
  neutralAmount: number;
  net: number;
  count: number;
}

/** 解析金额字符串（货币符号/千分位/全角的轻量处理，与 utils/amount 口径一致） */
export function toNumber(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const cleaned = String(raw).replace(/[¥￥$\s,]/g, '').replace(/元|RMB|CNY/gi, '');
  const m = cleaned.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

export function directionOf(record: BillRecord): Direction {
  const t = record['收/支'];
  if (t === '收入') return 'income';
  if (t === '支出') return 'expense';
  return 'neutral';
}

export function summarize(records: BillRecord[]): OverviewSummary {
  let totalIncome = 0;
  let totalExpense = 0;
  let neutralAmount = 0;

  for (const r of records) {
    const amount = toNumber(r['金额(元)']);
    const dir = directionOf(r);
    const refunded = (r['当前状态'] || '').includes('已退款');
    if (dir === 'income') totalIncome += amount;
    else if (dir === 'expense' && !refunded) totalExpense += amount;
    else if (dir === 'neutral') neutralAmount += amount;
  }

  return {
    totalIncome,
    totalExpense,
    neutralAmount,
    net: totalIncome - totalExpense,
    count: records.length
  };
}

/** 空元数据工厂，供初始化使用（类型完整） */
export function emptyMetadata(): BillMetadata {
  return {
    nickname: '', startTime: '', endTime: '', exportType: '', exportTime: '',
    totalCount: 0, incomeCount: 0, incomeAmount: 0,
    expenseCount: 0, expenseAmount: 0, neutralCount: 0, neutralAmount: 0
  };
}
