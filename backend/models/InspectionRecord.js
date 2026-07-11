import mongoose from 'mongoose';

const bboxSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true, min: 0 },
    y: { type: Number, required: true, min: 0 },
    width: { type: Number, required: true, min: 0 },
    height: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const xrayResultSchema = new mongoose.Schema(
  {
    className: { type: String, required: true, trim: true, maxlength: 100 },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    bbox: { type: bboxSchema, required: true },
    modelName: { type: String, default: 'mock-yolo', trim: true },
    modelVersion: { type: String, default: 'simulation-v1', trim: true },
  },
  { _id: false },
);

const gasSensorSchema = new mongoose.Schema(
  {
    gasType: { type: String, default: 'combustible', trim: true },
    concentration: { type: Number, required: true, min: 0 },
    unit: { type: String, default: 'ppm', trim: true },
    alarm: { type: Boolean, default: false },
    trend: { type: String, enum: ['rising', 'stable', 'falling', 'unknown'], default: 'stable' },
    sensorStatus: { type: String, enum: ['online', 'offline', 'fault', 'calibrating'], default: 'online' },
    collectedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const associationSchema = new mongoose.Schema(
  {
    syncSignal: { type: String, default: null, maxlength: 120 },
    windowStart: { type: Date, default: null },
    windowEnd: { type: Date, default: null },
    quality: { type: String, enum: ['exact', 'estimated', 'unlinked'], default: 'unlinked' },
    notes: { type: String, default: '', maxlength: 500 },
  },
  { _id: false },
);

const inspectionRecordSchema = new mongoose.Schema(
  {
    packageId: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    timestamp: { type: Date, required: true, default: Date.now },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], required: true },
    riskScore: { type: Number, min: 0, max: 100, required: true },
    riskReasons: { type: [String], default: [] },
    reviewSuggestion: { type: String, default: '请安检人员结合现场情况复核', maxlength: 500 },
    xrayImageUrl: { type: String, default: null, maxlength: 500 },
    xrayResult: { type: [xrayResultSchema], default: [] },
    gasSensor: { type: gasSensorSchema, default: null },
    association: { type: associationSchema, default: () => ({ quality: 'unlinked' }) },
    deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', default: null },
    source: { type: String, enum: ['manual', 'simulation', 'api'], default: 'manual' },
    status: { type: String, enum: ['pending', 'reviewed', 'escalated', 'closed'], default: 'pending' },
    operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

inspectionRecordSchema.index({ timestamp: -1 });
inspectionRecordSchema.index({ riskLevel: 1, timestamp: -1 });
inspectionRecordSchema.index({ status: 1, timestamp: -1 });
inspectionRecordSchema.index({ 'gasSensor.alarm': 1, timestamp: -1 });
inspectionRecordSchema.index({ isDeleted: 1, timestamp: -1 });

inspectionRecordSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export const InspectionRecord =
  mongoose.models.InspectionRecord || mongoose.model('InspectionRecord', inspectionRecordSchema);
