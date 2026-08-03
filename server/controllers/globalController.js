import XLSX from "xlsx";
import jwt from "jsonwebtoken";
import SuperAdmin from "../models/SuperAdmin.js";
import Admin from "../models/Admin.js"
import TLM from "../models/TLM.js";
import SLM from "../models/SLM.js";
import FLM from "../models/FLM.js";
import MR from "../models/MR.js";
import CreditTransaction from "../models/CreditTransaction.js";
import dotenv from 'dotenv';
import getUserById from "../utils/getUserById.js";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Go up to the root folder
const excelPath = path.join(__dirname, "..", "data.xlsx");

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

export async function login(req, res) {
  try {
    const { id, password } = req.body;

    if (!id || !password) {
      return res.status(400).json({ error: "ID and password are required for login" });
    }

    // Lookup in all user collections
    const modelMap = [
      { model: SuperAdmin, role: "superadmin" },
      { model: Admin, role: "admin" },
      { model: TLM, role: "tlm" },
      { model: SLM, role: "slm" },
      { model: FLM, role: "flm" },
      { model: MR, role: "mr" },
    ];

    let userFound = null;
    let userRole = null;

    for (const { model, role } of modelMap) {
      const user = await model.findOne({ id });
      if (user) {
        userFound = user;
        userRole = role;
        break;
      }
    }

    if (!userFound || userFound.password !== password) {
      return res.status(401).json({ success: false, message: "invalid credentials" });
    }

    const loginTime = new Date();
    const expiryTime = new Date(loginTime.getTime() + 30 * 24 * 60 * 60 * 1000); // 1 month

    const tokenPayload = {
      _id: userFound._id,
      loginTime,
      expiryTime,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET);

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        objId: userFound._id,
        id: userFound.id,
        name: userFound.name,
        role: userRole,
        region: userFound.region || null,
        hq: userFound.hq || null,
        zone: userFound.zone || null,
      },
    });

  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// get user details
export async function getUserDetails(req, res){
  try{
    const { userObjId } = req.query;
    const user = await getUserById(userObjId);
    if (!user){
      return res.status(404).json({ error: 'User not found' });
    }
    const userObj = user.toObject();
    delete userObj.password;
    return res.json({ user: userObj });
  } catch (error) {
    return res.status(404).json({ error: 'Something went wrong' });
  }
}

// get heirarchy
export const getUserHierarchy = async (req, res) => {
  const { userObjId } = req.query;

  try {
    const objectId = new mongoose.Types.ObjectId(userObjId);

    let hierarchy = {};

    // Check if user is MR
    const mr = await MR.findById(objectId).populate("flm");
    if (mr) {
      hierarchy.mr = { id: mr.id, name: mr.name };
      const flm = await FLM.findById(mr.flm).populate("slm");
      if (flm) {
        hierarchy.flm = { id: flm.id, name: flm.name };
        const slm = await SLM.findById(flm.slm).populate("tlm");
        if (slm) {
          hierarchy.slm = { id: slm.id, name: slm.name };
          const tlm = await TLM.findById(slm.tlm).populate("admin");
          if (tlm) {
            hierarchy.tlm = { id: tlm.id, name: tlm.name };
            const admin = await Admin.findById(tlm.admin);
            if (admin) {
              hierarchy.admin = { id: admin.id, name: admin.name };
            }
          }
        }
      }
      return res.status(200).json(hierarchy);
    }

    // Check if user is FLM
    const flm = await FLM.findById(objectId).populate("slm");
    if (flm) {
      hierarchy.flm = { id: flm.id, name: flm.name };
      const slm = await SLM.findById(flm.slm).populate("tlm");
      if (slm) {
        hierarchy.slm = { id: slm.id, name: slm.name };
        const tlm = await TLM.findById(slm.tlm).populate("admin");
        if (tlm) {
          hierarchy.tlm = { id: tlm.id, name: tlm.name };
          const admin = await Admin.findById(tlm.admin);
          if (admin) {
            hierarchy.admin = { id: admin.id, name: admin.name };
          }
        }
      }
      return res.status(200).json(hierarchy);
    }

    // Check if user is SLM
    const slm = await SLM.findById(objectId).populate("tlm");
    if (slm) {
      hierarchy.slm = { id: slm.id, name: slm.name };
      const tlm = await TLM.findById(slm.tlm).populate("admin");
      if (tlm) {
        hierarchy.tlm = { id: tlm.id, name: tlm.name };
        const admin = await Admin.findById(tlm.admin);
        if (admin) {
          hierarchy.admin = { id: admin.id, name: admin.name };
        }
      }
      return res.status(200).json(hierarchy);
    }

    // Check if user is TLM
    const tlm = await TLM.findById(objectId).populate("admin");
    if (tlm) {
      hierarchy.tlm = { id: tlm.id, name: tlm.name };
      const admin = await Admin.findById(tlm.admin);
      if (admin) {
        hierarchy.admin = { id: admin.id, name: admin.name };
      }
      return res.status(200).json(hierarchy);
    }

    // Check if user is Admin
    const admin = await Admin.findById(objectId);
    if (admin) {
      hierarchy.admin = { id: admin.id, name: admin.name };
      return res.status(200).json(hierarchy);
    }

    // If none matched
    return res.status(404).json({ message: "User not found in hierarchy" });

  } catch (err) {
    console.error("Error fetching hierarchy:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// get subordinate details
export async function getSubordinates(req, res) {
  try {
    const { userObjId } = req.query;

    if (!userObjId) {
      return res.status(400).json({ success: false, message: 'userObjId is required' });
    }

    const user = await getUserById(userObjId);

    // Fetch all transactions where admin is the sender
    const transactionsFrom = await CreditTransaction.find({
      "performer.userObjId": user._id,
    });
    const transactionsTo = await CreditTransaction.find({
      "targetUser.userObjId": user._id,
    });

    // Separate totals based on type
    const totalAllocated = transactionsFrom
      .filter(tx => tx.type === "allocation")
      .reduce((sum, tx) => sum + (tx.actualAmount || 0), 0);

    const totalUsed = transactionsFrom
      .filter(tx => tx.type === "use")
      .reduce((sum, tx) => sum + (tx.actualAmount || 0), 0);

    const totalIssued = transactionsTo
      .filter(tx => tx.type === "issue" || tx.type === "allocation" || tx.type === "reclaim")
      .reduce((sum, tx) => {
        const amount = tx.actualAmount || 0;
        return tx.type === "reclaim" ? sum - amount : sum + amount;
      }, 0);

    const totalReclaimed = transactionsFrom
      .filter(tx => tx.type === "reclaim")
      .reduce((sum, tx) => sum + (tx.actualAmount || 0), 0);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let result = [];
    let Model;

    switch (user.role) {
      case "admin":
        Model = TLM;
        result = user.TLM || [];
        break;
      case "tlm":
        Model = SLM;
        result = user.SLM || [];
        break;
      case "slm":
        Model = FLM;
        result = user.FLM || [];
        break;
      case "flm":
        Model = MR;
        result = user.MR || [];
        break;
      case "mr":
        return res.status(200).json({ success: true, subordinates: [] });
      default:
        return res.status(400).json({ success: false, message: `Invalid role: ${role}` });
    }

    // Fetch all subordinate users
    const users = await Model.find({ _id: { $in: result } }, { password: 0 });

    // Get all subordinate IDs
    const subordinateIds = users.map((u) => u._id);

    // Fetch all transactions involving these subordinates
    const transactions = await CreditTransaction.find({
      $or: [
        { "performer.userObjId": { $in: subordinateIds } },
        { "targetUser.userObjId": { $in: subordinateIds } }
      ]
    });

    // Group transaction data by subordinate
    const creditDataMap = {};
    for (const tx of transactions) {
      const id = (tx.targetUser.userObjId === null) ? tx.performer.userObjId.toString() : tx.targetUser.userObjId.toString() ;
      if (!creditDataMap[id]) {
        creditDataMap[id] = {
          used: 0,
          allocated: 0,
          reclaimed: 0,
        };
      }

      const actual = tx.actualAmount || tx.amount;

      if (tx.type === 'use') creditDataMap[id].used += actual;
      else if (tx.type === 'allocation') creditDataMap[id].allocated += actual;
      else if (tx.type === 'reclaim') creditDataMap[id].reclaimed += actual;
    }

    const enrichedUsers = users.map((u) => {
      const id = u._id.toString();
      const creditStats = creditDataMap[id] || {
        used: 0,
        allocated: 0,
        reclaimed: 0,
      };
      return {
        ...u.toObject(),
        ...creditStats,
        credits: u.credits || 0,
        creditExpiry: u.creditExpiry || null,
      };
    });

    return res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        role: user.role,
        currentCredits: user.credits,
        totalAllocated,
        totalIssued,
        totalUsed,
        totalReclaimed
      },
      subordinateCount: enrichedUsers.length,
      subordinates: enrichedUsers,
    });
  } catch (error) {
    console.error("Error in /users/subordinates:", error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

//utility function
const getOrCreate = async (Model, id, data, map) => {
  if (map[id]) return map[id];

  const existing = await Model.findOne({ id });
  if (existing) {
    map[id] = existing._id;
    return existing._id;
  }

  const doc = new Model(data);
  await doc.save();
  map[id] = doc._id;
  return doc._id;
};

// api to upload data through excel
export async function uploadExcel(req, res){
  const { adminId } = req.query;
  const workbook = XLSX.readFile(excelPath);
  const rawSheet = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: null, raw: true, header: 1 });
  const headers = rawSheet[0].map(h => h?.trim().replace(/\s+/g, ''));
  const sheet = rawSheet.slice(1).map(row => Object.fromEntries(row.map((val, i) => [headers[i], val])));


  const tlmMap = {}, slmMap = {}, flmMap = {}, mrMap = {};

  for (const row of sheet) {
    const {
      TLMID, TLMNAME, TLMPASSWORD,TLMHQ,TLMZONE,
      SLMID, SLMNAME, SLMPASSWORD,SLMHQ,SLMZONE,SLMREGION,
      FLMID, FLMNAME, FLMPASSWORD,FLMHQ,FLMREGION,FLMZONE,
      MRID, MRNAME, MREMAIL, MRPASSWORD, MRHQ, MRREGION, MRZONE, MRBUSINESSUNIT
    } = row;

    // Insert TLM
    const tlmObjectId = await getOrCreate(TLM, TLMID, {
      id: TLMID,
      name: TLMNAME,
      password: TLMPASSWORD,
      role: 'tlm',
      hq: TLMHQ,
      zone: TLMZONE,
      admin: adminId,
      SLM: [],
    }, tlmMap);

    await Admin.findByIdAndUpdate(adminId, { $addToSet: { TLM: tlmObjectId } });

    // Insert SLM
    if (SLMID && SLMNAME) {
      const slmObjectId = await getOrCreate(SLM, SLMID, {
        id: SLMID,
        name: SLMNAME,
        password: SLMPASSWORD,
        role: 'slm',
        hq: SLMHQ,
        zone: SLMZONE,
        region: SLMREGION,
        tlm: tlmObjectId,
        FLM: [],
      }, slmMap);

      await TLM.findByIdAndUpdate(tlmObjectId, { $addToSet: { SLM: slmObjectId } });

      // Insert FLM
      if (FLMID && FLMNAME) {
        const flmObjectId = await getOrCreate(FLM, FLMID, {
          id: FLMID,
          name: FLMNAME,
          password: FLMPASSWORD,
          role: 'flm',
          hq: FLMHQ,
          zone: FLMZONE,
          region: FLMREGION,
          slm: slmObjectId,
          MR: [],
        }, flmMap);

        await SLM.findByIdAndUpdate(slmObjectId, { $addToSet: { FLM: flmObjectId } });

        // Insert MR
        if (MRID && MRNAME) {
          if (!MRBUSINESSUNIT) {
            console.warn(`Missing business unit for MRID ${MRID}`);
            break;
          }

          const mrObjectId = await getOrCreate(MR, MRID, {
            id: MRID,
            name: MRNAME,
            password: MRPASSWORD,
            role: 'mr',
            email: MREMAIL,
            businessUnit: MRBUSINESSUNIT,
            hq: MRHQ,
            zone: MRZONE,
            region: MRREGION,
            flm: flmObjectId,
          }, mrMap);

          await FLM.findByIdAndUpdate(flmObjectId, { $addToSet: { MR: mrObjectId } });
        }
      }
    }
  }
  res.status(201).json({ success:true, message: "All the data uploaded successfully"});
};