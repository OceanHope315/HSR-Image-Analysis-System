import { AppError } from '../utils/AppError.js';
import { writeOperationLog } from '../utils/audit.js';

export async function uploadXrayImage(req, res) {
  if (!req.file) throw new AppError(400, 'UPLOAD_REQUIRED', '请选择要上传的 X 光图片');
  const result = {
    url: `/uploads/xrays/${encodeURIComponent(req.file.filename)}`,
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype,
  };
  await writeOperationLog(req, { action: 'upload.xray', resourceType: 'Upload', after: result });
  res.status(201).json({ success: true, data: result });
}
