import { Response, NextFunction } from 'express';
import { ChatDocumentModel } from '../models/document.model';
import { AuthRequest } from '../middleware/auth.middleware';

export async function listDocuments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const docs = await ChatDocumentModel.find({ type: 'chat' }).sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    next(err);
  }
}

export async function createDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name } = req.body as { name?: string };
    if (!name?.trim()) {
      res.status(400).json({ message: 'name is required' });
      return;
    }
    const doc = await ChatDocumentModel.create({ name: name.trim(), type: 'chat' });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
}

export async function getDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await ChatDocumentModel.findById(req.params['id']);
    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }
    res.json(doc);
  } catch (err) {
    next(err);
  }
}
