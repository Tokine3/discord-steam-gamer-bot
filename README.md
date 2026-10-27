# discord-steam-gamer-bot

Discord に投稿された Steam ストアの URL を検知して、ゲーム情報を Embed で返信する Bot。
同じプロセスで、Zoho メールの新着を Discord チャンネルへ通知するメール Bot も動いている。

## 構成

pm2 で 2 プロセスを動かす(`ecosystem.config.js`)。

| pm2 名 | コマンド | 内容 |
|---|---|---|
| `discord-bot` | `pnpm start:bot`(`tsx src/bot.ts`) | Steam URL 検知 Bot とメール通知 Bot |
| `next-api` | `pnpm start:api`(`next start -p 4000`) | ゲーム情報 API `GET /api/steam?appid=<AppID>` |

`discord-bot` は `http://localhost:4000/api/steam` を呼ぶため、`next-api` も同じ VM で動いている必要がある。

使っている外部 API:

- ゲーム情報: `store.steampowered.com/api/appdetails`
- レビュー: `api.steampowered.com/IUserReviewsService/GetAppReviews/v1/`(キー不要)
  - 旧 `store.steampowered.com/appreviews` は 2026-10-22 に廃止された
  - レビューを取れないときは「不明」と表示する

## 環境変数

プロジェクト直下に `.env` を置く。`.gitignore` の対象なので、`git pull` では VM に届かない。

| 変数 | 用途 |
|---|---|
| `DISCORD_TOKEN` | Steam Bot のトークン |
| `MAIL_BOT_TOKEN` | メール通知 Bot のトークン |
| `DISCORD_CHANNEL_ID` | メール通知を送るチャンネル ID |
| `ZOHO_USER` / `ZOHO_PASS` | Zoho IMAP のログイン情報 |
| `STEAM_API_KEY` | 現在は未使用 |

## ローカル開発

```bash
pnpm install
pnpm dev          # API を http://localhost:4000 で起動
pnpm start:bot    # 別ターミナルで Bot を起動
```

## GCP VM での運用

VM 上のプロジェクトのパスは `~/discord-steam-gamer-bot`。

### VM に入る(ローカルから)

```bash
gcloud compute instances list                                   # インスタンス名・ゾーン・状態を確認
gcloud compute instances start <INSTANCE_NAME> --zone <ZONE>    # 停止中(TERMINATED)なら起動
gcloud compute ssh <INSTANCE_NAME> --zone <ZONE>
```

### 状態確認

```bash
pm2 list                            # online か、再起動回数(↺)、メモリ
pm2 show discord-bot                # 詳細(起動時刻、ログファイルのパス)
pm2 logs                            # 全プロセスのログを流し続ける(Ctrl+C で抜ける)
pm2 logs discord-bot --lines 200    # 直近 200 行から表示
pm2 logs next-api --err --lines 50  # エラーログだけ表示
pm2 monit                           # CPU・メモリをリアルタイム表示

curl -i 'http://localhost:4000/api/steam?appid=730'   # API の疎通確認
```

`↺` が増え続けているときは、クラッシュループを疑ってエラーログを見る。

### 起動・再起動・停止

```bash
cd ~/discord-steam-gamer-bot

pm2 start ecosystem.config.js       # 初回起動(pm2 list に何も出ないとき)
pm2 restart ecosystem.config.js     # 両方まとめて再起動
pm2 restart discord-bot             # Bot だけ再起動
pm2 stop ecosystem.config.js        # 停止
pm2 delete ecosystem.config.js      # pm2 の管理から外す
```

### 変更を VM に反映する

ローカルでコミットして push したあと、VM で次を実行する。

```bash
cd ~/discord-steam-gamer-bot
git pull
pnpm install                        # 依存が変わったとき
pnpm build                          # next-api は .next のビルド成果物を使うため、API を変えたら必須
pm2 restart ecosystem.config.js
pm2 logs --lines 50                 # 起動ログを確認し、Discord に Steam の URL を投稿して動作確認
```

`.env` を変えたときも `pm2 restart` が必要。

### VM 再起動後の自動起動

一度だけ設定する。

```bash
pm2 startup     # 表示された sudo コマンドをそのまま実行する
pm2 save        # 現在のプロセス一覧を保存する
```

プロセスの構成を変えたら、もう一度 `pm2 save` を実行する。
