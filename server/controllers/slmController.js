import TLM from "../models/TLM.js";
import SLM from "../models/SLM.js";

export async function create (req, res) {
    try {
        const { tlmObjectId } = req.query;
        const { name, id, password } = req.body;

        if (!tlmObjectId || !name || !id || !password) {
            return res.status(400).json({ error: 'tlmObjectid, Name, ID, and password are required' });
        }
        const existingTLM = await TLM.findOne({_id: tlmObjectId})
        const existingSLM = await SLM.findOne({ id });

        if (!existingTLM) {
            return res.status(404).json({ error: 'TLM not found' });
        }

        if (existingSLM) {
            return res.status(409).json({ error: 'SLM already exists' });
        }

        const newSLM = new SLM({
            name,
            id,
            password,
            tlm: tlmObjectId,
            role: "slm"
        });

        await newSLM.save();
        await TLM.updateOne(
            {_id: tlmObjectId},
            {$push:{SLM: newSLM._id}}
        );
        console.log("SLM user created");

        res.status(201).json({ success: true, message: 'SLM created successfully', slm: newSLM });
    } catch (error) {
        console.error("Error creating slm:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

export async function login (req, res) {
    try {
        const { id, password } = req.body;

        if ( !id || !password) {
            return res.status(400).json({ error: 'ID and password are required for login' });
        }

        const existingSLM = await SLM.findOne({ id });

        if (existingSLM) {
            if(existingSLM.password === password){
                return res.status(200).json({ success: true, message: 'Login successful' });
            } else {
                return res.status(401).json({ success: false, message: 'Incorrect password' });
            }
        } else {
            return res.status(401).json({ success: false, message: 'Invalid Credentials' });
        }
    } catch (error) {
        console.error("Error logging in the Slm:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
}