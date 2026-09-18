const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
    {
        event: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Event",
            required: false
        },

        eventTitle: {
            type: String,
            required: true,
            trim: true
        },

        eventDate: {
            type: String,
            default: ""
        },

        eventVenue: {
            type: String,
            default: ""
        },

        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false
        },

        userName: {
            type: String,
            required: true,
            trim: true
        },

        userEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },

        seats: {
            type: Number,
            required: true,
            min: 1,
            default: 1
        },

        totalAmount: {
            type: Number,
            default: 0,
            min: 0
        },

        status: {
            type: String,
            enum: ["Confirmed", "Pending", "Cancelled"],
            default: "Confirmed"
        },

        confirmationCode: {
            type: String,
            default: ""
        },

        confirmationMessage: {
            type: String,
            default: ""
        },

        activityText: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

bookingSchema.pre("save", function () {
    if (!this.activityText) {
        this.activityText = `Booking confirmed for ${this.eventTitle} (${this.seats} seat${this.seats > 1 ? "s" : ""})`;
    }
});

module.exports = mongoose.model("Booking", bookingSchema);
