import mongoose from "mongoose";

const superAdminSchema = new mongoose.Schema({
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
    role: { 
        type: String, 
        default: 'superadmin' 
    }
});

const SuperAdmin = mongoose.model('SuperAdmin', superAdminSchema);

export default SuperAdmin;
