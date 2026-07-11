import crypto from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.TRANSACTION_MODE = 'off';
process.env.LOG_LEVEL = 'silent';
