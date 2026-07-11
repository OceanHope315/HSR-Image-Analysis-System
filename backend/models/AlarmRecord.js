import mongoose from 'mongoose';

const alarmRecordSchema = new mongoose.Schema(
  {
    inspectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InspectionRecord',
      required: true,
      unique: true,
    },
    level: { type: String, enum: ['medium', 'high'], required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    reasons: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['unconfirmed', 'confirmed', 'processing', 'resolved', 'ignored'],
      default: 'unconfirmed',
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    confirmedAt: { type: Date, default: null },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    handledAt: { type: Date, default: null },
    handlingNote: { type: String, default: '', maxlength: 2000 },
  },
  { timestamps: true },
);

alarmRecordSchema.index({ status: 1, createdAt: -1 });
alarmRecordSchema.index({ level: 1, createdAt: -1 });

alarmRecordSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export const AlarmRecord = mongoose.models.AlarmRecord || mongoose.model('AlarmRecord', alarmRecordSchema);
