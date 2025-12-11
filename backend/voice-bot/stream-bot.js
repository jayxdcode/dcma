// backend/voice-bot/stream-bot.js
import { Client, GatewayIntentBits } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } from '@discordjs/voice';
import fetch from 'node-fetch';

const TOKEN = process.env.BOT_TOKEN;
const BACKEND_BASE = process.env.BACKEND_BASE || 'http://localhost:8080';

if (!TOKEN) {
  console.error('BOT_TOKEN not set in env');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

client.once('ready', () => console.log(`Voice bot ready as ${client.user.tag}`));

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;
  if (interaction.commandName !== 'playtrack') return;

  const url = interaction.options.getString('url');
  if (!url) return interaction.reply({ content: 'Missing url', ephemeral: true });

  const member = interaction.member;
  const voiceChannel = member?.voice?.channel;
  if (!voiceChannel) return interaction.reply({ content: 'Join a voice channel first.', ephemeral: true });

  await interaction.deferReply();

  try {
    const conn = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator
    });

    const streamUrl = `${BACKEND_BASE}/api/stream?url=${encodeURIComponent(url)}`;
    const resp = await fetch(streamUrl);
    if (!resp.ok) return interaction.editReply('Failed to fetch stream from backend');

    const player = createAudioPlayer();
    const resource = createAudioResource(resp.body, { inlineVolume: true });
    resource.volume.setVolume(0.9);

    player.play(resource);
    conn.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => {
      try { conn.destroy(); } catch {}
    });

    await interaction.editReply('Playing via bot fallback');
  } catch (e) {
    console.error('bot stream error', e);
    await interaction.editReply('Error while trying to stream');
  }
});

client.login(TOKEN);
