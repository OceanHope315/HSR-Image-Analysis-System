import { User } from '../models/User.js';
import { hashPassword } from '../services/authService.js';
import { forbidden, notFound } from '../utils/AppError.js';
import { writeOperationLog } from '../utils/audit.js';
import { escapeRegex, paginationMeta } from '../utils/query.js';

export async function listUsers(req, res) {
  const query = req.validated.query;
  const filter = {};
  if (query.role) filter.role = query.role;
  if (typeof query.isActive === 'boolean') filter.isActive = query.isActive;
  if (query.keyword) {
    const search = { $regex: escapeRegex(query.keyword), $options: 'i' };
    filter.$or = [{ username: search }, { email: search }];
  }
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).lean(),
    User.countDocuments(filter),
  ]);
  res.json({ success: true, data: users, pagination: paginationMeta(query.page, query.pageSize, total) });
}

export async function createUser(req, res) {
  const { password, ...data } = req.validated.body;
  const user = await User.create({ ...data, passwordHash: await hashPassword(password) });
  await writeOperationLog(req, {
    action: 'user.create', resourceType: 'User', resourceId: user._id, after: user.toObject(),
  });
  res.status(201).json({ success: true, data: user });
}

export async function getUser(req, res) {
  const user = await User.findById(req.validated.params.id);
  if (!user) throw notFound('用户不存在');
  res.json({ success: true, data: user });
}

export async function patchUser(req, res) {
  const user = await User.findById(req.validated.params.id);
  if (!user) throw notFound('用户不存在');
  if (String(user._id) === String(req.user._id) && (req.validated.body.role || req.validated.body.isActive === false)) {
    throw forbidden('不能修改自己的角色或停用自己的账号');
  }
  const before = user.toObject();
  const { password, ...changes } = req.validated.body;
  Object.assign(user, changes);
  if (password) user.passwordHash = await hashPassword(password);
  await user.save();
  await writeOperationLog(req, {
    action: 'user.update', resourceType: 'User', resourceId: user._id, before, after: user.toObject(),
  });
  res.json({ success: true, data: user });
}

export async function deactivateUser(req, res) {
  if (String(req.validated.params.id) === String(req.user._id)) throw forbidden('不能停用自己的账号');
  const user = await User.findById(req.validated.params.id);
  if (!user) throw notFound('用户不存在');
  const before = user.toObject();
  user.isActive = false;
  await user.save();
  await writeOperationLog(req, {
    action: 'user.deactivate', resourceType: 'User', resourceId: user._id, before, after: user.toObject(),
  });
  res.json({ success: true, data: user });
}
