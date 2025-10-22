const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const Canvas = require("canvas");

// Replace with your actual role IDs
const MALE_ROLE_ID = "1430591296808030229";
const FEMALE_ROLE_ID = "1430606157860438016";

// Backgrounds for love levels
const BACKGROUNDS = {
  high: "https://i.imgur.com/v3tQhEH.jpg", // passionate red hearts
  medium: "https://i.imgur.com/lQG2lYt.png", // pink romantic tone
  low: "https://i.imgur.com/z7s6T6V.jpg" // grey or neutral background
};

// Dynamic quotes by percentage
const QUOTES = {
  high: [
    "Perfect match! ❤️🔥",
    "A love written in the stars 🌟",
    "Meant to be forever 💍",
    "Soulmates found each other 💖",
    "You two radiate pure love 💞"
  ],
  medium: [
    "Cute chemistry 💕",
    "There’s potential here 😉",
    "Could turn into something special 🌹",
    "Sweet connection, needs time 💫",
    "A warm spark between hearts 💘"
  ],
  low: [
    "Just friends, maybe more someday 😂",
    "One-sided feelings detected 💔",
    "Awkward but adorable 🥴",
    "Better luck next time 💭",
    "Not in this lifetime 😅"
  ]
};

module.exports = {
  name: "ship",
  description: "Check relationship match between two users",
  async execute(message, args, client) {
    // Ignore bots
    if (message.author.bot) return;

    const prefix = "!";
    if (!message.content.startsWith(prefix)) return;

    const [command] = message.content.slice(prefix.length).trim().split(/\s+/);
    if (command !== "ship") return;

    const user1 = message.author;
    let user2 = message.mentions.users.first();

    // If no mention, match with random opposite gender
    if (!user2) {
      const member = message.member;
      if (!member) return message.reply("Unable to detect your member info.");

      if (member.roles.cache.has(MALE_ROLE_ID)) {
        const females = message.guild.members.cache.filter(
          m => m.roles.cache.has(FEMALE_ROLE_ID) && m.id !== user1.id
        );
        if (!females.size) return message.reply("No female users found to match!");
        user2 = females.random().user;
      } else if (member.roles.cache.has(FEMALE_ROLE_ID)) {
        const males = message.guild.members.cache.filter(
          m => m.roles.cache.has(MALE_ROLE_ID) && m.id !== user1.id
        );
        if (!males.size) return message.reply("No male users found to match!");
        user2 = males.random().user;
      } else {
        return message.reply("You don't have a gender role to match from!");
      }
    }

    // Random love percentage
    const lovePercent = Math.floor(Math.random() * 100) + 1;
    const level = lovePercent >= 80 ? "high" : lovePercent >= 50 ? "medium" : "low";
    const quote = QUOTES[level][Math.floor(Math.random() * QUOTES[level].length)];
    const bgURL = BACKGROUNDS[level];

    // Create the canvas
    const canvas = Canvas.createCanvas(700, 250);
    const ctx = canvas.getContext("2d");
    const bg = await Canvas.loadImage(bgURL);
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

    // Load avatars
    const avatar1 = await Canvas.loadImage(user1.displayAvatarURL({ extension: "png", size: 256 }));
    const avatar2 = await Canvas.loadImage(user2.displayAvatarURL({ extension: "png", size: 256 }));

    // Draw avatars (circle masks)
    ctx.save();
    ctx.beginPath();
    ctx.arc(125, 125, 100, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar1, 25, 25, 200, 200);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(575, 125, 100, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar2, 475, 25, 200, 200);
    ctx.restore();

    // Heart + percentage text
    ctx.font = "bold 40px Sans";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.fillText(`${lovePercent}% ❤️`, 350, 140);
    ctx.font = "24px Sans";
    ctx.fillText(quote, 350, 200);

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: "ship.png" });

    // Embed
    const embed = new EmbedBuilder()
      .setColor(level === "high" ? 0xff3366 : level === "medium" ? 0xff6699 : 0x666666)
      .setTitle("💘 Love Match 💘")
      .setDescription(`${user1.username} ❤️ ${user2.username}\n**Compatibility:** ${lovePercent}%`)
      .setImage("attachment://ship.png")
      .setFooter({ text: quote });

    await message.channel.send({ embeds: [embed], files: [attachment] });
  }
};
