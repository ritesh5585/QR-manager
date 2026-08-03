import FLM from "../models/FLM.js";
import MR from "../models/MR.js";

export async function create (req, res) {
    try {
        const { flmObjectId } = req.query;
        const { name, id, password } = req.body;

        if (!flmObjectId || !name || !id || !password) {
            return res.status(400).json({ error: 'flmObjectId, Name, ID, and password are required' });
        }
        const existingFLM = await FLM.findOne({_id: flmObjectId})
        const existingMR = await MR.findOne({ id });

        if (!existingFLM) {
            return res.status(404).json({ error: 'FLM not found' });
        }

        if (existingMR) {
            return res.status(409).json({ error: 'MR already exists' });
        }

        const newMR = new MR({
            name,
            id,
            password,
            flm: flmObjectId,
            role: "mr"
        });

        await newMR.save();
        await FLM.updateOne(
            {_id: flmObjectId},
            {$push:{MR: newMR._id}}
        );
        console.log("MR user created");

        res.status(201).json({ success: true, message: 'FLM created successfully', mr: newMR });
    } catch (error) {
        console.error("Error creating mr:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

export async function login (req, res){
    try {
        const { id, password } = req.body;

        if ( !id || !password) {
            return res.status(400).json({ error: 'ID and password are required for login' });
        }

        const existingMR = await MR.findOne({ id });

        if (existingMR) {
            if(existingMR.password === password){
                return res.status(200).json({ success: true, message: 'Login successful' });
            } else {
                return res.status(401).json({ success: false, message: 'Incorrect password' });
            }
        } else {
            return res.status(401).json({ success: false, message: 'Invalid Credentials' });
        }
    } catch (error) {
        console.error("Error logging in the mr:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
}