import { Router } from 'express';
import contractRouter from './contract.router';

export const apiRouter: Router = Router();

// Роути для договорів
apiRouter.use('/contracts', contractRouter);
