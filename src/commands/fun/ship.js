const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const Canvas = require("canvas");

// Replace these with your role IDs
const MALE_ROLE_ID = "1430591296808030229";
const FEMALE_ROLE_ID = "1430606157860438016";

const QUOTES = [
  "A love written in the stars ✨",
  "Maybe it’s meant to be ❤️",
  "There’s potential here 👀",
  "It’s complicated... 💔",
  "Love is in the air 💞",
  "A perfect match made by destiny 💖",
];

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "ship",
  description: "Check love compatibility between two users",
  category: "FUN",
  cooldown: 10,
  botPermissions: ["SendMessages", "EmbedLinks", "AttachFiles"],

  command: {
    enabled: true,
    usage: "ship [@user]",
  },

  slashCommand: {
    enabled: true,
  },

  async messageRun(message, args) {
    const processing = await message.safeReply("💖 Processing your ship...");

    const guild = message.guild;
    const author = message.author;
    const mention = message.mentions.users.first();
    let user2;

    // If user mentions someone, compare with them
    if (mention) {
      user2 = mention;
    } else {
      // Otherwise, match with random opposite gender
      const member = message.member;
      const isMale = member.roles.cache.has(MALE_ROLE_ID);
      const isFemale = member.roles.cache.has(FEMALE_ROLE_ID);

      if (!isMale && !isFemale) {
        return processing.edit("❌ You don't have a valid gender role.");
      }

      const targetRoleId = isMale ? FEMALE_ROLE_ID : MALE_ROLE_ID;
      const targetRole = guild.roles.cache.get(targetRoleId);

      if (!targetRole || targetRole.members.size === 0) {
        return processing.edit("⚠️ No members found with the opposite role.");
      }

      const members = Array.from(targetRole.members.values());
      const randomMember = members[Math.floor(Math.random() * members.length)];
      user2 = randomMember.user;
    }

    // Generate random percentage and quote
    const percentage = Math.floor(Math.random() * 101);
    const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];

    // Generate image
    const image = await createShipImage(author, user2, percentage);
    const attachment = new AttachmentBuilder(image, { name: "ship.png" });

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle("💞 Love Match Result")
      .setDescription(
        `**${author.username}** ❤️ **${user2.username}**\n\n💘 **Compatibility:** ${percentage}%\n💬 *${quote}*`
      )
      .setColor(percentage >= 70 ? 0xff4d88 : 0x7289da)
      .setImage("attachment://ship.png");

    await processing.edit({ content: "", embeds: [embed], files: [attachment] });
  },
};

async function createShipImage(user1, user2, lovePercentage) {
  const canvas = Canvas.createCanvas(700, 250);
  const ctx = canvas.getContext("2d");

  // Dynamic color background
  const gradient = ctx.createLinearGradient(0, 0, 700, 0);
  if (lovePercentage >= 70) {
    gradient.addColorStop(0, "#ff4d6d");
    gradient.addColorStop(1, "#ff758f");
  } else if (lovePercentage >= 40) {
    gradient.addColorStop(0, "#ffa07a");
    gradient.addColorStop(1, "#ffb6c1");
  } else {
    gradient.addColorStop(0, "#9ea7ad");
    gradient.addColorStop(1, "#c0c0c0");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Load avatars
  const avatar1 = await Canvas.loadImage(user1.displayAvatarURL({ extension: "png", size: 256 }));
  const avatar2 = await Canvas.loadImage(user2.displayAvatarURL({ extension: "png", size: 256 }));

  // Draw avatars in circles
  ctx.save();
  ctx.beginPath();
  ctx.arc(125, 125, 80, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar1, 45, 45, 160, 160);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(575, 125, 80, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar2, 495, 45, 160, 160);
  ctx.restore();

  // Draw love percentage text
  ctx.font = "bold 40px Sans";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText(`❤️ ${lovePercentage}% ❤️`, canvas.width / 2, 135);

  return canvas.toBuffer();
}
