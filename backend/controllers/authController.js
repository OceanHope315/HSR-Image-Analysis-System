import { authenticateCredentials } from '../services/authService.js';
import { writeOperationLog } from '../utils/audit.js';

export async function login(req, res) {
  const result = await authenticateCredentials(req.validated.body);
  await writeOperationLog(req, {
    userId: result.user._id,
    action: 'auth.login',
    resourceType: 'User',
    resourceId: result.user._id,
    after: { lastLoginAt: result.user.lastLoginAt },
  });
  res.json({ success: true, data: result });
}

export function me(req, res) {
  res.json({ success: true, data: req.user });
}

export async function logout(req, res) {
  await writeOperationLog(req, {
    action: 'auth.logout',
    resourceType: 'User',
    resourceId: req.user._id,
  });
  res.json({ success: true, data: { message: '已退出，请在客户端清除 Token' } });
}
