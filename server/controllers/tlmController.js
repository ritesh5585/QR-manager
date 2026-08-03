import Admin from "../models/Admin.js";
import TLM from "../models/TLM.js";
 
export async function create(req, res) {
  try {
    const { adminObjectId } = req.query;
    const { name, id, password } = req.body;

    if (!adminObjectId || !name || !id || !password) {
      return res.status(400).json({
        error: "adminObjectId, name, id, and password are required",
      });
    }

    const existingAdmin = await Admin.findById(adminObjectId);
    if (!existingAdmin) {
      return res.status(404).json({
        error: "Admin not found",
      });
    }

    const existingTLM = await TLM.findOne({ id });
    if (existingTLM) {
      return res.status(409).json({
        error: "TLM already exists",
      });
    }

    const newTLM = new TLM({
      name,
      id,
      password,
      admin: adminObjectId,
      role: "tlm",
    });

    await newTLM.save();

    await Admin.updateOne(
      { _id: adminObjectId },
      { $push: { TLM: newTLM._id } },
    );

    console.log("TLM user created");

    res.status(201).json({
      success: true,
      message: "TLM created successfully",
      tlm: newTLM,
    });
  } catch (error) {
    console.error("Error creating TLM:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}

export async function login(req, res) {
  try {
    const { id, password } = req.body;

    if (!id || !password) {
      return res
        .status(400)
        .json({ error: "ID and password are required for login" });
    }

    const existingTLM = await TLM.findOne({ id });

    if (existingTLM) {
      if (existingTLM.password === password) {
        return res
          .status(200)
          .json({ success: true, message: "Login successful" });
      } else {
        return res
          .status(401)
          .json({ success: false, message: "Incorrect password" });
      }
    } else {
      return res
        .status(401)
        .json({ success: false, message: "Invalid Credentials" });
    }
  } catch (error) {
    console.error("Error logging in the tlm:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
