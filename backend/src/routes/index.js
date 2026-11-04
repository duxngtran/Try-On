import { Router } from 'express';
import { health } from '../controllers/healthController.js';

export const apiRouter = Router();
apiRouter.get('/health', health);
// Các router auth/profile/admin gắn ở đây khi thực hiện US-01/US-02.
