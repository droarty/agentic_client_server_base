import { Router } from 'express';
import passport from 'passport';
import { register, login } from '../controllers/auth.controller';
import { googleCallback } from '../controllers/oauth.controller';
import { env } from '../config/env';

export const authRoutes = Router();

// Email / password
authRoutes.post('/register', register);
authRoutes.post('/login', login);

// Google OAuth
authRoutes.get(
  '/google',
  (req, res, next) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      res.status(503).json({ message: 'Google OAuth is not configured' });
      return;
    }
    next();
  },
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

authRoutes.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${env.CLIENT_URL}/login?error=oauth_failed`,
  }),
  googleCallback
);
