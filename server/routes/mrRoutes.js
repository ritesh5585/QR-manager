import express from "express";
import { create } from '../controllers/mrController.js'

const router = express.Router();

router.post('/create', create);

export default router;