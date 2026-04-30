import {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  TextChannel,
} from "discord.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN!;
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`✅ Bot is online! Logged in as ${client.user?.tag}`);
});

client.on("messageCreate", async (message) => {
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
        .setDescription(gameInfo.description || "説明なし")
        .addFields(
          { name: "📅 リリース日", value: gameInfo.release_date, inline: true },
          { name: "🏷️ ジャンル", value: gameInfo.genres, inline: true },
          {
            name: "\t",
            value: "\t",
          },
          {
            name: `${isDiscount ? "📉" : "💰"} 価格${
              isDiscount ? `《セール中》` : ""
            }`,
            value: gameInfo.is_free
              ? "無料"
              : isPriceUndecide
                ? "未定"
                : `${gameInfo.final_price}円 ${
                    isDiscount
                      ? `~~${gameInfo.initial_price}円~~(**${gameInfo.discount_percent}%OFF**)`
                      : ""
                  }`,
            inline: true,
          },
          {
            name: "📊 全レビュー",
            value: `${gameInfo.all_reviews} (${gameInfo.all_reviews_count}件)`,
            inline: true,
          },
        )
        .setTimestamp()
        .setFooter({
          text: "Steamゲーム情報Bot",
        });

      message.reply({ embeds: [embed] });
    } else {
      message.reply("🚨 ゲーム情報を取得できませんでした。");
    }
  }
});

async function fetchSteamGameInfo(appId: string) {
  try {
    const apiBaseUrl = "localhost:4000"; // 外部から呼び出す場合は環境変数を設定する
    const url = `http://${apiBaseUrl}/api/steam?appid=${appId}`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("🚨 Steam APIエラー:", error);
    return null;
  }
}

client.login(DISCORD_TOKEN);

// ===============================
// 📩 メール通知専用BOT
// ===============================

import { simpleParser, ParsedMail } from "mailparser";
import { ImapFlow } from "imapflow";

const mailBot = new Client({
  intents: [GatewayIntentBits.Guilds],
});

mailBot.once("ready", () => {
  console.log(`📩 Mail Bot is online! ${mailBot.user?.tag}`);
  void startMailWatcher();
});

mailBot.login(process.env.MAIL_BOT_TOKEN!);

// ===============================
// 📩 IMAP監視処理
// ===============================

async function startMailWatcher() {
  const POLL_INTERVAL_MS = 60_000;
  const startTime = new Date();
  const notifiedUids = new Set<number>();

  let sinceDate = new Date(startTime);
  sinceDate.setHours(0, 0, 0, 0);
  let lastResetDay = sinceDate.getTime();

  let imapClient: ImapFlow | null = null;

  const createClient = () =>
    new ImapFlow({
      host: "imap.zoho.jp",
      port: 993,
      secure: true,
      auth: {
        user: process.env.ZOHO_USER!,
        pass: process.env.ZOHO_PASS!,
      },
      logger: false,
    });

  const ensureConnected = async (): Promise<ImapFlow> => {
    if (imapClient && imapClient.usable) return imapClient;
    if (imapClient) {
      try {
        imapClient.close();
      } catch {
        /* noop */
      }
      imapClient = null;
    }
    const client = createClient();
    await client.connect();
    imapClient = client;
    console.log("📬 IMAP connected");
    return client;
  };

  while (true) {
    try {
      const client = await ensureConnected();

      // 日付が変わったら notifiedUids をリセット（メモリリーク防止）
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      if (todayStart.getTime() !== lastResetDay) {
        notifiedUids.clear();
        sinceDate = todayStart;
        lastResetDay = todayStart.getTime();
      }

      const lock = await client.getMailboxLock("INBOX");
      try {
        const uids = await client.search(
          { since: sinceDate },
          { uid: true },
        );
        const newUids = Array.isArray(uids)
          ? uids.filter((uid) => !notifiedUids.has(uid))
          : [];

        if (newUids.length > 0) {
          for await (const message of client.fetch(
            newUids,
            { envelope: true, source: true },
            { uid: true },
          )) {
            if (!message.source) continue;

            // Bot起動前に受信したメールはスキップ
            const receivedAt = message.envelope?.date;
            if (!receivedAt || receivedAt < startTime) {
              notifiedUids.add(message.uid);
              continue;
            }

            try {
              const parsed = (await simpleParser(
                message.source,
              )) as ParsedMail;
              const toText = Array.isArray(parsed.to)
                ? parsed.to.map((a) => a.text).join(",")
                : (parsed.to?.text ?? "");

              notifiedUids.add(message.uid);

              if (!toText.includes("dev@mcg-dev.jp")) continue;

              const channel = await mailBot.channels
                .fetch(process.env.DISCORD_CHANNEL_ID!)
                .catch(() => null);
              if (!channel || !channel.isTextBased()) continue;

              const bodyOver1000 = (parsed.text?.length ?? 0) > 1000;
              const embed = new EmbedBuilder()
                .setColor(0x00ff7f)
                .setTitle("📩 メールが届いています")
                .setDescription(
                  bodyOver1000
                    ? "dev@mcg-dev.jp宛のメールが届いています。\n※ 本文が1000文字を超えています。メールをご確認ください。"
                    : "dev@mcg-dev.jp宛のメールが届いています。",
                )
                .addFields({
                  name: "件名",
                  value: parsed.subject || "(件名なし)",
                  inline: false,
                })
                .addFields({
                  name: "From",
                  value: parsed.from?.text || "不明",
                  inline: false,
                })
                .addFields({
                  name: "本文",
                  value: parsed.text
                    ? parsed.text.slice(0, 1000)
                    : "（本文なし）",
                  inline: false,
                })
                .setTimestamp()
                .setFooter({
                  text: "白ヤギさん",
                });

              await (channel as unknown as TextChannel).send({
                embeds: [embed],
              });
              // console.log(`📩 通知送信: "${parsed.subject}"`);
            } catch (msgErr) {
              console.error(
                "⚠️ メッセージ処理エラー:",
                (msgErr as Error).message,
              );
            }
          }
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      console.error("📩 ポーリングエラー:", (err as Error).message);
      // 次回ループで再接続させる
      if (imapClient) {
        try {
          imapClient.close();
        } catch {
          /* noop */
        }
        imapClient = null;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
