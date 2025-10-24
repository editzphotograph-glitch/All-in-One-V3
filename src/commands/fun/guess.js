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
  description: "Play a game of Akinator with category selection",
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

// Start category selection menu
async function startCategorySelection(channel, user) {
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
    .setDescription("Select a category below to begin the game.")
    .setColor("Blurple");

  const msg = await channel.send({ embeds: [embed], components: [row] });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 30_000,
    filter: (i) => i.user.id === user.id,
    max: 1,
  });

  collector.on("collect", async (i) => {
    await i.deferUpdate().catch(() => {});
    const region = i.values[0];
    await startAkinatorGame(msg, user, region);
  });
}

// Main Akinator game logic
async function startAkinatorGame(msg, user, region) {
  const aki = new Akinator({ region, childMode: false });

  try {
    await aki.start();
  } catch (err) {
    console.error("Akinator start failed:", err);
    return msg.edit({
      content: "⚠️ Failed to start Akinator. Please try again later.",
      components: [],
    });
  }

  // Save user session
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
      .setTitle(`🧞 Guess Game`)
      .setDescription(question)
      .setColor("Gold")
      .setImage(img || null)
      .setFooter({ text: "Mutta Puffs" });

  let isGameOver = false;

  while (!isGameOver) {
    // Display current question
    await msg.edit({
      embeds: [getQuestionEmbed(aki.question, aki.currentStep + 1, aki.questionImage)],
      components: [createAnswerButtons()],
      content: "",
    });

    const interaction = await msg
      .awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === user.id,
        time: 5 * 60_000,
      })
      .catch(() => null);

    if (!interaction) {
      await msg.edit({ content: "⏳ Game timed out.", components: [] });
      await AkiSession.deleteOne({ userId: user.id });
      break;
    }

    await interaction.deferUpdate().catch(() => {});

    try {
      await aki.answer(parseInt(interaction.customId));
    } catch (err) {
      console.error("Akinator answer error:", err.message);
      await msg.edit({
        content: "⚠️ Akinator failed to process your answer. Please try again later.",
        components: [],
      });
      await AkiSession.deleteOne({ userId: user.id });
      break;
    }

    // Check if Akinator made a guess
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

      const final = await msg
        .awaitMessageComponent({
          componentType: ComponentType.Button,
          filter: (i) => i.user.id === user.id,
          time: 60_000,
        })
        .catch(() => null);

      if (!final) {
        await msg.edit({ content: "⏳ Game ended due to no response.", components: [] });
        await AkiSession.deleteOne({ userId: user.id });
        break;
      }

      await final.deferUpdate().catch(() => {});

      if (final.customId === "final_yes") {
        // ✅ User confirmed Akinator is correct
        await msg.edit({
          embeds: [
            new EmbedBuilder()
              .setTitle("🧞 Guessed Right!")
              .setDescription(`**${guessName}**\n${guessDesc || ""}`)
              .setColor("Green")
              .setImage(guessImg)
              .setFooter({ text: "Mutta Puffs" }),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("restart_aki")
                .setLabel("Restart Game")
                .setStyle(ButtonStyle.Primary)
            ),
          ],
        });

        await AkiSession.deleteOne({ userId: user.id });

        const restart = await msg
          .awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === user.id && i.customId === "restart_aki",
            time: 5 * 60_000,
          })
          .catch(() => null);

        if (restart) {
          await restart.deferUpdate().catch(() => {});
          await startCategorySelection(msg.channel, user);
        }

        isGameOver = true;
      } else if (final.customId === "final_no") {
        // ❌ User said Akinator was wrong — go back safely
        await final.deferUpdate().catch(() => {});
        try {
          await aki.cancelAnswer(); // Go back one step, continue questioning
          continue;
        } catch (err) {
          console.error("cancelAnswer() failed:", err.message);
          await msg.edit({
            content: "⚠️ Akinator couldn’t continue. Please start a new game.",
            components: [],
          });
          await AkiSession.deleteOne({ userId: user.id });
          break;
        }
      }
    }
  }
}
