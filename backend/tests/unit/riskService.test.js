import { describe, expect, it } from 'vitest';
import { calculateRisk } from '../../services/riskService.js';

const bbox = { x: 1, y: 2, width: 30, height: 40 };
const detection = (className, confidence = 0.9) => ({ className, confidence, bbox });
const safeSensor = {
  gasType: 'combustible', concentration: 10, unit: 'ppm', alarm: false, trend: 'stable', sensorStatus: 'online',
};

describe('calculateRisk', () => {
  it('无任何有效数据时要求人工复核，不能返回绝对安全', () => {
    const result = calculateRisk({});
    expect(result.riskLevel).toBe('medium');
    expect(result.riskReasons.join('')).toContain('没有可用');
    expect(result.reviewSuggestion).toContain('复核');
  });

  it('有效且无风险的数据返回 low', () => {
    const result = calculateRisk({ xrayResult: [detection('book')], gasSensor: safeSensor });
    expect(result.riskLevel).toBe('low');
    expect(result.riskScore).toBe(0);
  });

  it('只有视觉危险目标时提高风险', () => {
    const result = calculateRisk({ xrayResult: [detection('knife', 0.91)] });
    expect(result.riskLevel).toBe('medium');
    expect(result.riskReasons.join('')).toContain('刀具');
  });

  it('高置信度枪支等高危类别可单独触发 high', () => {
    const result = calculateRisk({ xrayResult: [detection('gun', 0.92)] });
    expect(result.riskLevel).toBe('high');
    expect(result.riskReasons.join('')).toContain('枪支');
  });

  it('只有气体报警时按工业报警规则判为高风险', () => {
    const result = calculateRisk({ gasSensor: { ...safeSensor, alarm: true } });
    expect(result.riskLevel).toBe('high');
    expect(result.riskReasons).toContain('气体传感器触发报警');
  });

  it('视觉与气体证据同时存在时达到 high 并解释融合证据', () => {
    const result = calculateRisk({
      xrayResult: [detection('lighter', 0.95)],
      gasSensor: { ...safeSensor, alarm: true, trend: 'rising', concentration: 150 },
    });
    expect(result.riskLevel).toBe('high');
    expect(result.riskReasons).toContain('视觉与气体风险证据同时存在');
  });

  it('传感器离线且无有效视觉时至少是 medium', () => {
    const result = calculateRisk({ gasSensor: { ...safeSensor, sensorStatus: 'offline' } });
    expect(result.riskLevel).toBe('medium');
    expect(result.riskReasons.join('')).toContain('不能据此判定安全');
  });

  it('极端浓度封顶且不会溢出', () => {
    const result = calculateRisk({ gasSensor: { ...safeSensor, concentration: Number.MAX_VALUE, alarm: true, trend: 'rising' } });
    expect(result.riskLevel).toBe('high');
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });

  it('非法置信度被忽略并给出数据不足说明', () => {
    const result = calculateRisk({ xrayResult: [detection('gun', 1.5)] });
    expect(result.riskReasons.join('')).toContain('置信度数据非法');
    expect(result.riskLevel).toBe('medium');
  });

  it.each(['gongju_agnostic', 'knife_agnostic', 'pressure_agnostic', 'scissor', 'powerbank', 'bottle'])(
    '识别外部模型类别 %s 并生成中文原因',
    (className) => {
      const result = calculateRisk({ xrayResult: [detection(className)], gasSensor: safeSensor });
      expect(result.riskScore).toBeGreaterThan(0);
      expect(result.riskReasons[0]).toMatch(/疑似|工具|压力|剪刀|充电宝|瓶装/);
    },
  );
});
