import express from 'express';
import { authRouter } from './auth.router';

export const apiRouter = express.Router();

apiRouter.get('/', (req, res) => {
  res.send('Hello World!');
});

apiRouter.use('/auth', authRouter);