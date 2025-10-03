import { Request, Response, Router } from 'express';
import { body, validationResult } from 'express-validator';

export const authCustomerRouter: Router = Router();

authCustomerRouter.post('/login', (request: Request, response: Response) => {});
authCustomerRouter.post('/register', (request: Request, response: Response) => {});
authCustomerRouter.post('/logout', (request: Request, response: Response) => {});