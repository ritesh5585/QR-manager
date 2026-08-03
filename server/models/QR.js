import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

const qrSchema = new Schema({
  qrId: {
    type: String,
    unique: true,
    required: true,
  },
  type: {
    type: String,
    enum: ['business_card', 'prescription'],
    required: true,
  },
  imageUrl: {
    type: String,
    required: true,
  },
  creator: {
    userObjId: {
      type: Types.ObjectId,
      required: true,
    },
    role: {
      type: String,
      enum: ['admin', 'tlm', 'slm', 'flm', 'mr'],
      required: true,
    },
  },
  createdFor:{
     userObjId: {
      type: Types.ObjectId,
    },
    role: {
      type: String,
      enum: ['doctor'],
    },
  },
  initialUrl: {
    type: String,
    required: true,
  },
  finalUrl: {
    type: String,
  },
  status: {
    type: String,
    enum: ['notAssigned', 'assigned', 'withdrawn'],
    default: "notAssigned",
    required: true,
  },
  qrExpiry: {
    type: Date,
    required: true,
  },
  assignedDetails: {
    type: Schema.Types.Mixed,
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default model("QR", qrSchema);
