import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { listDocuments, createDocument, getDocument } from '../controllers/document.controller';

export const documentRoutes = Router();

documentRoutes.use(authMiddleware);

documentRoutes.get('/', listDocuments);
documentRoutes.post('/', createDocument);
documentRoutes.get('/:id', getDocument);
