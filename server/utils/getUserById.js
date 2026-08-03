import Admin from "../models/Admin.js";
import TLM from "../models/TLM.js";
import SLM from "../models/SLM.js";
import FLM from "../models/FLM.js";
import MR from "../models/MR.js";

const getUserById = async (_id) => {
  const modelMap = [
    { model: Admin, role: "admin" },
    { model: TLM, role: "tlm" },
    { model: SLM, role: "slm" },
    { model: FLM, role: "flm" },
    { model: MR, role: "mr" },
  ];

  for (const { model, role } of modelMap) {
    const user = await model.findOne({ _id });
    if (user) {
      user.role = role;
      return user;
    }
  }

  return null;
};

export default getUserById;
