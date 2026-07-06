import express from 'express';
import { authRouter } from './auth.router';
import { dashboardRouter } from './dashboard.router';
import { clientsRouter } from './clients.router';
import { ordersRouter } from './orders.router';
import { driversRouter } from './drivers.router';
import { vehiclesRouter } from './vehicles.router';
import { carriersRouter } from './carriers.router';
import { marketDataRouter } from './market-data.router';
import { usersRouter } from './users.router';
import { notificationsRouter } from './notifications.router';
import { companiesRouter } from './companies.router';
import { companyAccountsRouter } from './company-accounts.router';

export const apiRouter = express.Router();

apiRouter.get('/', (req, res) => {
  res.send('Hello World!');
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/clients', clientsRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/drivers', driversRouter);
apiRouter.use('/vehicles', vehiclesRouter);
apiRouter.use('/carriers', carriersRouter);
apiRouter.use('/market-data', marketDataRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/companies', companiesRouter);
apiRouter.use('/company-accounts', companyAccountsRouter);
