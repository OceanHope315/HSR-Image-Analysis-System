import { describe, expect, it } from 'vitest';
import { env } from '../../config/env.js';
import { crc16Modbus, GasFrameParser, parseGasFrame } from '../../services/sensorAdapterService.js';

function gasFrame(connectionBits = 0x0003, alarmBits = 0x000a) {
  const data = Buffer.alloc(20);
  data.writeUInt16BE(connectionBits, 0);
  data.writeUInt16BE(alarmBits, 2);
  const withoutCrc = Buffer.concat([Buffer.from([0xfa, 0x01, 0x03, 0x14]), data]);
  const crc = Buffer.alloc(2);
  crc.writeUInt16LE(crc16Modbus(withoutCrc.subarray(1)), 0);
  return Buffer.concat([withoutCrc, crc]);
}

describe('气体 TCP 协议适配器', () => {
  it('解除报警命令使用参考程序实际的完整 12 字节帧', () => {
    const command = Buffer.from(env.gasClearAlarmHex.replace(/\s+/g, ''), 'hex');
    expect(command).toHaveLength(12);
    expect(command.toString('hex').toUpperCase()).toBe('FA0110000E000102000139AA');
  });

  it('解析通道连接位与每通道 2 bit 报警等级', () => {
    const parsed = parseGasFrame(gasFrame(), 2);
    expect(parsed.channels).toEqual([
      { channel: 1, connected: true, alarmLevel: 2, alarmText: '二级报警' },
      { channel: 2, connected: true, alarmLevel: 2, alarmText: '二级报警' },
    ]);
  });

  it('拒绝 CRC 错误，并能从半包、粘包和前导垃圾中恢复', () => {
    const valid = gasFrame(0x0001, 0x0001);
    const invalid = Buffer.from(valid);
    invalid[invalid.length - 1] ^= 0xff;
    expect(parseGasFrame(invalid, 2)).toBeNull();

    const parser = new GasFrameParser({ channelCount: 2 });
    expect(parser.push(Buffer.concat([Buffer.from([0x00, 0x11]), valid.subarray(0, 9)]))).toEqual([]);
    const parsed = parser.push(Buffer.concat([valid.subarray(9), valid]));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].channels[0]).toMatchObject({ connected: true, alarmLevel: 1 });
  });
});
