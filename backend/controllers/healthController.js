import mongoose from 'mongoose';

const stateNames = ['disconnected', 'connected', 'connecting', 'disconnecting'];

export function health(_req, res) {
  const database = stateNames[mongoose.connection.readyState] ?? 'unknown';
  const healthy = database === 'connected';
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: {
      status: healthy ? 'ok' : 'degraded',
      database,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
    },
  });
}
