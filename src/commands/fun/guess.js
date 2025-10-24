const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const { Akinator, AkinatorAnswer } = require("@aqul/akinator-api");
const AkiSession = require("@schemas/AkiSession"); // Mongo schema { userId, channelId }

module.exports = {
  name: "aki",
  description: "Play a game of Akinator!",
  category: "FUN",
  cooldown: 15,
  botPermissions: ["SendMessages", "EmbedLinks"],

  run: async (client, message) => {
    const user = message.author;

    // check if user already has active game
    const existing = await AkiSession.findOne({ userId: user.id });
    if (existing) {
      return message.reply(
        `You already have an ongoing game in <#${existing.channelId}>.\nPlease finish or end it before starting a new one.`
      );
    }

    // start new game
    const aki = new Akinator({ region: "en", childMode: false });

    try {
      await aki.start();
    } catch (err) {
      console.error("Akinator start failed:", err);
      return message.reply("⚠️ Failed to start Akinator. Try again later.");
    }

    await AkiSession.create({ userId: user.id, channelId: message.channel.id });

    let isGameOver = false;

    const row = () =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("0").setLabel("Yes").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("1").setLabel("No").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("2").setLabel("Don't know").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("3").setLabel("Probably").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("4").setLabel("Probably not").setStyle(ButtonStyle.Primary),
      );

    const msg = await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🤔 Akinator Game")
          .setDescription(`**Q:** ${aki.question}`)
          .setColor("Blurple")
          .setFooter({ text: `Progress: ${aki.progress.toFixed(1)}%` }),
      ],
      components: [row()],
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000, // 2 minutes
      idle: 60000,
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== user.id) {
        return i.reply({ content: "This isn't your game!", ephemeral: true });
      }

      await i.deferUpdate().catch(() => {});

      try {
        await aki.answer(Number(i.customId));

        if (aki.isWin) {
          const embed = new EmbedBuilder()
            .setTitle("🎯 Is this your character?")
            .setDescription(
              `**${aki.sugestion_name}**\n${aki.sugestion_desc || "No description."}`
            )
            .setImage(aki.sugestion_photo)
            .setColor("Gold");

          const rowFinal = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("final_yes").setLabel("Yes").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("final_no").setLabel("No").setStyle(ButtonStyle.Danger)
          );

          await msg.edit({ embeds: [embed], components: [rowFinal] });
        } else {
          await msg.edit({
            embeds: [
              new EmbedBuilder()
                .setTitle("🤔 Akinator Game")
                .setDescription(`**Q:** ${aki.question}`)
                .setColor("Blurple")
                .setFooter({ text: `Progress: ${aki.progress.toFixed(1)}%` }),
            ],
            components: [row()],
          });
        }
      } catch (err) {
        console.error("Akinator error:", err.message);
        await msg.edit({
          content: "⚠️ Akinator couldn’t continue. Please start a new game.",
          components: [],
        });
        collector.stop("error");
      }
    });

    collector.on("end", async (_, reason) => {
      if (!isGameOver && reason !== "error") {
        await msg.edit({ content: "Game timed out.", components: [] }).catch(() => {});
      }
      await AkiSession.deleteOne({ userId: user.id }).catch(() => {});
    });

    // handle final decision
    client.on("interactionCreate", async (final) => {
      if (!final.isButton()) return;
      if (!["final_yes", "final_no"].includes(final.customId)) return;
      if (final.user.id !== user.id) return;

      await final.deferUpdate().catch(() => {});

      if (final.customId === "final_yes") {
        const end = new EmbedBuilder()
          .setTitle("🎉 Akinator Wins!")
          .setDescription("I guessed your character correctly!")
          .setColor("Green")
          .setTimestamp();

        await msg.edit({ embeds: [end], components: [] }).catch(() => {});
        isGameOver = true;
        await AkiSession.deleteOne({ userId: user.id }).catch(() => {});
      } else if (final.customId === "final_no") {
        try {
          await aki.cancelAnswer(); // go back one step
          await msg.edit({
            embeds: [
              new EmbedBuilder()
                .setTitle("🤔 Akinator Game")
                .setDescription(`**Q:** ${aki.question}`)
                .setColor("Blurple")
                .setFooter({ text: `Progress: ${aki.progress.toFixed(1)}%` }),
            ],
            components: [row()],
          });
        } catch (err) {
          console.error("cancelAnswer() failed:", err.message);
          await msg.edit({
            content: "⚠️ Akinator couldn’t continue. Please start a new game.",
            components: [],
          });
          await AkiSession.deleteOne({ userId: user.id }).catch(() => {});
        }
      }
    });
  },
};
