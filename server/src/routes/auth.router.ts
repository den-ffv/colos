import { Router } from 'express';
import { body, validationResult } from 'express-validator';

export const authRouter: Router = Router();

authRouter.post('/login', (req, res) => {});
authRouter.post('/register', (req, res) => {});
authRouter.post('/logout', (req, res) => {});