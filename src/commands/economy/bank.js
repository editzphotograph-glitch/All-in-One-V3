const { ApplicationCommandOptionType } = require("discord.js");
const balance = require("./sub/balance");
const deposit = require("./sub/deposit");
const transfer = require("./sub/transfer");
const withdraw = require("./sub/withdraw");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  name: "mutta", // must be lowercase for slash commands
  description: "Access to bank operations",
  category: "ECONOMY",
  botPermissions: ["EmbedLinks"],

  command: {
    enabled: true,
    minArgsCount: 1,
    subcommands: [
      { trigger: "b", description: "Check your balance" },
      { trigger: "d <coins>", description: "Deposit coins to your bank account" },
      { trigger: "w <coins>", description: "Withdraw coins from your bank account" },
      { trigger: "t <user> <coins>", description: "Transfer coins to another user" },
    ],
  },

  slashCommand: {
    enabled: true,
    options: [
      {
        name: "balance",
        description: "Check your coin balance",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "user",
            description: "The user to check balance for",
            type: ApplicationCommandOptionType.User,
            required: false,
          },
        ],
      },
      {
        name: "deposit",
        description: "Deposit coins to your bank account",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "coins",
            description: "Number of coins to deposit",
            type: ApplicationCommandOptionType.Integer,
            required: true,
          },
        ],
      },
      {
        name: "withdraw",
        description: "Withdraw coins from your bank account",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "coins",
            description: "Number of coins to withdraw",
            type: ApplicationCommandOptionType.Integer,
            required: true,
          },
        ],
      },
      {
        name: "transfer",
        description: "Transfer coins to another user",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "user",
            description: "The user to transfer coins to",
            type: ApplicationCommandOptionType.User,
            required: true,
          },
          {
            name: "coins",
            description: "Number of coins to transfer",
            type: ApplicationCommandOptionType.Integer,
            required: true,
          },
        ],
      },
    ],
  },

  // Handles prefix commands like: m b, m d, etc.
  async messageRun(message, args) {
    const sub = args[0]?.toLowerCase();
    let response;

    if (sub === "b") {
      const resolved = (await message.guild.resolveMember(args[1])) || message.member;
      response = await balance(resolved.user);
    }
    else if (sub === "d") {
      const coins = parseInt(args[1]);
      if (isNaN(coins)) return message.safeReply("Provide a valid number of coins to deposit.");
      response = await deposit(message.author, coins);
    }
    else if (sub === "w") {
      const coins = parseInt(args[1]);
      if (isNaN(coins)) return message.safeReply("Provide a valid number of coins to withdraw.");
      response = await withdraw(message.author, coins);
    }
    else if (sub === "t") {
      if (args.length < 3) return message.safeReply("Provide a valid user and coins to transfer.");
      const target = await message.guild.resolveMember(args[1], true);
      if (!target) return message.safeReply("Provide a valid user to transfer coins to.");
      const coins = parseInt(args[2]);
      if (isNaN(coins)) return message.safeReply("Provide a valid number of coins to transfer.");
      response = await transfer(message.author, target.user, coins);
    }
    else {
      return message.safeReply("Invalid command usage.");
    }

    await message.safeReply(response);
  },

  // Handles slash commands: /bank balance, /bank deposit, etc.
  async interactionRun(interaction) {
    const sub = interaction.options.getSubcommand();
    let response;

    if (sub === "balance") {
      const user = interaction.options.getUser("user") || interaction.user;
      response = await balance(user);
    }
    else if (sub === "deposit") {
      const coins = interaction.options.getInteger("coins");
      response = await deposit(interaction.user, coins);
    }
    else if (sub === "withdraw") {
      const coins = interaction.options.getInteger("coins");
      response = await withdraw(interaction.user, coins);
    }
    else if (sub === "transfer") {
      const user = interaction.options.getUser("user");
      const coins = interaction.options.getInteger("coins");
      response = await transfer(interaction.user, user, coins);
    }

    await interaction.followUp(response);
  },
};
