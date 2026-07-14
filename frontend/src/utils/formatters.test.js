import { describe, expect, it } from 'vitest';
import {
  alarmStatusLabel,
  detectionClassLabel,
  formatDateTime,
  formatNumber,
  formatPercent,
  normalizeList,
  objectId,
  riskLabel,
} from './formatters.js';
import { canTransitionAlarm } from './alarmTransitions.js';

describe('前端展示工具', () => {
  it('转换风险与报警状态中文标签', () => {
    expect(riskLabel('high')).toBe('高风险');
    expect(alarmStatusLabel('processing')).toBe('处理中');
  });

  it('兼容 0-1 和 0-100 两种置信度', () => {
    expect(formatPercent(0.91)).toBe('91%');
    expect(formatPercent(91)).toBe('91%');
  });

  it('显示目标中文名，并让空数值安全降级', () => {
    expect(detectionClassLabel('lighter')).toBe('打火机');
    expect(detectionClassLabel('pressure_agnostic')).toBe('压力容器');
    expect(formatNumber(null, 2)).toBe('—');
    expect(formatPercent(undefined)).toBe('—');
  });

  it('对非法日期和列表安全降级', () => {
    expect(formatDateTime('not-a-date')).toBe('—');
    expect(normalizeList({ data: [{ id: 1 }] })).toHaveLength(1);
    expect(normalizeList(null)).toEqual([]);
  });

  it('兼容关联对象和 ObjectId 字符串', () => {
    expect(objectId({ _id: 'abc' })).toBe('abc');
    expect(objectId('abc')).toBe('abc');
  });
});

describe('报警状态机', () => {
  it('允许正常正向流转并阻止随意回退', () => {
    expect(canTransitionAlarm('unconfirmed', 'confirmed')).toBe(true);
    expect(canTransitionAlarm('processing', 'resolved')).toBe(true);
    expect(canTransitionAlarm('resolved', 'unconfirmed')).toBe(false);
    expect(canTransitionAlarm('resolved', 'unconfirmed', true)).toBe(true);
  });
});
