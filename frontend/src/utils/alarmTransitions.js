export const ALARM_TRANSITIONS = Object.freeze({
  unconfirmed: ['confirmed', 'ignored'],
  confirmed: ['processing', 'ignored'],
  processing: ['resolved', 'ignored'],
  resolved: [],
  ignored: [],
});

export function canTransitionAlarm(from, to, isAdmin = false) {
  if ((from === 'resolved' || from === 'ignored') && to === 'unconfirmed') return isAdmin;
  return (ALARM_TRANSITIONS[from] ?? []).includes(to);
}
