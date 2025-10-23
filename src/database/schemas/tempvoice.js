const mongoose = require("mongoose");
const { CACHE_SIZE } = require("@root/config.js");
const FixedSizeMap = require("fixedsize-map");
const { ChannelType } = require("discord.js");

const cache = new FixedSizeMap(CACHE_SIZE.TEMP_VOICE || 200);

const Schema = new mongoose.Schema(
  {
    guildId: { type: String, required: true },
    channelId: { type: String, required: true, unique: true },
    ownerId: { type: String, required: true },
    type: { type: String, enum: ["solo", "duo", "trio", "squad", "tenz"], required: true },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

const Model = mongoose.model("temp_voice", Schema);

module.exports = {
  /**
   * Save a temp voice channel in DB and cache
   * @param {Object} data { guildId, channelId, ownerId, type }
   */
  async createTempVoice(data) {
    if (!data?.channelId) throw new Error("Channel ID is required.");

    const exists = await Model.findOne({ channelId: data.channelId });
    if (exists) return exists;

    const record = await Model.create(data);
    cache.add(data.channelId, record);
    return record;
  },

  /**
   * Get a temp voice record by channel ID
   * @param {string} channelId
   */
  async getTempVoice(channelId) {
    const cached = cache.get(channelId);
    if (cached) return cached;

    const record = await Model.findOne({ channelId });
    if (record) cache.add(channelId, record);
    return record;
  },

  /**
   * Delete a temp voice record
   * @param {string} channelId
   * @param {import('discord.js').Client} [client]
   */
  async deleteTempVoice(channelId, client) {
    cache.delete(channelId);
    await Model.deleteOne({ channelId });

    if (client) {
      for (const guild of client.guilds.cache.values()) {
        const channel = guild.channels.cache.get(channelId);
        if (channel) {
          await channel.delete().catch(() => {});
          break;
        }
      }
    }
  }
  /**
   * Get all temp voice records
   */
  async getAll() {
    return Model.find({}).lean();
  },
};
