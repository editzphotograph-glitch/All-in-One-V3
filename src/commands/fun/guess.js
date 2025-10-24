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
    await interaction.deferReply().catch(() => {});
    await startCategorySelection(interaction.channel, interaction.user);
  },
};

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

  // Save user session (prevents parallel games)
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
    // Display current question
    try {
      await msg.edit({
        embeds: [getQuestionEmbed(aki.question, aki.currentStep + 1, aki.questionImage)],
        components: [createAnswerButtons()],
        content: "",
      });
    } catch {
      // safe to ignore transient race errors on edits
    }

    const interaction = await msg
      .awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === user.id,
        time: 5 * 60_000,
      })
      .catch(() => null);

    if (!interaction) {
      await msg.edit({ content: "⏳ Game timed out.", components: [] }).catch(() => {});
      await AkiSession.deleteOne({ userId: user.id }).catch(() => {});
      break;
    }

    // immediately ack the button, preventing "Interaction failed"
    await interaction.deferUpdate().catch(() => {});

    // forward the answer to the Akinator API
    try {
      await aki.answer(parseInt(interaction.customId, 10));
    } catch (err) {
      console.error("Akinator answer error:", err?.message || err);
      await msg.edit({
        content: "⚠️ Akinator failed to process your answer. The game ended.",
        components: [],
      }).catch(() => {});
      await AkiSession.deleteOne({ userId: user.id }).catch(() => {});
      break;
    }

    // if Akinator reached a guess
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
      }).catch(() => {});

      const final = await msg
        .awaitMessageComponent({
          componentType: ComponentType.Button,
          filter: (i) => i.user.id === user.id,
          time: 60_000,
        })
        .catch(() => null);

      if (!final) {
        await msg.edit({ content: "⏳ Game ended due to no response.", components: [] }).catch(() => {});
        await AkiSession.deleteOne({ userId: user.id }).catch(() => {});
        break;
      }

      // defer immediately to avoid "interaction failed"
      await final.deferUpdate().catch(() => {});

      if (final.customId === "final_yes") {
        // user confirmed, save or update session stats if you want
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
              new ButtonBuilder().setCustomId("restart_aki").setLabel("Restart Game").setStyle(ButtonStyle.Primary)
            ),
          ],
        }).catch(() => {});

        await AkiSession.deleteOne({ userId: user.id }).catch(() => {});

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
        // user said guess was wrong. Cancel last answer, then explicitly update the question and continue loop.
        try {
          await aki.cancelAnswer(); // undo last step
        } catch (err) {
          console.error("cancelAnswer() failed:", err?.message || err);
          await msg.edit({
            content: "⚠️ Akinator couldn’t continue. Please start a new game.",
            components: [],
          }).catch(() => {});
          await AkiSession.deleteOne({ userId: user.id }).catch(() => {});
          break;
        }

        // tiny delay to let the SDK update internal state reliably
        await new Promise((r) => setTimeout(r, 150));

        // Immediately update the message with the new/current question and answer buttons,
        // so user sees the next question instead of the "Is this correct?" embed again.
        try {
          await msg.edit({
            embeds: [getQuestionEmbed(aki.question, aki.currentStep + 1, aki.questionImage)],
            components: [createAnswerButtons()],
            content: "",
          });
        } catch {
          // ignore transient edit errors
        }

        // continue the while loop to await the user's next answer
        continue;
      }
    }
  }
}
