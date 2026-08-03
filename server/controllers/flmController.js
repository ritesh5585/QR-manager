import SLM from "../models/SLM.js";
import FLM from "../models/FLM.js";

export async function create(req, res) {
    try {
        const { slmObjectId } = req.query;
        const { name, id, password } = req.body;

        if (!slmObjectId || !name || !id || !password) {
            return res.status(400).json({ error: 'slmObjectId, Name, ID, and password are required' });
        }
        const existingSLM = await SLM.findOne({_id: slmObjectId})
        const existingFLM = await FLM.findOne({ id });

        if (!existingSLM) {
            return res.status(404).json({ error: 'SLM not found' });
        }

        if (existingFLM) {
            return res.status(409).json({ error: 'FLM already exists' });
        }

        const newFLM = new FLM({
            name,
            id,
            password,
            slm: slmObjectId,
            role: "flm"
        });

        await newFLM.save();
        await SLM.updateOne(
            {_id: slmObjectId},
            {$push:{FLM: newFLM._id}}
        );
        console.log("FLM user created");

        res.status(201).json({ success: true, message: 'FLM created successfully', flm: newFLM });
    } catch (error) {
        console.error("Error creating flm:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

export async function login(req, res) {
    try {
        const { id, password } = req.body;

        if ( !id || !password) {
            return res.status(400).json({ error: 'ID and password are required for login' });
        }

        const existingFLM = await FLM.findOne({ id });

        if (existingFLM) {
            if(existingFLM.password === password){
                return res.status(200).json({ success: true, message: 'Login successful' });
            } else {
                return res.status(401).json({ success: false, message: 'Incorrect password' });
            }
        } else {
            return res.status(401).json({ success: false, message: 'Invalid Credentials' });
        }
    } catch (error) {
        console.error("Error logging in the flm:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
}