import { Router } from 'express';
import { receiveSecurityMachineImage } from '../controllers/securityMachineController.js';

const router = Router();
router.post('/', receiveSecurityMachineImage);

export default router;
