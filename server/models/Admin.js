import mongoose from "mongoose";

const adminSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true 
    },
    id: { 
        type: String, 
        required: true, 
        unique: true,
    },
    password: { 
        type: String, 
        required: true 
    },
    credits: { 
        type: Number, 
        default: 0 
    },
    creditExpiry: { 
        type: Date, 
        required: false
    },
    TLM: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'TLM', 
        required: false
    }],
    role: { 
        type: String, 
        default: 'admin' 
    }
});

const Admin = mongoose.model('Admin', adminSchema);

export default Admin;
