import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema(
  {
    deviceCode: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 50 },
    deviceName: { type: String, required: true, trim: true, maxlength: 100 },
    deviceType: {
      type: String,
      enum: ['xray', 'gas_sensor', 'integrated', 'gateway', 'other'],
      default: 'integrated',
    },
    location: { type: String, required: true, trim: true, maxlength: 200 },
    status: { type: String, enum: ['online', 'offline', 'warning', 'maintenance'], default: 'offline', index: true },
    lastHeartbeatAt: { type: Date, default: null, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

deviceSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export const Device = mongoose.models.Device || mongoose.model('Device', deviceSchema);
