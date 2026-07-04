import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getOrCreateWorkflowSession } from '../controllers/workflow.controller';

export const workflowRoutes = Router();

workflowRoutes.use(authMiddleware);

workflowRoutes.post('/session', getOrCreateWorkflowSession);
