const { ApplicationCommandOptionType, PermissionsBitField } = require("discord.js");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "say",
  description: "Send a message through the bot",
  category: "ADMIN",
  userPermissions: ["ManageGuild"], // only admins can use
  botPermissions: ["SendMessages", "EmbedLinks"],

  command: {
    enabled: true,
    usage: "<message>",
    minArgsCount: 1,
  },

  slashCommand: {
    enabled: true,
    ephemeral: true,
    options: [
      {
        name: "message",
        description: "The message you want the bot to say",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },

  async messageRun(message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return message.safeReply({ content: `❌ You don't have permission to use this command.`, ephemeral: true });
    }

    const text = args.join(" ");
    if (!text) return message.safeReply({ content: `❌ Please provide a message to send.`, ephemeral: true });

    const sentMessage = await message.channel.send(text);
    await message.safeReply({ content: `✅ Message sent successfully! [Jump to message](${sentMessage.url})`, ephemeral: true });
  },

  async interactionRun(interaction) {
    const member = interaction.guild.members.cache.get(interaction.user.id);
    if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.editReply("❌ You don't have permission to use this command.");
    }

    const text = interaction.options.getString("message");
    if (!text) return interaction.editReply("❌ Please provide a message to send.");

    const sentMessage = await interaction.channel.send(text);
    await interaction.editReply(`✅ Message sent successfully! [Jump to message](${sentMessage.url})`);
  },
};
