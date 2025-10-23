const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fetch = require("node-fetch");

// Map to track per-user cooldowns
const cooldowns = new Map();

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "tod",
  description: "Play Truth or Dare with random questions",
  cooldown: 10,
  category: "FUN",
  botPermissions: ["SendMessages", "EmbedLinks", "UseExternalEmojis"],
  command: { enabled: true },
  slashCommand: { enabled: true },

  async messageRun(message) {
    await startTruthOrDare(message);
  },

  async interactionRun(interaction) {
    await startTruthOrDare(interaction);
  },
};

async function startTruthOrDare(target) {
  const embed = new EmbedBuilder()
    .setTitle("🎲 Truth or Dare")
    .setDescription("Click a button below to get a random question")
    .setColor("Random")
    .setTimestamp();

  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("truth").setLabel("Truth").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("dare").setLabel("Dare").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("random").setLabel("Random").setStyle(ButtonStyle.Success)
  );

  const msg = await (target.followUp
    ? target.followUp({ embeds: [embed], components: [buttonRow] })
    : target.channel.send({ embeds: [embed], components: [buttonRow] }));

  // Collector only for the original button message
  const collector = msg.createMessageComponentCollector({ componentType: 2 });

  collector.on("collect", async (btn) => {
    const userId = btn.user.id;

    // 5-second per-user cooldown
    if (cooldowns.has(userId)) {
      return btn.reply({ content: "⏱️ Please wait 5 seconds before clicking again.", ephemeral: true });
    }
    cooldowns.set(userId, true);
    setTimeout(() => cooldowns.delete(userId), 5000);

    if (!["truth", "dare", "random"].includes(btn.customId)) return;
    await btn.deferUpdate();

    // Random rating for each question
    const ratings = ["pg", "pg13", "r"];
    const rating = ratings[Math.floor(Math.random() * ratings.length)];

    let url = "";
    if (btn.customId === "truth") url = `https://api.truthordarebot.xyz/v1/truth?rating=${rating}`;
    else if (btn.customId === "dare") url = `https://api.truthordarebot.xyz/api/dare?rating=${rating}`;
    else url = Math.random() < 0.5
      ? `https://api.truthordarebot.xyz/v1/truth?rating=${rating}`
      : `https://api.truthordarebot.xyz/api/dare?rating=${rating}`;

    const res = await fetch(url);
    const data = await res.json();

    const questionEmbed = new EmbedBuilder()
      .setTitle(`🎲 ${data.type} | Rating: ${rating.toUpperCase()}`)
      .setDescription(data.question)
      .setColor("Random")
      .setTimestamp();

    // Send new embed but reuse original buttons
    await btn.channel.send({ embeds: [questionEmbed], components: [buttonRow] });
  });
}
