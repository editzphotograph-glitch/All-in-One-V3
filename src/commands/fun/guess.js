const { Blob, File } = require("node:buffer");
globalThis.File = File;
globalThis.Blob = Blob;

const { Akinator } = require("@aqul/akinator-api");
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
  name: "guess",
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

// Category selection
async function startCategorySelection(channel, user) {
  const activeSession = await AkiSession.findOne({ userId: user.id });
  if (activeSession && activeSession.lastMessageId) {
    const existingMsg = await channel.messages
      .fetch(activeSession.lastMessageId)
      .catch(() => null);

    if (existingMsg) {
      const alreadyPlaying = new EmbedBuilder()
        .setTitle("🧞 Game Already Running")
        .setDescription(
          `You already have an ongoing game in <#${activeSession.lastChannelId}>.\nPlease finish or end it before starting a new one.`
        )
        .setColor("Red");

      return channel.send({ embeds: [alreadyPlaying] });
    }
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId("akinator_category")
    .setPlaceholder("Select a category to start!")
    .addOptions([
      { label: "People", value: "en", emoji: "👤" },
      { label: "Animals", value: "en_animals", emoji: "🐾" },
      { label: "Objects", value: "en_objects", emoji: "🎩" },
    ]);

  const row = new ActionRowBuilder().addComponents(select);

  const embed = new EmbedBuilder()
    .setTitle("🧞 Play Guess")
    .setDescription("Select a category below to begin.")
    .setColor("Blurple");

  const msg = await channel.send({ embeds: [embed], components: [row] });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 30_000,
    filter: (i) => i.user.id === user.id,
    max: 1,
  });

  collector.on("collect", async (i) => {
    await i.deferUpdate();
    const region = i.values[0];
    await startAkinatorGame(msg, user, region);
  });
}

// Main game loop
async function startAkinatorGame(msg, user, region) {
  const aki = new Akinator({ region, childMode: false });
  await aki.start();

  await AkiSession.findOneAndUpdate(
    { userId: user.id },
    {
      userId: user.id,
      username: user.username,
      category: region,
      lastChannelId: msg.channel.id,
      lastMessageId: msg.id,
      lastGuessed: new Date(),
    },
    { upsert: true }
  );

  const createAnswerButtons = () =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("0").setLabel("Yes").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("1").setLabel("No").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("2").setLabel("Don't Know").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("3").setLabel("Probably").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("4").setLabel("Probably Not").setStyle(ButtonStyle.Primary)
    );

  const getQuestionEmbed = (question, step, img) =>
    new EmbedBuilder()
      .setTitle(`🧞 Guess Game - Step ${step}`)
      .setDescription(question)
      .setColor("Gold")
      .setImage(img || null)
      .setFooter({ text: "Mutta Puffs" });

  let isGameOver = false;

  while (!isGameOver) {
    // Show current question
    await msg.edit({
      embeds: [getQuestionEmbed(aki.question, aki.currentStep + 1, aki.suggestionPhoto)],
      components: [createAnswerButtons()],
      content: "",
    });

    const interaction = await msg.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === user.id,
      time: 5 * 60_000,
    }).catch(() => null);

    if (!interaction) {
      await msg.edit({ content: "Game timed out.", components: [] });
      break;
    }

    await interaction.deferUpdate();
    await aki.answer(parseInt(interaction.customId));

    if (aki.isWin) {
      const guessName = aki.sugestion_name;
      const guessDesc = aki.sugestion_desc;
      const guessImg = aki.sugestion_photo;

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("final_yes").setLabel("Yes").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("final_no").setLabel("No").setStyle(ButtonStyle.Danger)
      );

      await msg.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle("🧞 Is this correct?")
            .setDescription(`**${guessName}**\n${guessDesc || ""}`)
            .setImage(guessImg)
            .setColor("Orange")
            .setFooter({ text: "Mutta Puffs" }),
        ],
        components: [confirmRow],
      });

      const final = await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === user.id,
        time: 60_000,
      }).catch(() => null);

      if (!final) {
        await msg.edit({ content: "Game ended due to no response.", components: [] });
        break;
      }

      await final.deferUpdate();

      if (final.customId === "final_yes") {
        let session = await AkiSession.findOne({ userId: user.id, resultName: guessName });
        if (!session) {
          session = await AkiSession.create({
            userId: user.id,
            username: user.username,
            category: region,
            resultName: guessName,
            description: guessDesc,
            image: guessImg,
            timesGuessed: 1,
            lastGuessed: new Date(),
            lastChannelId: msg.channel.id,
            lastMessageId: msg.id,
          });
        } else {
          session.timesGuessed += 1;
          session.lastGuessed = new Date();
          session.lastChannelId = msg.channel.id;
          session.lastMessageId = msg.id;
          await session.save();
        }

        await msg.edit({
          embeds: [
            new EmbedBuilder()
              .setTitle("🧞 Guessed Right!")
              .setDescription(
                `**${guessName}**\n${guessDesc || ""}\n**Times Guessed:** ${session.timesGuessed}\n**Last Guessed:** <t:${Math.floor(
                  session.lastGuessed.getTime() / 1000
                )}:R>`
              )
              .setColor("Green")
              .setImage(guessImg)
              .setFooter({ text: "Mutta Puffs" }),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId("restart_aki").setLabel("Restart Game").setStyle(ButtonStyle.Primary)
            ),
          ],
        });

        // Listen for restart button
        const restart = await msg.awaitMessageComponent({
          componentType: ComponentType.Button,
          filter: (i) => i.user.id === user.id && i.customId === "restart_aki",
          time: 5 * 60_000,
        }).catch(() => null);

        if (restart) {
          await restart.deferUpdate();
          await startCategorySelection(msg.channel, user); // restart new game
        }

        isGameOver = true;
      } else {
        // User said No → continue game
        continue; // will fetch next question automatically
      }
    }
  }
}
