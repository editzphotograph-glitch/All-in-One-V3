const mongoose = require("mongoose");
const { CACHE_SIZE } = require("@root/config.js");
const FixedSizeMap = require("fixedsize-map");

const cache = new FixedSizeMap(CACHE_SIZE.AKINATOR || 200);

const Schema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    username: String,
    category: { type: String, required: true },
    result: {
      name: String,
      description: String,
      image: String,
      probability: Number,
    },
    finishedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

const Model = mongoose.model("akinatorSession", Schema);

module.exports = {
  /**
   * Create a new session
   * @param {object} data
   */
  createSession: async (data) => {
    const newSession = new Model(data);
    await newSession.save();
    cache.add(data.userId, newSession);
    return newSession;
  },

  /**
   * Get last session
   * @param {string} userId
   */
  getSession: async (userId) => {
    const cached = cache.get(userId);
    if (cached) return cached;
    const session = await Model.findOne({ userId }).sort({ finishedAt: -1 });
    if (session) cache.add(userId, session);
    return session;
  },
};
