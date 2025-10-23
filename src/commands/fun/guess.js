const { Aki } = require("aki-api");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
} = require("discord.js");
const AkinatorSession = require("../../src/database/schemas/akinatorSession");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "guess",
  description: "Play a game of Akinator with category selection",
  category: "FUN",
  cooldown: 10,

  command: {
    enabled: true,
  },
  slashCommand: {
    enabled: true,
  },

  async messageRun(message) {
    await startCategorySelection(message.channel, message.author);
  },

  async interactionRun(interaction) {
    await startCategorySelection(interaction.channel, interaction.user);
  },
};

async function startCategorySelection(channel, user) {
  const categoryMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("aki-category")
      .setPlaceholder("Select a category to start Akinator")
      .addOptions([
        {
          label: "People",
          description: "Characters, celebrities, or people",
          value: "en",
          emoji: "🧍",
        },
        {
          label: "Animals",
          description: "Guess animal-related characters",
          value: "en_animals",
          emoji: "🐾",
        },
        {
          label: "Objects",
          description: "Guess objects, items, or tools",
          value: "en_objects",
          emoji: "📦",
        },
      ])
  );

  const embed = new EmbedBuilder()
    .setTitle("🧞 Akinator")
    .setDescription("Choose a category to begin the game.")
    .setColor("Random");

  const msg = await channel.send({ embeds: [embed], components: [categoryMenu] });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 60_000,
    filter: (i) => i.user.id === user.id,
  });

  collector.on("collect", async (interaction) => {
    const category = interaction.values[0];
    await interaction.deferUpdate();
    collector.stop();
    await startAkinatorGame(channel, user, category);
    if (msg.deletable) await msg.delete().catch(() => {});
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
      await msg.edit({ content: "⏳ No category selected. Game canceled.", components: [] });
    }
  });
}

async function startAkinatorGame(channel, user, region) {
  const aki = new Aki({ region });
  await aki.start();

  // Save session start
  const session = new AkinatorSession({
    userId: user.id,
    category: region,
  });
  await session.save();

  let questionEmbed = new EmbedBuilder()
    .setTitle("🤔 Akinator Game")
    .setDescription(aki.question)
    .setColor("Random")
    .setFooter({ text: `Question 1` });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("0").setLabel("Yes").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("1").setLabel("No").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("2").setLabel("Don't Know").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("3").setLabel("Probably").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("4").setLabel("Probably Not").setStyle(ButtonStyle.Primary)
  );

  const msg = await channel.send({ embeds: [questionEmbed], components: [buttons] });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 5 * 60 * 1000,
    filter: (i) => i.user.id === user.id,
  });

  collector.on("collect", async (interaction) => {
    await interaction.deferUpdate();
    const choice = parseInt(interaction.customId);

    await aki.step(choice);

    // If confident enough to make a guess
    if (aki.progress >= 70 || aki.currentStep >= 78) {
      await aki.win();
      const guess = aki.answers[0];

      const guessEmbed = new EmbedBuilder()
        .setTitle("🧞 Akinator’s Guess")
        .setDescription(
          `I think it’s **${guess.name}**!\n\n${guess.description || "_No description_"}`
        )
        .setThumbnail(guess.absolute_picture_path)
        .setImage(guess.absolute_picture_path)
        .setColor("Gold")
        .setFooter({ text: `Confidence: ${guess.proba * 100}%` });

      // Update session in Mongo
      session.result = {
        name: guess.name,
        description: guess.description,
        image: guess.absolute_picture_path,
        probability: guess.proba,
      };
      session.finishedAt = new Date();
      await session.save();

      await msg.edit({ embeds: [guessEmbed], components: [] });
      collector.stop();
      return;
    }

    // Continue with next question
    questionEmbed = new EmbedBuilder()
      .setTitle("🤔 Akinator Game")
      .setDescription(aki.question)
      .setColor("Random")
      .setFooter({ text: `Question ${aki.currentStep + 1}` });

    await msg.edit({ embeds: [questionEmbed], components: [buttons] });
  });

  collector.on("end", async () => {
    if (msg.editable)
      await msg.edit({
        content: "⏳ Game ended due to inactivity.",
        embeds: [],
        components: [],
      });
  });
}
