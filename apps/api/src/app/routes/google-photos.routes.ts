import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { connectGooglePhotos, googlePhotosCallback } from '../controllers/google-photos.controller';

export const googlePhotosRoutes = Router();

// Authenticated — an already-logged-in user explicitly triggers this,
// distinct from the login flow (see plan for the incremental-authorization
// rationale).
googlePhotosRoutes.get('/connect', authMiddleware, connectGooglePhotos);

// Not behind authMiddleware — this is Google's redirect back, which carries
// no Authorization header. The authenticated user's identity travels via the
// signed `state` param instead (verified inside the controller).
googlePhotosRoutes.get('/callback', googlePhotosCallback);
