import TLM from "../models/TLM.js";
import SLM from "../models/SLM.js";
import FLM from "../models/FLM.js";
import MR from "../models/MR.js";

export default async function getAllSubordinatesRecursive(user) {
  const result = [];

  async function recurse(currentUser) {
    if (currentUser.role === "admin") {
      const tlms = await TLM.find({ admin: currentUser._id });
      result.push(...tlms);
      for (const tlm of tlms) await recurse(tlm);
    } else if (currentUser.role === "tlm") {
      const slms = await SLM.find({ tlm: currentUser._id });
      result.push(...slms);
      for (const slm of slms) await recurse(slm);
    } else if (currentUser.role === "slm") {
      const flms = await FLM.find({ slm: currentUser._id });
      result.push(...flms);
      for (const flm of flms) await recurse(flm);
    } else if (currentUser.role === "flm") {
      const mrs = await MR.find({ flm: currentUser._id });
      result.push(...mrs);
      // MR is the last level, so no recursion
    }
  }

  await recurse(user);
  return result;
}
