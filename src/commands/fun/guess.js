const { Aki } = require("aki-api");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
} = require("discord.js");
const AkiSession = require("@schemas/AkinatorSession");

module.exports = {
  name: "akinator",
  description: "Play a game of Akinator with categories",
  category: "FUN",
  cooldown: 10,
  command: { enabled: true },
  slashCommand: { enabled: true },

  async messageRun(message) {
    await startCategorySelection(message.channel, message.author);
  },

  async interactionRun(interaction) {
    await interaction.deferReply();
    await startCategorySelection(interaction.channel, interaction.user);
  },
};

// Step 1: Category Selection
async function startCategorySelection(channel, user) {
  const select = new StringSelectMenuBuilder()
    .setCustomId("akinator_category")
    .setPlaceholder("Select a category to start!")
    .addOptions([
      { label: "People", value: Regions.en, emoji: "👤" },
      { label: "Animals", value: Regions.en_animals, emoji: "🐾" },
      { label: "Objects", value: Regions.en_objects, emoji: "🎩" },
    ]);

  const row = new ActionRowBuilder().addComponents(select);

  const embed = new EmbedBuilder()
    .setTitle("🧞 Play Akinator")
    .setDescription("Select a category below to begin.")
    .setColor("Blurple");

  const msg = await channel.send({ embeds: [embed], components: [row] });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 30_000,
    filter: (i) => i.user.id === user.id,
  });

  collector.on("collect", async (i) => {
    await i.deferUpdate();
    const region = i.values[0]; // valid Regions constant
    await startAkinatorGame(msg, user, region);
    collector.stop();
  });

  collector.on("end", async (_, reason) => {
    if (reason !== "collected")
      await msg.edit({ content: "Timed out.", embeds: [], components: [] });
  });
}

// Step 2: Akinator Game
async function startAkinatorGame(msg, user, region) {
  const aki = new Aki({ region });
  await aki.start();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("0").setLabel("Yes").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("1").setLabel("No").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("2").setLabel("Don't Know").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("3").setLabel("Probably").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("4").setLabel("Probably Not").setStyle(ButtonStyle.Primary)
  );

  let embed = new EmbedBuilder()
    .setTitle("🧞 Akinator Game")
    .setDescription(aki.question)
    .setColor("Gold")
    .setFooter({ text: `Category: ${region.replace("en_", "") || "people"} | Question 1` });

  await msg.edit({ embeds: [embed], components: [buttons], content: "" });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === user.id,
    time: 5 * 60_000,
  });

  collector.on("collect", async (interaction) => {
    await interaction.deferUpdate();
    const choice = parseInt(interaction.customId);
    await aki.step(choice);

    if (aki.progress >= 70 || aki.currentStep >= 78) {
      await aki.win();
      const guess = aki.answers[0];

      // Update session stats
      let session = await AkiSession.findOne({ userId: user.id, resultName: guess.name });
      if (!session) {
        session = await AkiSession.create({
          userId: user.id,
          username: user.username,
          category: region,
          resultName: guess.name,
          description: guess.description,
          image: guess.absolute_picture_path,
          timesGuessed: 1,
          lastGuessed: new Date(),
        });
      } else {
        session.timesGuessed += 1;
        session.lastGuessed = new Date();
        await session.save();
      }

      const restartButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("restart_akinator")
          .setLabel("Restart Game")
          .setStyle(ButtonStyle.Primary)
      );

      embed = new EmbedBuilder()
        .setTitle("🧞 Guessed Right!")
        .setDescription(
          `~~‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎\n**${guess.name}**\n${guess.description || ""}\n~~‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎\n**Times Guessed:** ${session.timesGuessed}\n**Last Guessed:** <t:${Math.floor(session.lastGuessed.getTime() / 1000)}:R>`
        )
        .setImage(guess.absolute_picture_path)
        .setColor("Green");

      await msg.edit({ embeds: [embed], components: [restartButton] });
      collector.stop();
    } else {
      embed = new EmbedBuilder()
        .setTitle("🧞 Akinator Game")
        .setDescription(aki.question)
        .setColor("Gold")
        .setFooter({ text: `Category: ${region.replace("en_", "") || "people"} | Question ${aki.currentStep + 1}` });
      await msg.edit({ embeds: [embed] });
    }
  });

  // Restart game button
  const restartCollector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === user.id,
    time: 10 * 60_000,
  });

  restartCollector.on("collect", async (i) => {
    if (i.customId === "restart_akinator") {
      await i.deferUpdate();
      await startCategorySelection(msg.channel, user);
      restartCollector.stop();
    }
  });
}
