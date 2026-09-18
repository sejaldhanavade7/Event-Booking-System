const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true
        },

        description: {
            type: String,
            required: true
        },

        date: {
            type: String,
            required: true
        },

        time: {
            type: String,
            required: true
        },

        venue: {
            type: String,
            required: true
        },

        location: {
            type: String,
            default: ""
        },

        category: {
            type: String,
            required: true
        },

        price: {
            type: Number,
            default: 0,
            min: 0
        },

        availableSeats: {
            type: Number,
            required: true,
            min: 0
        },

        image: {
            type: String,
            default: ""
        },

        status: {
            type: String,
            enum: ["Active", "Completed", "Cancelled"],
            default: "Active"
        },

        organizer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false
        },

        organizerName: {
            type: String,
            default: "Admin"
        }
    },

    {
        timestamps: true
    }
);

module.exports = mongoose.model("Event", eventSchema);