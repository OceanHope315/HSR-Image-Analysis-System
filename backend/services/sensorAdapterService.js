export function createMockSensorData({ risk = 'low', random = Math.random, now = new Date() } = {}) {
  const alarming = risk === 'high' || (risk === 'medium' && random() < 0.35);
  const concentration = alarming ? 120 + random() * 180 : 5 + random() * 45;
  return {
    gasType: 'combustible',
    concentration: Number(concentration.toFixed(2)),
    unit: 'ppm',
    alarm: alarming,
    trend: alarming ? 'rising' : random() < 0.2 ? 'falling' : 'stable',
    sensorStatus: 'online',
    collectedAt: now,
  };
}

export async function readSensor(options = {}) {
  return createMockSensorData(options);
}
