import { describe, expect, it } from 'vitest';
import { createInspectionSchema, listInspectionsSchema } from '../../validators/inspectionValidator.js';
import { createUserSchema } from '../../validators/userValidator.js';

describe('Zod 参数校验', () => {
  it('拒绝缺失 packageId、非法置信度和负浓度', () => {
    expect(() => createInspectionSchema.body.parse({})).toThrow();
    expect(() => createInspectionSchema.body.parse({
      packageId: 'P-1',
      xrayResult: [{ className: 'knife', confidence: 2, bbox: { x: 0, y: 0, width: 1, height: 1 } }],
    })).toThrow();
    expect(() => createInspectionSchema.body.parse({ packageId: 'P-1', gasSensor: { concentration: -1 } })).toThrow();
  });

  it('分页有上限且把合法查询转换成正确类型', () => {
    expect(() => listInspectionsSchema.query.parse({ pageSize: '101' })).toThrow();
    const parsed = listInspectionsSchema.query.parse({ page: '2', pageSize: '20', gasAlarm: 'true' });
    expect(parsed).toMatchObject({ page: 2, pageSize: 20, gasAlarm: true });
  });

  it('用户密码必须具有基础强度', () => {
    expect(() => createUserSchema.body.parse({ username: 'abc', email: 'bad', password: '123', role: 'viewer' })).toThrow();
    expect(createUserSchema.body.parse({ username: 'abc', email: 'a@example.com', password: 'abc12345', role: 'viewer' }).email).toBe('a@example.com');
  });
});
