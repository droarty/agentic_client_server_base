import { Router } from 'express';
import { register, login } from '../controllers/auth.controller';

export const authRoutes = Router();

authRoutes.post('/register', register);
authRoutes.post('/login', login);
