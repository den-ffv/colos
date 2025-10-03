import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { register, login } from '@/controllers/auth.controller';

export const authRouter: Router = Router();

authRouter.post('/login', async (request: Request, response: Response) => {
  try {
    const res = await login(request.body);

    response.status(200).json(res);
  } catch (error: any) {
    response.status(500).json({ message: 'Internal server error' });
  }
});
authRouter.post('/register', async (request: Request, response: Response) => {
  try {
    const res = await register(request.body);

    response.status(201).json(res);
  } catch (error: any) {
    console.error('Registration error:', error);
    response.status(500).json({ message: 'Internal server error' });
  }
});
authRouter.post('/logout', (request: Request, response: Response) => {});