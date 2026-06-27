import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  listDocuments,
  createDocument,
  getDocument,
  setUserPermission,
  removeUserPermission,
} from '../controllers/document.controller';

export const documentRoutes = Router();

documentRoutes.use(authMiddleware);

documentRoutes.get('/', listDocuments);
documentRoutes.post('/', createDocument);
documentRoutes.get('/:id', getDocument);
documentRoutes.patch('/:id/user-permissions', setUserPermission);
documentRoutes.delete('/:id/user-permissions/:userId', removeUserPermission);
