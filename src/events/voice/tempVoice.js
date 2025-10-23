const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { createTempVoice, deleteTempVoice, getAll } = require("../../database/schemas/tempvoice");

const MASTER_CATEGORY_ID = "1430673210654855370"; // Replace
const MASTER_VOICE_IDS = {
  solo: "1426787282836521123",
  duo: "1426787378562994287",
  trio: "1426787536776204440",
  squad: "1426788200365424692",
  tenz: "1426788667321749586",
};

// Max user limits
const LIMITS = {
  solo: 1,
  duo: 2,
  trio: 3,
  squad: 4,
  tenz: 10,
};

module.exports = async (client) => {
  // Cleanup empty VCs from previous sessions
  const saved = await getAll();
  for (const record of saved) {
    const guild = client.guilds.cache.get(record.guildId);
    if (!guild) continue;

    const channel = guild.channels.cache.get(record.channelId);
    if (!channel) {
      await deleteTempVoice(record.channelId);
      continue;
    }

    if (channel.members.size === 0) {
      await channel.delete().catch(() => {});
      await deleteTempVoice(record.channelId);
    }
  }

  // Voice state handler
  client.on("voiceStateUpdate", async (oldState, newState) => {
    const guild = newState.guild;

    // User joins a master channel
    if (!oldState.channelId && newState.channelId) {
      const joinedId = newState.channelId;
      const type = Object.keys(MASTER_VOICE_IDS).find(t => MASTER_VOICE_IDS[t] === joinedId);
      if (type) {
        const tempName = `${type.toUpperCase()} - ${newState.member.user.username}`;

        const tempVc = await guild.channels.create({
          name: tempName,
          type: ChannelType.GuildVoice,
          parent: MASTER_CATEGORY_ID,
          userLimit: LIMITS[type],
          permissionOverwrites: [
            { id: guild.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] },
            { id: newState.member.id, allow: [PermissionFlagsBits.MoveMembers, PermissionFlagsBits.ManageChannels] },
          ],
        });

        await createTempVoice({
          guildId: guild.id,
          channelId: tempVc.id,
          ownerId: newState.member.id,
          type,
        });

        await newState.setChannel(tempVc).catch(() => {});
      }
    }

    // User leaves a channel
    if (oldState.channelId && (!newState.channelId || oldState.channelId !== newState.channelId)) {
      const oldChannel = oldState.channel;
      if (!oldChannel) return;

      const record = await getAll(); // Get all saved temp channels
      const isTemp = record.find(r => r.channelId === oldChannel.id);
      if (!isTemp) return;

      // Delete if empty
      if (oldChannel.members.size === 0) {
        await oldChannel.delete().catch(() => {});
        await deleteTempVoice(oldChannel.id);
      }
    }
  });
};
