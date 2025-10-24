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

async function startAkinatorGame(msg, user, region) {
  const aki = new Akinator({ region, childMode: false });
  try {
    await aki.start();
  } catch (err) {
    console.error("Akinator start error:", err.message);
    return msg.edit({ content: "❌ Failed to start Akinator. Please try again later.", components: [] });
  }

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
    try {
      await msg.edit({
        embeds: [getQuestionEmbed(aki.question, aki.currentStep + 1, aki.questionImage)],
        components: [createAnswerButtons()],
        content: "",
      });
    } catch {
      // ignore harmless edit race
    }

    const interaction = await msg
      .awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === user.id,
        time: 5 * 60_000,
      })
      .catch(() => null);

    if (!interaction) {
      await msg.edit({ content: "Game timed out.", components: [] });
      await AkiSession.deleteOne({ userId: user.id });
      break;
    }

    await interaction.deferUpdate();

    try {
      await aki.answer(parseInt(interaction.customId));
    } catch (err) {
      console.error("Akinator answer error:", err.message);
      await msg.edit({
        content: "⚠️ Akinator failed to process your answer. The game ended unexpectedly.",
        components: [],
      });
      await AkiSession.deleteOne({ userId: user.id });
      break;
    }

    // If Akinator thinks it has a guess
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
        await msg.edit({ content: "Game ended due to no response.", components: [] });
        await AkiSession.deleteOne({ userId: user.id });
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

        await AkiSession.deleteOne({ userId: user.id });

        const restart = await msg
          .awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === user.id && i.customId === "restart_aki",
            time: 5 * 60_000,
          })
          .catch(() => null);

        if (restart) {
          await restart.deferUpdate();
          await startCategorySelection(msg.channel, user);
        }

        isGameOver = true;
        await AkiSession.deleteOne({ userId: user.id });
      } else if (final.customId === "final_no") {
        try {
          await aki.back();
        } catch (err) {
          console.error("Akinator back error:", err.message);
          await msg.edit({
            content: "⚠️ Akinator couldn’t continue. Please start a new game.",
            components: [],
          });
          await AkiSession.deleteOne({ userId: user.id });
          break;
        }
        continue;
      }
    }
  }
}
