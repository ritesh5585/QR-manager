import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log("database connected");
  } catch (err) {
    console.error("database connection error", err);
  }
};

export default connectDB;
