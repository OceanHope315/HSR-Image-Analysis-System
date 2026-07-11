import mongoose from 'mongoose';
import { InspectionRecord } from '../models/InspectionRecord.js';
import { requireValue, runScript } from './scriptUtils.js';

const execute = process.argv.includes('--execute');

await runScript(execute ? 'archive:execute' : 'archive:plan', async () => {
  const rawDate = requireValue('ARCHIVE_BEFORE_DATE', process.env.ARCHIVE_BEFORE_DATE);
  const beforeDate = new Date(rawDate);
  if (Number.isNaN(beforeDate.getTime())) throw new Error('ARCHIVE_BEFORE_DATE 不是有效日期');
  const filter = { timestamp: { $lt: beforeDate }, isDeleted: false };
  const count = await InspectionRecord.countDocuments(filter);
  process.stdout.write(`归档计划：${beforeDate.toISOString()} 之前共有 ${count} 条非删除记录。\n`);
  if (!execute || count === 0) {
    process.stdout.write('当前为只读预演，不修改或删除任何数据。要复制到归档集合，请显式运行 archive:execute。\n');
    return;
  }
  const archive = mongoose.connection.collection('inspection_record_archives');
  const cursor = InspectionRecord.find(filter).lean().cursor();
  let copied = 0;
  for await (const record of cursor) {
    await archive.updateOne(
      { originalId: record._id },
      { $setOnInsert: { ...record, originalId: record._id, archivedAt: new Date() } },
      { upsert: true },
    );
    copied += 1;
  }
  await archive.createIndex({ originalId: 1 }, { unique: true });
  process.stdout.write(`已复制 ${copied} 条到 inspection_record_archives；原集合数据未删除。\n`);
});
