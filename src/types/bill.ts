/**
 * bill.ts — 账单数据模型类型定义，供解析层、统计层与主进程 IPC 共享。
 */

/** 标准化交易记录（字段与 record-model 的 STANDARD_FIELDS 对应，解析后均为字符串） */
export interface BillRecord {
  '交易时间': string;
  '交易类型': string;
  '交易对方': string;
  '商品': string;
  /** 收入 | 支出 | 不计收支 */
  '收/支': string;
  '金额(元)': string;
  '支付方式': string;
  '当前状态': string;
  '交易单号': string;
  '商户单号': string;
  '备注': string;
  /** 来源中文标签（如「微信支付」），由 normalizeRecord 注入 */
  '来源'?: string;
  /** 来源标识（wechat/alipay/bank/unknown） */
  source?: string;
}

/** 账单元数据（对应 main 进程 extractMetadata 的输出） */
export interface BillMetadata {
  nickname: string;
  startTime: string;
  endTime: string;
  exportType: string;
  exportTime: string;
  totalCount: number;
  incomeCount: number;
  incomeAmount: number;
  expenseCount: number;
  expenseAmount: number;
  neutralCount: number;
  neutralAmount: number;
}

/** 收支方向 */
export type Direction = 'income' | 'expense' | 'neutral';
