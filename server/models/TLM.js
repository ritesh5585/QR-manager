import mongoose from "mongoose";

const tlmSchema = new mongoose.Schema({
    name: {type: String, required: true},
    id: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    admin: {type: mongoose.Schema.Types.ObjectId, ref:'Admin', required: true},
    SLM: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SLM' }],
    role:{type: String, default:'tlm'},
    hq: {type: String, required: true},
    zone: {type: String, required: true},
    credits: { 
        type: Number, 
        default: 0 
    },
    creditExpiry: { 
        type: Date, 
        required: false
    },
});

const TLM = mongoose.model('TLM', tlmSchema)

export default TLM;
