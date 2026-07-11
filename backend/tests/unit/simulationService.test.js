import { describe, expect, it } from 'vitest';
import { chooseSimulationRisk, generateSimulationRecord } from '../../services/simulationService.js';

describe('模拟数据生成', () => {
  it('按 low 为主、medium 次之、high 更少的边界分布', () => {
    expect(chooseSimulationRisk(() => 0.5)).toBe('low');
    expect(chooseSimulationRisk(() => 0.8)).toBe('medium');
    expect(chooseSimulationRisk(() => 0.98)).toBe('high');
  });

  it('生成唯一 packageId 且气体字段逻辑一致', () => {
    const first = generateSimulationRecord({ risk: 'high' });
    const second = generateSimulationRecord({ risk: 'high' });
    expect(first.packageId).not.toBe(second.packageId);
    expect(first.source).toBe('simulation');
    if (first.gasSensor.alarm) {
      expect(first.gasSensor.concentration).toBeGreaterThan(100);
      expect(first.gasSensor.trend).toBe('rising');
    }
  });
});
