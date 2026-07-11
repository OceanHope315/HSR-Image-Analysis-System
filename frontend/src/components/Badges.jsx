import {
  alarmStatusLabel,
  deviceStatusLabel,
  inspectionStatusLabel,
  riskLabel,
  roleLabel,
} from '../utils/formatters.js';

export function RiskBadge({ level }) {
  return <span className={`badge badge--risk-${level || 'unknown'}`}>{riskLabel(level)}</span>;
}

export function InspectionStatusBadge({ status }) {
  return <span className={`badge badge--status-${status || 'unknown'}`}>{inspectionStatusLabel(status)}</span>;
}

export function AlarmStatusBadge({ status }) {
  return <span className={`badge badge--alarm-${status || 'unknown'}`}>{alarmStatusLabel(status)}</span>;
}

export function DeviceStatusBadge({ status, possiblyOffline = false }) {
  const shownStatus = possiblyOffline && status === 'online' ? 'offline' : status;
  return (
    <span className={`badge badge--device-${shownStatus || 'unknown'}`}>
      <span className="badge-dot" />
      {possiblyOffline && status === 'online' ? '疑似离线' : deviceStatusLabel(status)}
    </span>
  );
}

export function RoleBadge({ role }) {
  return <span className={`badge badge--role-${role || 'unknown'}`}>{roleLabel(role)}</span>;
}
