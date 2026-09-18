const mongoose = require("mongoose");

let isConnecting = false;

const connectDB = async () => {
    if (mongoose.connection.readyState === 1 || isConnecting) {
        return;
    }

    if (!process.env.MONGO_URI) {
        console.error("MONGO_URI is not defined in environment variables or .env file");
        return;
    }

    try {
        isConnecting = true;
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000
        });
        isConnecting = false;
        console.log("MongoDB connected successfully!");
    } catch (error) {
        isConnecting = false;
        console.error("MongoDB connection failed:", error.message);

        if (error.message && (error.message.includes("SSL alert number 80") || error.message.includes("Could not connect to any servers"))) {
            console.warn("\n=======================================================");
            console.warn(" ACTION REQUIRED: WHITELIST IP IN MONGODB ATLAS");
            console.warn(" MongoDB Atlas is blocking your connection because your");
            console.warn(" current IP address is not in the Network Access list.");
            console.warn("");
            console.warn(" Steps to fix (1 minute):");
            console.warn(" 1. Go to https://cloud.mongodb.com and sign in.");
            console.warn(" 2. In the left sidebar under 'Security', click 'Network Access'.");
            console.warn(" 3. Click the '+ Add IP Address' button.");
            console.warn(" 4. Click 'ALLOW ACCESS FROM ANYWHERE' (adds 0.0.0.0/0).");
            console.warn(" 5. Click 'Confirm'. (Takes ~30-60s to activate)");
            console.warn("=======================================================\n");
        }

        console.log("Retrying connection in 10 seconds...");
        setTimeout(connectDB, 10000);
    }
};

module.exports = connectDB;