import { Router } from 'express';
import contractRouter from './contract.router';
import logisticsRouter from './logistics.router';

export const apiRouter: Router = Router();

// Роути для договорів
apiRouter.use('/contracts', contractRouter);

// Роути для логістики
apiRouter.use('/logistics-contracts', logisticsRouter);
