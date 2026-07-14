import { riskRules } from '../config/riskRules.js';

function normalizedClass(value) {
  return String(value ?? '').trim().toLowerCase();
}

function gasThreshold(sensor) {
  const key = normalizedClass(sensor?.gasType);
  return riskRules.gas.thresholds[key] ?? riskRules.gas.thresholds.default;
}

export function calculateRisk(input = {}) {
  const detections = Array.isArray(input.xrayResult) ? input.xrayResult : [];
  const sensor = input.gasSensor && typeof input.gasSensor === 'object' ? input.gasSensor : null;
  const reasons = [];
  let score = 0;
  let visualEvidence = false;
  let gasEvidence = false;
  let validVisualData = false;

  for (const detection of detections) {
    const confidence = Number(detection?.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      reasons.push(`目标“${detection?.className ?? '未知'}”的置信度数据非法，已忽略`);
      continue;
    }
    validVisualData = true;
    const rule = riskRules.dangerousClasses[normalizedClass(detection?.className)];
    if (!rule || confidence < riskRules.confidence.minimum) continue;
    visualEvidence = true;
    const confidenceFactor = 0.5 + confidence * 0.5;
    score += Math.round(rule.weight * confidenceFactor);
    if (rule.forceHigh && confidence >= riskRules.confidence.high) {
      score = Math.max(score, riskRules.thresholds.high);
    }
    reasons.push(`检测到疑似${rule.label}，置信度 ${confidence.toFixed(2)}`);
  }

  const sensorStatus = sensor?.sensorStatus;
  const sensorAvailable = sensor && !['offline', 'fault'].includes(sensorStatus);
  if (sensor && !sensorAvailable) {
    score += riskRules.sensorUnavailableWeight;
    reasons.push(`气体传感器${sensorStatus === 'offline' ? '离线' : '故障'}，数据不足，不能据此判定安全`);
  }

  if (sensorAvailable) {
    const alarmingChannels = Array.isArray(sensor.channels)
      ? sensor.channels.filter((channel) => channel?.connected && Number(channel?.alarmLevel) > 0)
      : [];
    const hasConcentration = sensor.concentration !== null
      && sensor.concentration !== undefined
      && sensor.concentration !== '';
    const concentration = hasConcentration ? Number(sensor.concentration) : null;
    if (hasConcentration && Number.isFinite(concentration) && concentration >= 0) {
      const threshold = gasThreshold(sensor);
      if (concentration >= threshold * 2) {
        score += riskRules.gas.extremeConcentrationWeight;
        gasEvidence = true;
        reasons.push(`${sensor.gasType ?? '气体'}浓度显著超过参考阈值`);
      } else if (concentration >= threshold) {
        score += riskRules.gas.abnormalConcentrationWeight;
        gasEvidence = true;
        reasons.push(`${sensor.gasType ?? '气体'}浓度超过参考阈值`);
      }
    } else if (hasConcentration) {
      score += 10;
      reasons.push('气体浓度数据无效，已按数据不足处理');
    } else {
      reasons.push('气体设备协议未提供浓度值，当前仅依据通道状态和报警等级判断');
    }
    if (sensor.alarm === true || alarmingChannels.length > 0) {
      score += riskRules.gas.alarmWeight;
      score = Math.max(score, riskRules.gas.alarmMinimumScore);
      gasEvidence = true;
      reasons.push('气体传感器触发报警');
    }
    alarmingChannels.forEach((channel) => {
      const levelName = ['无', '一级', '二级', '三级'][Number(channel.alarmLevel)] ?? `${channel.alarmLevel}级`;
      reasons.push(`气体通道 ${channel.channel} 触发${levelName}报警`);
    });
    if (sensor.trend === 'rising') {
      score += riskRules.gas.risingWeight;
      reasons.push('气体浓度呈上升趋势');
    }
  }

  if (visualEvidence && gasEvidence) {
    score += riskRules.evidenceSynergyWeight;
    reasons.push('视觉与气体风险证据同时存在');
  }

  const hasEffectiveData = validVisualData || sensorAvailable;
  if (!hasEffectiveData) {
    score = Math.max(score, riskRules.noEffectiveDataScore);
    if (!sensor) reasons.push('没有可用的图像检测或传感器数据，需人工复核');
  }
  if (score === 0) reasons.push('当前有效数据未发现明显风险证据');

  score = Math.max(0, Math.min(100, Math.round(score)));
  const riskLevel = score >= riskRules.thresholds.high
    ? 'high'
    : score >= riskRules.thresholds.medium
      ? 'medium'
      : 'low';

  const reviewSuggestion = riskLevel === 'high'
    ? '建议立即由安检人员复核并按现场规程处置，系统结果仅作辅助参考'
    : riskLevel === 'medium'
      ? '建议安检人员重点复核风险证据，必要时进行开包检查'
      : '建议按常规流程人工判图，系统结果不替代安检人员判断';

  return { riskLevel, riskScore: score, riskReasons: [...new Set(reasons)], reviewSuggestion };
}

export const calculateRiskLevel = calculateRisk;
