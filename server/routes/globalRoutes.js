import express from "express";
import {
  login,
  getSubordinates,
  uploadExcel,
  getUserDetails,
  getUserHierarchy,
} from "../controllers/globalController.js";

const router = express.Router();

router.post("/login", login);
router.get("/getUserDetails", getUserDetails);
router.get("/hierarchy", getUserHierarchy);
router.get("/getSubordinates", getSubordinates);
router.get("/uploadExcel", uploadExcel);

export default router;
