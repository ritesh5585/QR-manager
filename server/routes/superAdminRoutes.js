import express from "express";
import { createAdmin, issueCredits, getReport, extendExpiryForHierarchy } from '../controllers/superAdminController.js';

const router = express.Router();

router.post('/createAdmin', createAdmin);
router.post('/issueCredits', issueCredits);
router.patch('/extendExpiry', extendExpiryForHierarchy);
router.get('/getReport', getReport);

export default router;