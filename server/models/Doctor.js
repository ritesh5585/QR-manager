import mongoose from "mongoose";

const doctorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  scCode: { type: String, required: true, unique: true },
  speciality: { type: String, required: true },
  mr: { type: mongoose.Schema.Types.ObjectId, ref: 'MR', required: true },
  role: { type: String, default: 'doctor' },
  city: { type: String, required: true },
});

const Doctor = mongoose.model('Doctor', doctorSchema);

export default Doctor;
