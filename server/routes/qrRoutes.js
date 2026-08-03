import express from 'express';
import {
  createQRCode,
  handleQRScan,
  allQRsListByUser,
  allQRsList,
  assignQRDetails,
  getQRDetails,
  generateVCard,
  
} from '../controllers/qrController.js';

const router = express.Router();

router.post('/create', createQRCode);
router.get('/scan/:qrId', handleQRScan);
router.get('/list', allQRsListByUser);
router.get('/allList', allQRsList);
router.patch("/assign/:qrId", assignQRDetails);
router.get("/details/:qrId", getQRDetails);
router.get("/generateVCard/:qrId", generateVCard);

export default router;
