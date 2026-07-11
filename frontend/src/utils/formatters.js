const riskMap = { high: '高风险', medium: '中风险', low: '低风险' };
const inspectionStatusMap = {
  pending: '待复核',
  reviewed: '已复核',
  escalated: '已升级',
  closed: '已关闭',
};
const alarmStatusMap = {
  unconfirmed: '待确认',
  confirmed: '已确认',
  processing: '处理中',
  resolved: '已解决',
  ignored: '已忽略',
};
const deviceStatusMap = {
  online: '在线',
  offline: '离线',
  warning: '告警',
  maintenance: '维护中',
};
const roleMap = { admin: '管理员', inspector: '安检员', viewer: '只读人员' };

export function formatDateTime(value, fallback = '—') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatNumber(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number);
}

export function formatPercent(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const normalized = number <= 1 ? number * 100 : number;
  return `${formatNumber(normalized, digits)}%`;
}

export function riskLabel(value) {
  return riskMap[value] ?? '未知风险';
}

export function inspectionStatusLabel(value) {
  return inspectionStatusMap[value] ?? value ?? '—';
}

export function alarmStatusLabel(value) {
  return alarmStatusMap[value] ?? value ?? '—';
}

export function deviceStatusLabel(value) {
  return deviceStatusMap[value] ?? value ?? '—';
}

export function roleLabel(value) {
  return roleMap[value] ?? value ?? '—';
}

export function objectId(value) {
  if (!value) return '';
  return typeof value === 'object' ? value._id ?? value.id ?? '' : value;
}

export function displayName(value, fallback = '—') {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  return value.username ?? value.deviceName ?? value.deviceCode ?? value.email ?? fallback;
}

export function normalizeList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export function resolveAssetUrl(path, apiBase = import.meta.env.VITE_API_BASE_URL) {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  const base = apiBase || '/api/v1';
  try {
    const url = new URL(base, window.location.origin);
    const origin = url.origin;
    return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
  } catch {
    return path;
  }
}

export function toDateTimeLocal(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
