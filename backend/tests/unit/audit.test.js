import { describe, expect, it } from 'vitest';
import { sanitizeAuditValue } from '../../utils/audit.js';

describe('操作日志脱敏', () => {
  it('递归移除密码、哈希、Token 和 Authorization', () => {
    const clean = sanitizeAuditValue({
      username: 'demo', passwordHash: 'hash', nested: { token: 'jwt', keep: 1 }, list: [{ password: 'secret' }],
    });
    expect(clean).toEqual({ username: 'demo', nested: { keep: 1 }, list: [{}] });
  });
});
