import mongoose from "mongoose";

const creditTransactionSchema = new mongoose.Schema({
  performer: {
    userObjId: { type: mongoose.Schema.Types.Mixed, required: true },
    role: { type: String, enum: ['superadmin', 'admin', 'tlm', 'slm', 'flm', 'mr'], required: true },
    previousBalance: { type: Number, required: true },
    updatedBalance: { type: Number, required: true }
  },
  targetUser: {
    userObjId: { type: mongoose.Schema.Types.Mixed },
    role: { type: String, enum: ['admin', 'tlm', 'slm', 'flm', 'mr', 'doctor'] },
    previousBalance: { type: Number },
    updatedBalance: { type: Number }
  },
  intendedAmount: { type: Number, required: true },
  actualAmount: { type: Number, required: true },
  type: { type: String, enum: ['allocation', 'issue', 'use', 'reclaim'], required: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("CreditTransaction", creditTransactionSchema);