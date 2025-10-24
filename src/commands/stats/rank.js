const { AttachmentBuilder, ApplicationCommandOptionType } = require("discord.js");
const { EMBED_COLORS } = require("@root/config");
const { getMemberStats, getXpLb } = require("@schemas/MemberStats");
const Canvas = require("@helpr/modern-rank-card");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "rank",
  description: "Displays a member's rank in this server",
  cooldown: 5,
  category: "STATS",
  botPermissions: ["AttachFiles"],
  command: {
    enabled: true,
    usage: "[@member|id]",
  },
  slashCommand: {
    enabled: true,
    options: [
      {
        name: "user",
        description: "Target user",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
    ],
  },

  async messageRun(message, args, data) {
    const member = (await message.guild.resolveMember(args[0])) || message.member;
    const response = await getRankCard(member, data.settings);
    await message.safeReply(response);
  },

  async interactionRun(interaction, data) {
    const user = interaction.options.getUser("user") || interaction.user;
    const member = await interaction.guild.members.fetch(user);
    const response = await getRankCard(member, data.settings);
    await interaction.followUp(response);
  },
};

async function getRankCard(member, settings) {
  const { guild, user } = member;
  if (!settings.stats.enabled) return "Stats tracking is disabled on this server.";

  const memberStats = await getMemberStats(guild.id, user.id);
  if (!memberStats.xp) return `${user.username} is not ranked yet!`;

  // Leaderboard position
  const lb = await getXpLb(guild.id, 100);
  const pos = lb.findIndex((doc) => doc.member_id === user.id) + 1 || 0;

  // XP data
  const xpNeeded = memberStats.level * memberStats.level * 100;
  const xpCurrent = memberStats.xp;
  const level = memberStats.level;

  try {
    // Build modern rank card
    const rankCard = new Canvas.RankCard()
      .setAddon("xp", true)
      .setAddon("rank", true)
      .setAddon("color", true)
      .setAvatar(user.displayAvatarURL({ extension: "png", size: 256 }))
      .setUsername(member.displayName)
      .setLevel(level)
      .setRank(pos)
      .setXP("current", xpCurrent)
      .setXP("needed", xpNeeded)

      // Gradient XP bar (blue → purple)
      .setColor("bar", {
        gradient: {
          colors: ["#00C9FF", "#92FE9D"],
          angle: 90,
        },
      })

      // Gradient level and rank text
      .setColor("level", {
        gradient: {
          colors: ["#FFD700", "#FF8C00"],
          angle: 45,
        },
      })
      .setColor("rank", {
        gradient: {
          colors: ["#B993D6", "#8CA6DB"],
          angle: 90,
        },
      })

      // Circular avatar frame
      .setAvatarBorder({
        color: EMBED_COLORS.BOT_EMBED,
        width: 6,
        rounded: true,
      })

      // Layered background: gradient + image overlay
      .setBackgroundGradient({
        colors: ["#1f1c2c", "#928DAB"], // dark violet to gray gradient
        angle: 135,
      })
      .setBackgroundOverlay({
        image: "https://i.imgur.com/hwgvX0t.png", // your image overlay
        opacity: 0.25, // 25% opacity blend with gradient
        blendMode: "overlay", // soft overlay look
      });

    const image = await rankCard.toAttachment();
    const attachment = new AttachmentBuilder(image.toBuffer(), { name: "rank.png" });

    return { files: [attachment] };
  } catch (err) {
    console.error("Rank card generation failed:", err);
    return "Failed to generate rank card.";
  }
}
