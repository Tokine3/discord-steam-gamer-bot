import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();
// const STEAM_API_KEY = process.env.STEAM_API_KEY!;

// 英語のレビュー評価を日本語に変換するマッピング
const reviewTranslations: { [key: string]: string } = {
  'Overwhelmingly Positive': '圧倒的に好評',
  'Very Positive': '非常に好評',
  Positive: '好評',
  'Mostly Positive': 'やや好評',
  Mixed: '賛否両論',
  'Mostly Negative': 'やや不評',
  Negative: '不評',
  'Very Negative': '非常に不評',
  'Overwhelmingly Negative': '圧倒的に不評',
  'No user reviews': 'レビューなし',
};

export async function GET(req: NextRequest) {
  const appid = req.nextUrl.searchParams.get('appid');

  if (!appid) {
    return NextResponse.json({ error: 'AppIDが必要です' }, { status: 400 });
  }

  try {
    // Steamストアのゲーム情報を取得
    const gameUrl = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=JP&l=japanese`;
    const gameResponse = await axios.get(gameUrl);
    const gameData = gameResponse.data[appid]?.data;

    console.log(gameData);

    if (!gameData) {
      return NextResponse.json(
        { error: 'ゲーム情報が見つかりません' },
        { status: 404 }
      );
    }

    // Steamのレビュー情報を取得
    const reviewUrl = `https://store.steampowered.com/appreviews/${appid}?json=1&start_offset=0&language=all&purchase_type=all&filter=all`;
    const reviewResponse = await axios.get(reviewUrl);
    const reviewData = reviewResponse.data;

    // 取得した英語のレビュー評価を日本語に変換
    const allReviewEng: string =
      reviewData.query_summary.review_score_desc || 'No user reviews';

    const isExistPriceOverview: boolean = !!gameData.price_overview;

    return NextResponse.json({
      name: gameData.name,
      release_date: gameData.release_date.date || '不明',
      genres: gameData.genres
        .map((g: { id: string; description: string }) => g.description)
        .join(', '),
      is_free: gameData.is_free,
      initial_price: isExistPriceOverview
        ? gameData.price_overview.initial / 100
        : 0,
      final_price: isExistPriceOverview
        ? gameData.price_overview.final / 100
        : 0,
      discount_percent: isExistPriceOverview
        ? gameData.price_overview.discount_percent
        : 0,
      url: `https://store.steampowered.com/app/${appid}`,
      description: gameData.short_description,
      all_reviews: reviewTranslations[allReviewEng] || '不明',
      all_reviews_count: reviewData.query_summary.total_reviews || 0,
      thumbnail: gameData.header_image,
    });
  } catch (error) {
    console.error('🚨 Steam APIエラー:', error);
    return NextResponse.json(
      { error: 'データ取得に失敗しました' },
      { status: 500 }
    );
  }
}
