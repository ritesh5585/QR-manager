import mongoose from "mongoose";
import { nanoid } from "nanoid";
import QR from "../models/QR.js";
import CreditTransaction from "../models/CreditTransaction.js";
import getUserById from "../utils/getUserById.js";
import getAllSubordinatesRecursive from "../utils/getAllSubordinatesRecursive.js";
import { QRCodeStyling } from "qr-code-styling/lib/qr-code-styling.common.js";
import nodeCanvas from "canvas";
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// create qr code
export async function createQRCode(req, res) {
  try {
    const { creator, type } = req.body;

    if (!creator?.userObjId || !creator?.role || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    let createdFor;

    if (type === "prescription" && req.body.createdFor) {
      createdFor = req.body.createdFor;
    }

    const user = await getUserById(creator.userObjId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.credits < 1) {
      return res.status(400).json({ error: "Insufficient credits" });
    }

    const qrId = nanoid(6);
    const imageUrl = `https://dev.livequiz.digilateral.com/qr-codes/${qrId}.svg`;
    const redirectUrl = `https://dev.livequiz.digilateral.com/qr/scan/${qrId}`;
    let initialUrl;

    if (type === "business_card") {
      initialUrl = `https://digilateral.com/business-card/templates/${qrId}`;
    } else if (type === "prescription") {
      initialUrl = `https://digilateral.com/ar-tick/scan/${qrId}`;
    }

    // 1. Create QR record
    const newQR = new QR({
      qrId,
      creator,
      initialUrl,
      qrExpiry: user.creditExpiry,
      type,
      imageUrl,
      ...(createdFor && { createdFor }), // <-- only add if exists
    });

    await newQR.save();

    const userObjectId = new mongoose.Types.ObjectId(creator.userObjId);

    // 2. Add credit transaction
    const txn = new CreditTransaction({
      performer: {
        userObjId: userObjectId,
        role: creator.role,
        previousBalance: user.credits,
        updatedBalance: user.credits - 1,
      },
      targetUser: {
        userObjId: null,
        role: "doctor",
        previousBalance: null,
        updatedBalance: null,
      },
      intendedAmount: 1,
      actualAmount: 1,
      type: "use",
      description: `QR code generated: ${qrId}`,
    });

    await txn.save();

    // 3. Deduct 1 credit
    user.credits -= 1;
    await user.save();

    // 4. Generate QR code
    const qrCode = new QRCodeStyling({
      jsdom: JSDOM,
      nodeCanvas,
      type: "svg",
      width: 300,
      height: 300,
      data: redirectUrl,
      image: "",
      dotsOptions: {
        color: "#046a81ff",
        type: "rounded",
      },
      backgroundOptions: {
        color: "#ffffffff",
      },
      cornersSquareOptions: {
        color: "#087b8dff",
        type: "extra-rounded",
      },
      imageOptions: {
        crossOrigin: "anonymous",
        margin: 20,
        saveAsBlob: true,
      },
    });

    const buffer = await qrCode.getRawData("svg");

    // 5. Save SVG to /qr-codes folder
    const fileName = `${qrId}.svg`;
    const filePath = path.join(__dirname, "../qr-codes", fileName);
    fs.writeFileSync(filePath, buffer);

    // 6. Respond with QR URL
    res.status(200).json({
      success: true,
      qrId,
      imageUrl,
      status: "notAssigned",
      createdAt: new Date().toISOString().split("T")[0] + "T00:00:00.000Z",
      qrExpiry:
        new Date(user.creditExpiry).toISOString().split("T")[0] +
        "T00:00:00.000Z",
    });
  } catch (error) {
    console.error("QR Generation Error:", error);
    res.status(500).json({ error: "QR generation failed" });
  }
}

// Endpoint to handle QR scan
export async function handleQRScan(req, res) {
  try {
    const { qrId } = req.params;
    const qr = await QR.findOne({ qrId });

    if (!qr) return res.status(404).send("QR code not found");

    const redirectUrl = qr.status === "assigned" ? qr.finalUrl : qr.initialUrl;
    res.redirect(redirectUrl);
  } catch (err) {
    console.error("QR redirect error:", err);
    res.status(500).send("Internal server error");
  }
}

// Endpoint to list all qrs for a specific user
export async function allQRsListByUser(req, res) {
  try {
    const { userObjId } = req.query;
    if (!userObjId) {
      res.status(400).send("Missing userObjId");
    }
    const user = await getUserById(userObjId);
    if (!user) {
      res.status(404).send("user not fount");
    }

    const allQRS = await QR.find({ "creator.userObjId": userObjId }).sort({
      createdAt: -1,
    });
    res.status(200).json(allQRS);
  } catch (err) {
    console.error("Failed to fetch QRs: ", err);
    res.status(500).send("Internal server error");
  }
}

// Endpoint to list all qrs that are generated by user hierarchy
export async function allQRsList(req, res) {
  try {
    const { userObjId } = req.query;
    if (!userObjId) return res.status(400).send("Missing userObjId");

    const user = await getUserById(userObjId);
    if (!user) return res.status(404).send("User not found");

    // Get all subordinates (recursive)
    const subordinates = await getAllSubordinatesRecursive(user);

    // Collect their ObjectIds as strings
    const allRelevantIds = [
      user._id.toString(),
      ...subordinates.map((u) => u._id.toString()),
    ];

    // Fetch QRs where creator.userObjId matches any of the IDs
    const qrList = await QR.find({
      "creator.userObjId": { $in: allRelevantIds },
    }).sort({ createdAt: -1 });

    // Enrich each QR with creator ID (optional)
    const enrichedQRs = await Promise.all(
      qrList.map(async (qr) => {
        const creatorUser = await getUserById(qr.creator.userObjId);
        return {
          ...qr.toObject(),
          creator: {
            ...qr.creator,
            id: creatorUser?.id || null,
          },
        };
      }),
    );

    res.status(200).json(enrichedQRs);
  } catch (err) {
    console.error("Failed to fetch enriched QRs:", err);
    res.status(500).send("Internal server error");
  }
}

// assign doctor
export async function assignQRDetails(req, res) {
  try {
    const { qrId } = req.params;
    const details = req.body;
    console.log("details from assignQrDetails", details);

    const qr = await QR.findOne({ qrId });
    if (!qr) return res.status(404).json({ error: "QR not found" });

    qr.assignedDetails = details;
    qr.status = "assigned";
    if (qr.type === "business_card") {
      qr.finalUrl = `https://digilateral.com/business-card/card/${qrId}/${qr.assignedDetails.templateId}`;
    } else if (qr.type === "prescription") {
      qr.finalUrl = `https://digilateral.com/ar-tick/result/${qrId}`;
    }
    await qr.save();
    res.status(200).json({ message: "QR assigned", qr });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

// get QR details
export async function getQRDetails(req, res) {
  const { qrId } = req.params;

  try {
    const qr = await QR.findOne({ qrId });

    if (!qr) {
      return res.status(404).json({ error: "QR not found" });
    }

    return res.status(200).json(qr);
  } catch (error) {
    console.error("Error in getQRDetails:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function generateVCard(req, res) {
  const { qrId } = req.params;

  if (!qrId) {
    return res.status(400).send("qrId is required");
  }

  try {
    const qr = await QR.findOne({ qrId });

    if (!qr) {
      return res.status(404).json({ error: "QR not found" });
    }

    const name = qr.doctorDetails.name || "";
    const phone = qr.doctorDetails.phone || "";
    const email = qr.doctorDetails.email || "";

    const nameParts = name.split(" ");
    const lastName = nameParts.pop();
    const firstName = nameParts.join(" ");

    const vCard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `N:${lastName};${firstName};;;`,
      `FN:${name}`,
      `TEL;TYPE=CELL:${phone}`,
      `EMAIL:${email}`,
      "END:VCARD",
    ].join("\r\n");

    const safeName = qr.doctorDetails.name
      .trim()
      .replace(/\s+/g, "-") // Replace spaces with dashes
      .replace(/[^a-zA-Z0-9\-]/g, ""); // Remove special characters

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${safeName}.vcf`,
    );
    res.setHeader("Content-Type", "text/x-vcard; charset=utf-8");
    res.status(200).send(vCard);
  } catch (err) {
    console.error("Error generating vCard:", err);
    res.status(500).send("Internal Server Error");
  }
}
