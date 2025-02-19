import { Client, EmbedBuilder, GatewayIntentBits } from 'discord.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN!;
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`✅ Bot is online! Logged in as ${client.user?.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const steamUrlRegex = /https?:\/\/store\.steampowered\.com\/app\/(\d+)/;
  const match = message.content.match(steamUrlRegex);

  if (match) {
    const appId = match[1];
    console.log(`🎮 Steam URL detected: AppID=${appId}`);
    const gameInfo = await fetchSteamGameInfo(appId);

    const isDiscount =
      gameInfo.final_price !== 0 &&
      gameInfo.initial_price !== 0 &&
      gameInfo.discount_percent !== 0 &&
      gameInfo.final_price !== gameInfo.initial_price;

    const isPriceUndecide = !gameInfo.is_free && gameInfo.final_price === 0;

    if (gameInfo) {
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(gameInfo.name)
        .setURL(gameInfo.url)
        .setThumbnail(gameInfo.thumbnail)
        .setDescription(gameInfo.description || '説明なし')
        .addFields(
          { name: '📅 リリース日', value: gameInfo.release_date, inline: true },
          { name: '🏷️ ジャンル', value: gameInfo.genres, inline: true },
          {
            name: '\t',
            value: '\t',
          },
          {
            name: `${isDiscount ? '📉' : '💰'} 価格${
              isDiscount ? `《セール中》` : ''
            }`,
            value: gameInfo.is_free
              ? '無料'
              : isPriceUndecide
              ? '未定'
              : `${gameInfo.final_price}円 ${
                  isDiscount
                    ? `~~${gameInfo.initial_price}円~~(**${gameInfo.discount_percent}%OFF**)`
                    : ''
                }`,
            inline: true,
          },
          {
            name: '📊 全レビュー',
            value: `${gameInfo.all_reviews} (${gameInfo.all_reviews_count}件)`,
            inline: true,
          }
        )
        .setTimestamp()
        .setFooter({
          text: 'Steamゲーム情報Bot',
        });

      message.reply({ embeds: [embed] });
    } else {
      message.reply('ゲーム情報を取得できませんでした。');
    }
  }
});

async function fetchSteamGameInfo(appId: string) {
  try {
    const url = `http://localhost:4000/api/steam?appid=${appId}`;
    const response = await axios.get(url);
    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error('🚨 Steam APIエラー:', error);
    return null;
  }
}

client.login(DISCORD_TOKEN);
