import { describe, expect, it } from 'vitest';
import { allowedAlarmTransitions, canTransitionAlarm } from '../../services/alarmService.js';

describe('报警状态机', () => {
  it('允许标准处置路径', () => {
    expect(canTransitionAlarm('unconfirmed', 'confirmed')).toBe(true);
    expect(canTransitionAlarm('confirmed', 'processing')).toBe(true);
    expect(canTransitionAlarm('processing', 'resolved')).toBe(true);
    expect(canTransitionAlarm('processing', 'ignored')).toBe(true);
  });

  it('禁止从终态随意回退', () => {
    expect(allowedAlarmTransitions.resolved).toEqual([]);
    expect(canTransitionAlarm('resolved', 'unconfirmed')).toBe(false);
    expect(canTransitionAlarm('ignored', 'processing')).toBe(false);
  });
});
