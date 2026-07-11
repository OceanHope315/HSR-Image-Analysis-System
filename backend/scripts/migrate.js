import { AlarmRecord } from '../models/AlarmRecord.js';
import { Device } from '../models/Device.js';
import { InspectionRecord } from '../models/InspectionRecord.js';
import { OperationLog } from '../models/OperationLog.js';
import { User } from '../models/User.js';
import { runScript } from './scriptUtils.js';

await runScript('migrate', async () => {
  const result = await InspectionRecord.updateMany(
    { association: { $exists: false } },
    { $set: { association: { quality: 'unlinked', notes: '' } } },
  );
  await InspectionRecord.updateMany(
    { reviewSuggestion: { $exists: false } },
    { $set: { reviewSuggestion: '请安检人员结合现场情况复核' } },
  );
  for (const model of [User, Device, InspectionRecord, AlarmRecord, OperationLog]) await model.createIndexes();
  process.stdout.write(`兼容迁移完成：补充 association 的记录 ${result.modifiedCount} 条；仅创建缺失索引，不删除现有索引。\n`);
});
