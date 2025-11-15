import { Router } from 'express';
import { createContract, getContracts, getContract, updateContract } from '../controllers/contract.controller';

const router = Router();

// Створення нового договору
router.post('/', createContract);

// Отримання всіх договорів з пагінацією
router.get('/', getContracts);

// Отримання договору за ID
router.get('/:id', getContract);

// Оновлення договору
router.put('/:id', updateContract);

export default router;
