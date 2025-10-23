const { EmbedBuilder } = require("discord.js");
const Canvas = require("canvas");

// Your Discord user ID
const OWNER_ID = "905880683006799882";

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "gay",
  description: "Check gay percentage of a user",
  cooldown: 10,
  category: "FUN",
  botPermissions: ["SendMessages", "EmbedLinks"],
  command: { enabled: true },
  slashCommand: { enabled: true },

  async messageRun(message, args) {
    const user = message.mentions.users.first() || message.author;
    await sendGayEmbed(message, user);
  },

  async interactionRun(interaction) {
    const user = interaction.options.getUser("user") || interaction.user;
    await sendGayEmbed(interaction, user);
  },
};

function getQuote(percentage) {
  if (percentage <= 20) return "😇 • **Not quite flying the rainbow flag yet.**";
  if (percentage <= 40) return "🌈 • **A bit colorful, testing the waters.**";
  if (percentage <= 60) return "🏳️‍🌈 • **Halfway there, love yourself!**";
  if (percentage <= 80) return "🌟 • **Rainbow vibes are strong!**";
  return "🌈 • **Full rainbow energy!**";
}

async function sendGayEmbed(target, user) {
  const isOwner = user.id === OWNER_ID;
  const percentage = isOwner ? 0 : Math.floor(Math.random() * 101);

  // Canvas setup
  const canvas = Canvas.createCanvas(700, 250);
  const ctx = canvas.getContext("2d");

  // Load LGBTQ background
  const background = await Canvas.loadImage("https://i.ibb.co/H8S5CgW/240-F-337329594-cs-Erl-Hg-S2h0psecwnx-V5t-MTPIp-WCea-D7.jpg"); // Replace with your background
  ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

  // Load user avatar
  const avatar = await Canvas.loadImage(user.displayAvatarURL({ extension: "png", size: 512 }));

  // Draw avatar in circle
  const avatarSize = 180;
  const avatarX = 50;
  const avatarY = canvas.height / 2 - avatarSize / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  ctx.restore();

  // Draw username on image
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px Sans";
  ctx.fillText(user.displayName, 270, 110);

  // Draw percentage on image
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 60px Sans";
  ctx.fillText(`${percentage}%`, 270, 160);

  // Draw progress bar
  const barX = 270;
  const barY = 180;
  const barWidth = 350;
  const barHeight = 25;

  // Background bar
  ctx.fillStyle = "#555555";
  ctx.fillRect(barX, barY, barWidth, barHeight);

  // Filled bar according to percentage
  const fillWidth = (barWidth * percentage) / 100;
  const gradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
  gradient.addColorStop(0, "#ff0000"); // Red
  gradient.addColorStop(0.25, "#ff7f00"); // Orange
  gradient.addColorStop(0.5, "#ffff00"); // Yellow
  gradient.addColorStop(0.75, "#00ff00"); // Green
  gradient.addColorStop(1, "#0000ff"); // Blue
  ctx.fillStyle = gradient;
  ctx.fillRect(barX, barY, fillWidth, barHeight);

  // Optional border for the bar
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, barWidth, barHeight);

  const buffer = canvas.toBuffer();

  // Embed with user mention and description
  const embed = new EmbedBuilder()
    .setTitle(`${user} is ${percentage}% gay.`) // Mention user
    .setDescription(getQuote(percentage))
    .setColor("Random")
    .setImage("attachment://gay.png");

  if (target.followUp) {
    await target.followUp({ embeds: [embed], files: [{ attachment: buffer, name: "gay.png" }] });
  } else {
    await target.channel.send({ embeds: [embed], files: [{ attachment: buffer, name: "gay.png" }] });
  }
}
