const mongoose = require("mongoose");

const AkinatorSessionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  category: { type: String, required: true },
  startedAt: { type: Date, default: Date.now },
  finishedAt: { type: Date },
  result: {
    name: { type: String },
    description: { type: String },
    image: { type: String },
    probability: { type: Number },
  },
});

module.exports = mongoose.model("AkinatorSession", AkinatorSessionSchema);
