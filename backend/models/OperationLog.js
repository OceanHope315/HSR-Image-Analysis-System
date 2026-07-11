import mongoose from 'mongoose';

const operationLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    action: { type: String, required: true, trim: true, maxlength: 100 },
    resourceType: { type: String, required: true, trim: true, maxlength: 100 },
    resourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

operationLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
operationLogSchema.index({ action: 1, createdAt: -1 });

operationLogSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export const OperationLog = mongoose.models.OperationLog || mongoose.model('OperationLog', operationLogSchema);
