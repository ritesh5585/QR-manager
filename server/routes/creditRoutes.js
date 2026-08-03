import express from 'express';
import { allocateCredits, syncCredits, getCreditsInfo, getTransactionsInfo, getUpdatedTransactionDetails } from '../controllers/creditController.js';

const router = express.Router();

router.post('/allocateCredits', allocateCredits);
router.post('/sync', syncCredits);
router.get('/balance', getCreditsInfo);
router.get('/transactions', getTransactionsInfo);
router.get('/getUpdatedTransactionDetails', getUpdatedTransactionDetails);

export default router;