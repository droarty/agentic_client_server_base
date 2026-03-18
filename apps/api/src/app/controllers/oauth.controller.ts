import { Request, Response } from 'express';
import { IUser } from '../models/user.model';
import { generateToken } from '../services/auth.service';
import { env } from '../config/env';

export function googleCallback(req: Request, res: Response): void {
  const user = req.user as IUser;
  const token = generateToken(user._id.toString());
  res.redirect(`${env.CLIENT_URL}/auth/callback?token=${token}`);
}
