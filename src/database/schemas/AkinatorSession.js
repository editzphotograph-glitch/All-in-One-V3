const mongoose = require("mongoose");

const Schema = new mongoose.Schema({
  userId: String,
  username: String,
  category: String,
  resultName: String,
  description: String,
  image: String,
  timesGuessed: { type: Number, default: 1 },
  lastGuessed: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("AkiSession", Schema);
