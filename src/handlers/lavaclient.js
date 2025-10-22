const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { Cluster } = require("lavaclient");
const prettyMs = require("pretty-ms");
const { load, SpotifyItemType } = require("@lavaclient/spotify");
require("@lavaclient/queue/register");

/**
 * @param {import("@structures/BotClient")} client
 */
module.exports = (client) => {
  // Load Spotify support
  load({
    client: {
      id: process.env.SPOTIFY_CLIENT_ID,
      secret: process.env.SPOTIFY_CLIENT_SECRET,
    },
    autoResolveYoutubeTracks: false,
    loaders: [
      SpotifyItemType.Album,
      SpotifyItemType.Artist,
      SpotifyItemType.Playlist,
      SpotifyItemType.Track,
    ],
  });

  const lavaclient = new Cluster({
    nodes: client.config.MUSIC.LAVALINK_NODES,
    sendGatewayPayload: (id, payload) => client.guilds.cache.get(id)?.shard?.send(payload),
  });

  // Voice updates
  client.ws.on("VOICE_SERVER_UPDATE", (data) => lavaclient.handleVoiceUpdate(data));
  client.ws.on("VOICE_STATE_UPDATE", (data) => lavaclient.handleVoiceUpdate(data));

  // Node events
  lavaclient.on("nodeConnect", (node) => client.logger.log(`Node "${node.id}" connected`));
  lavaclient.on("nodeDisconnect", (node) => client.logger.log(`Node "${node.id}" disconnected`));
  lavaclient.on("nodeError", (node, error) => client.logger.error(`Node "${node.id}" error: ${error.message}`, error));
  lavaclient.on("nodeDebug", (node, message) => client.logger.debug(`Node "${node.id}" debug: ${message}`));

  // Track start
  lavaclient.on("nodeTrackStart", (_node, queue, song) => {
    sendNowPlaying(queue, song);
  });

  // Queue finished
  lavaclient.on("nodeQueueFinish", async (_node, queue) => {
    queue.data.channel.safeSend("Queue has ended.");
    await client.musicManager.destroyPlayer(queue.player.guildId).then(() => queue.player.disconnect());
  });

  // Function to send embed with buttons
  function sendNowPlaying(queue, song) {
    const fields = [];

    const embed = new EmbedBuilder()
      .setAuthor({ name: "Now Playing" })
      .setColor(client.config.EMBED_COLORS.BOT_EMBED)
      .setDescription(`[${song.title}](${song.uri})`)
      .setFooter({ text: `Requested By: ${song.requester}` });

    if (song.sourceName === "youtube") {
      const identifier = song.identifier;
      const thumbnail = `https://img.youtube.com/vi/${identifier}/hqdefault.jpg`;
      embed.setThumbnail(thumbnail);
    }

    fields.push({
      name: "Song Duration",
      value: "`" + prettyMs(song.length, { colonNotation: true }) + "`",
      inline: true,
    });

    if (queue.tracks.length > 0) {
      fields.push({
        name: "Position in Queue",
        value: (queue.tracks.length + 1).toString(),
        inline: true,
      });
    }

    embed.setFields(fields);

    // Buttons
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("prev").setLabel("⏮️ Prev").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("play_pause").setLabel("⏯️ Play/Pause").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("next").setLabel("⏭️ Next").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("vol_down").setLabel("🔉 Vol -").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("vol_up").setLabel("🔊 Vol +").setStyle(ButtonStyle.Secondary)
    );

    queue.data.channel.safeSend({ embeds: [embed], components: [buttons] });
  }

  // Interaction handling
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const player = client.musicManager.getPlayer(interaction.guildId);
    if (!player) return interaction.reply({ content: "No music is playing.", ephemeral: true });

    switch (interaction.customId) {
      case "prev":
        if (player.queue.previousTrack) player.queue.previousTrack();
        await interaction.reply({ content: "⏮️ Playing previous track", ephemeral: true });
        break;
      case "play_pause":
        if (player.paused) player.resume();
        else player.pause(true);
        await interaction.reply({ content: player.paused ? "⏸️ Paused" : "▶️ Resumed", ephemeral: true });
        break;
      case "next":
        player.skip();
        await interaction.reply({ content: "⏭️ Skipped to next track", ephemeral: true });
        break;
      case "vol_down":
        player.setVolume(Math.max(player.volume - 10, 0));
        await interaction.reply({ content: `🔉 Volume: ${player.volume}%`, ephemeral: true });
        break;
      case "vol_up":
        player.setVolume(Math.min(player.volume + 10, 100));
        await interaction.reply({ content: `🔊 Volume: ${player.volume}%`, ephemeral: true });
        break;
    }
  });

  return lavaclient;
};
