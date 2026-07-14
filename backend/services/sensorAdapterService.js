import net from 'node:net';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';

const alarmLevelNames = ['无报警', '一级报警', '二级报警', '三级报警'];

export function crc16Modbus(data) {
  let crc = 0xffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
    }
  }
  return crc & 0xffff;
}

export function parseGasFrame(frame, channelCount = env.gasChannelCount) {
  if (!Buffer.isBuffer(frame) || frame.length !== 26) return null;
  if (frame[0] !== 0xfa || frame[2] !== 0x03 || frame[3] !== 0x14) return null;
  const expectedCrc = crc16Modbus(frame.subarray(1, frame.length - 2));
  if (frame.readUInt16LE(frame.length - 2) !== expectedCrc) return null;

  const connectionBits = frame.readUInt16BE(4);
  const alarmBits = frame.readUInt16BE(6);
  const channels = Array.from({ length: channelCount }, (_, index) => {
    const alarmLevel = (alarmBits >> (index * 2)) & 0x03;
    return {
      channel: index + 1,
      connected: Boolean((connectionBits >> index) & 0x01),
      alarmLevel,
      alarmText: alarmLevelNames[alarmLevel],
    };
  });
  return { address: frame[1], connectionBits, alarmBits, channels };
}

export class GasFrameParser {
  constructor({ channelCount = env.gasChannelCount, maxBufferBytes = 65_536 } = {}) {
    this.channelCount = channelCount;
    this.maxBufferBytes = maxBufferBytes;
    this.buffer = Buffer.alloc(0);
  }

  reset() {
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    if (!chunk?.length) return [];
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
    if (this.buffer.length > this.maxBufferBytes) {
      this.buffer = this.buffer.subarray(this.buffer.length - this.maxBufferBytes);
    }

    const parsed = [];
    while (this.buffer.length >= 4) {
      const headerIndex = this.buffer.indexOf(0xfa);
      if (headerIndex < 0) {
        this.reset();
        break;
      }
      if (headerIndex > 0) this.buffer = this.buffer.subarray(headerIndex);
      if (this.buffer.length < 4) break;
      if (this.buffer[2] !== 0x03 || this.buffer[3] !== 0x14) {
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      const frameLength = 4 + this.buffer[3] + 2;
      if (this.buffer.length < frameLength) break;
      const candidate = this.buffer.subarray(0, frameLength);
      const frame = parseGasFrame(candidate, this.channelCount);
      if (frame) {
        parsed.push(frame);
        this.buffer = this.buffer.subarray(frameLength);
      } else {
        this.buffer = this.buffer.subarray(1);
      }
    }
    return parsed;
  }
}

function normalizeDate(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value ?? fallback);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function normalizeConcentration(value) {
  if (value === null || value === undefined || value === '') return null;
  const concentration = Number(value);
  return Number.isFinite(concentration) && concentration >= 0 ? concentration : null;
}

function normalizeReading(input = {}, defaults = {}) {
  const collectedAt = normalizeDate(input.collectedAt ?? input.timestamp, new Date());
  const lastReceivedAt = Object.hasOwn(input, 'lastReceivedAt') && input.lastReceivedAt === null
    ? null
    : normalizeDate(input.lastReceivedAt ?? collectedAt, collectedAt);
  const channels = Array.isArray(input.channels)
    ? input.channels.slice(0, 8).map((channel, index) => ({
      channel: Number(channel?.channel) || index + 1,
      connected: channel?.connected !== false,
      alarmLevel: Math.max(0, Math.min(3, Number(channel?.alarmLevel) || 0)),
      alarmText: alarmLevelNames[Math.max(0, Math.min(3, Number(channel?.alarmLevel) || 0))],
    }))
    : [];
  const alarmLevel = Math.max(
    Number(input.alarmLevel) || 0,
    ...channels.filter((channel) => channel.connected).map((channel) => channel.alarmLevel),
  );
  return {
    gasType: String(input.gasType ?? defaults.gasType ?? env.gasSensorType).trim(),
    concentration: normalizeConcentration(input.concentration),
    unit: input.unit === null || input.unit === undefined || input.unit === '' ? null : String(input.unit).trim(),
    alarm: input.alarm === true || alarmLevel > 0,
    alarmLevel: Math.max(0, Math.min(3, alarmLevel)),
    trend: ['rising', 'stable', 'falling', 'unknown'].includes(input.trend) ? input.trend : 'unknown',
    sensorStatus: ['online', 'offline', 'fault', 'calibrating'].includes(input.sensorStatus)
      ? input.sensorStatus
      : defaults.sensorStatus ?? 'online',
    collectedAt,
    connectionStatus: defaults.connectionStatus ?? input.connectionStatus ?? 'online',
    source: defaults.source ?? input.source ?? 'device',
    lastReceivedAt,
    channels,
  };
}

export function createMockSensorData({ risk = 'low', random = Math.random, now = new Date(), data } = {}) {
  if (data) {
    return normalizeReading(data, { connectionStatus: 'simulation', source: 'simulation', sensorStatus: 'online' });
  }
  const alarming = risk === 'high' || (risk === 'medium' && random() < 0.35);
  const concentration = alarming ? 120 + random() * 180 : 5 + random() * 45;
  return normalizeReading({
    gasType: 'combustible',
    concentration: Number(concentration.toFixed(2)),
    unit: 'ppm',
    alarm: alarming,
    alarmLevel: alarming ? 1 : 0,
    trend: alarming ? 'rising' : random() < 0.2 ? 'falling' : 'stable',
    sensorStatus: 'online',
    collectedAt: now,
  }, { connectionStatus: 'simulation', source: 'simulation', sensorStatus: 'online' });
}

class GasTcpClient {
  constructor() {
    this.running = false;
    this.socket = null;
    this.reconnectTimer = null;
    this.connectTimer = null;
    this.parser = new GasFrameParser();
    this.latestReading = null;
    this.latestTransport = null;
    this.lastReceivedAt = null;
  }

  start() {
    if (this.running || !env.gasTcpEnabled) return;
    this.running = true;
    this.connect();
  }

  stop() {
    this.running = false;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.connectTimer);
    this.reconnectTimer = null;
    this.connectTimer = null;
    this.parser.reset();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
  }

  connect() {
    if (!this.running || this.socket) return;
    const socket = net.createConnection({ host: env.gasTcpHost, port: env.gasTcpPort });
    this.socket = socket;
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 5_000);

    this.connectTimer = setTimeout(() => {
      if (!socket.connecting) return;
      socket.destroy(new Error('气体 TCP 连接超时'));
    }, env.gasConnectTimeoutMs);
    this.connectTimer.unref?.();

    socket.on('connect', () => {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
      logger.info({ host: env.gasTcpHost, port: env.gasTcpPort }, '气体通信 TCP 已连接');
    });
    socket.on('data', (chunk) => {
      for (const frame of this.parser.push(chunk)) this.acceptFrame(frame);
    });
    socket.on('error', (error) => {
      logger.warn({ err: error, host: env.gasTcpHost, port: env.gasTcpPort }, '气体通信 TCP 异常');
    });
    socket.on('close', () => {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
      if (this.socket === socket) this.socket = null;
      this.parser.reset();
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (!this.running || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, env.gasReconnectDelayMs);
    this.reconnectTimer.unref?.();
  }

  acceptFrame(frame) {
    const receivedAt = new Date();
    const connectedChannels = frame.channels.filter((channel) => channel.connected);
    const alarmLevel = Math.max(0, ...connectedChannels.map((channel) => channel.alarmLevel));
    this.latestReading = normalizeReading({
      gasType: env.gasSensorType,
      concentration: null,
      unit: null,
      alarm: alarmLevel > 0,
      alarmLevel,
      trend: 'unknown',
      sensorStatus: connectedChannels.length ? 'online' : 'offline',
      collectedAt: receivedAt,
      lastReceivedAt: receivedAt,
      channels: frame.channels,
    }, { connectionStatus: 'online', source: 'device' });
    this.lastReceivedAt = receivedAt;
    this.latestTransport = 'tcp';
  }

  acceptExternalReading(reading) {
    const normalized = normalizeReading(reading, { connectionStatus: 'online', source: 'device', sensorStatus: 'online' });
    this.latestReading = normalized;
    this.lastReceivedAt = normalized.lastReceivedAt;
    this.latestTransport = 'http';
    return structuredClone(normalized);
  }

  connectionStatus() {
    if (!env.gasTcpEnabled && this.latestTransport !== 'http') return 'offline';
    if (!this.lastReceivedAt) return this.socket?.readyState === 'open' ? 'online' : 'offline';
    if (Date.now() - this.lastReceivedAt.getTime() > env.gasDataTimeoutMs) return 'timeout';
    if (this.latestTransport === 'tcp' && this.socket?.readyState !== 'open') return 'offline';
    return 'online';
  }

  status() {
    const connectionStatus = this.connectionStatus();
    return {
      connectionStatus,
      lastReceivedAt: this.lastReceivedAt,
      source: 'device',
      transport: this.latestTransport ?? 'tcp',
      hasReading: Boolean(this.latestReading),
      channels: structuredClone(this.latestReading?.channels ?? []),
      alarm: this.latestReading?.alarm ?? false,
      alarmLevel: this.latestReading?.alarmLevel ?? 0,
    };
  }

  latest() {
    const status = this.connectionStatus();
    if (!this.latestReading) {
      const now = new Date();
      return normalizeReading({
        gasType: env.gasSensorType,
        concentration: null,
        unit: null,
        alarm: false,
        trend: 'unknown',
        sensorStatus: 'offline',
        collectedAt: now,
        lastReceivedAt: null,
      }, { connectionStatus: status, source: 'device', sensorStatus: 'offline' });
    }
    const reading = structuredClone(this.latestReading);
    reading.connectionStatus = status;
    if (status !== 'online') reading.sensorStatus = 'offline';
    return reading;
  }

  async clearAlarm() {
    if (this.latestTransport !== 'tcp' || this.connectionStatus() !== 'online' || this.socket?.readyState !== 'open') {
      throw new AppError(503, 'GAS_DEVICE_OFFLINE', '气体通信未在线，无法发送解除报警命令');
    }
    const command = Buffer.from(env.gasClearAlarmHex.replace(/\s+/g, ''), 'hex');
    await new Promise((resolve, reject) => {
      this.socket.write(command, (error) => (error ? reject(error) : resolve()));
    }).catch((error) => {
      throw new AppError(502, 'GAS_COMMAND_FAILED', '解除气体报警命令发送失败', [{ message: error.message }]);
    });
    return { sent: true, sentAt: new Date(), commandBytes: command.length };
  }
}

const gasClient = new GasTcpClient();

export function startSensorCommunication() {
  gasClient.start();
}

export function stopSensorCommunication() {
  gasClient.stop();
}

export function getGasStatus() {
  return gasClient.status();
}

export function setLatestGasData(reading) {
  return gasClient.acceptExternalReading(reading);
}

export async function clearGasAlarm() {
  return gasClient.clearAlarm();
}

export async function readSensor(options = {}) {
  if (options.mode === 'simulation') {
    return createMockSensorData({ ...options, data: options.data });
  }
  return gasClient.latest();
}
