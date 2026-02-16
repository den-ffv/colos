import express from 'express';
import { authRouter } from './auth.router';
import { dashboardRouter } from './dashboard.router';
import { clientsRouter } from './clients.router';

export const apiRouter = express.Router();

apiRouter.get('/', (req, res) => {
  res.send('Hello World!');
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/clients', clientsRouter);
