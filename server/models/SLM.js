import mongoose from "mongoose";

const slmSchema = new mongoose.Schema({
    name: {type: String, required: true},
    id: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    tlm: {type: mongoose.Schema.Types.ObjectId, ref:'TLM', required: true},
    FLM: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FLM' }],
    role:{type: String, default:'slm'},
    hq: {type: String, required: true},
    zone: {type: String, required: true},
    region: {type: String, required: true},
    credits: { 
        type: Number, 
        default: 0 
    },
    creditExpiry: { 
        type: Date, 
        required: false
    },
});

const SLM = mongoose.model('SLM', slmSchema)

export default SLM;