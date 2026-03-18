import { Request, Response } from 'express';
import { IUser } from '../models/user.model';
import { generateToken } from '../services/auth.service';
import { createOAuthCode, redeemOAuthCode } from '../services/oauth-code.service';
import { env } from '../config/env';

export function googleCallback(req: Request, res: Response): void {
  const user = req.user as IUser;
  const token = generateToken(user._id.toString());
  const code = createOAuthCode(token);
  res.redirect(`${env.CLIENT_URL}/auth/callback?code=${code}`);
}

export function exchangeCode(req: Request, res: Response): void {
  const { code } = req.body as { code?: string };
  if (!code) {
    res.status(400).json({ message: 'Missing code' });
    return;
  }
  const token = redeemOAuthCode(code);
  if (!token) {
    res.status(400).json({ message: 'Invalid or expired code' });
    return;
  }
  res.json({ token });
}
