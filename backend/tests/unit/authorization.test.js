import { describe, expect, it, vi } from 'vitest';
import { authorize } from '../../middleware/authMiddleware.js';

function invoke(role, allowed) {
  const next = vi.fn();
  authorize(...allowed)({ user: role ? { role } : undefined }, {}, next);
  return next.mock.calls[0][0];
}

describe('RBAC', () => {
  it('允许名单中的角色', () => expect(invoke('admin', ['admin'])).toBeUndefined());
  it('拒绝权限不足的角色并返回 403 错误', () => expect(invoke('viewer', ['admin']).statusCode).toBe(403));
  it('未认证时返回 401 错误', () => expect(invoke(null, ['admin']).statusCode).toBe(401));
});
