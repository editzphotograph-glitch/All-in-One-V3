const { Blob, File } = require("node:buffer");
globalThis.File = File;
globalThis.Blob = Blob;

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const { Akinator } = require("@aqul/akinator-api");
const AkiSession = require("@schemas/AkiSession");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "guess",
  description: "Play Guess and try to stump him!",
  category: "FUN",
  cooldown: 10,
  botPermissions: ["SendMessages", "EmbedLinks"],

  command: {
    enabled: true,
  },
  slashCommand: {
    enabled: true,
  },

  async messageRun(message) {
    await startAkinatorGame(message, message.author);
  },

  async interactionRun(interaction) {
    await startAkinatorGame(interaction, interaction.user);
  },
};

async function startAkinatorGame(ctx, user, region = "en") {
  // prevent duplicate games
  const existing = await AkiSession.findOne({ userId: user.id });
  if (existing) {
    return ctx.reply({
      content: `You already have an ongoing game in <#${existing.channelId}>. Please finish or end it before starting a new one.`,
      ephemeral: true,
    });
  }

  const aki = new Akinator({ region, childMode: false });
  await aki.start();

  await AkiSession.create({
    userId: user.id,
    channelId: ctx.channel.id,
    region,
  });

  const embed = new EmbedBuilder()
    .setTitle("🧠 Guess Game")
    .setColor("Random")
    .setDescription(`**Q:** ${aki.question}`)
    .setFooter({ text: `Progress: ${aki.progress}%` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("0").setLabel("Yes").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("1").setLabel("No").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("2").setLabel("I don't know").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("3").setLabel("Probably").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("4").setLabel("Probably not").setStyle(ButtonStyle.Primary)
  );

  const msg = await ctx.reply({ embeds: [embed], components: [row] });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 600000,
  });

  collector.on("collect", async (i) => {
    if (i.user.id !== user.id)
      return i.reply({ content: "This game isn't for you.", ephemeral: true });

    await i.deferUpdate().catch(() => {});
    try {
      await aki.answer(Number(i.customId));

      if (aki.isWin) {
        const guessEmbed = new EmbedBuilder()
          .setTitle("🤔 Is this correct?")
          .setDescription(
            `**${aki.sugestion_name}**\n${aki.sugestion_desc}\n\nConfidence: ${aki.progress}%`
          )
          .setImage(aki.sugestion_photo)
          .setColor("Random");

        const finalRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("final_yes")
            .setLabel("Yes")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("final_no")
            .setLabel("No, start new game")
            .setStyle(ButtonStyle.Danger)
        );

        await msg.edit({ embeds: [guessEmbed], components: [finalRow] });

        const confirm = await msg
          .awaitMessageComponent({
            componentType: ComponentType.Button,
            time: 30000,
          })
          .catch(() => null);

        if (!confirm) {
          await msg.edit({
            content: "⏱️ Time's up! Game ended.",
            embeds: [],
            components: [],
          });
          await AkiSession.deleteOne({ userId: user.id });
          return;
        }

        if (confirm.customId === "final_yes") {
          await confirm.deferUpdate().catch(() => {});
          await msg.edit({
            content: `🎉 Great! Guessed it right.`,
            embeds: [],
            components: [],
          });
          await AkiSession.deleteOne({ userId: user.id });
          return;
        }

        if (confirm.customId === "final_no") {
          await confirm.deferUpdate().catch(() => {});
          await msg.edit({
            content: "🔄 Restarting game with same category...",
            embeds: [],
            components: [],
          });
          await AkiSession.deleteOne({ userId: user.id });
          return startAkinatorGame(ctx, user, region);
        }
      } else {
        const newEmbed = new EmbedBuilder()
          .setTitle("🧠 Guess Game")
          .setColor("Random")
          .setDescription(`**Q:** ${aki.question}`)
          .setFooter({ text: `Progress: ${aki.progress}%` });

        await msg.edit({ embeds: [newEmbed], components: [row] });
      }
    } catch (err) {
      console.error(err);
      await msg.edit({
        content: "⚠️ Guess failed to process your answer. The game ended.",
        embeds: [],
        components: [],
      });
      await AkiSession.deleteOne({ userId: user.id });
      collector.stop();
    }
  });

  collector.on("end", async () => {
    await AkiSession.deleteOne({ userId: user.id });
  });
}
