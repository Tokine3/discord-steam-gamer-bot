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

    if (!gameData) {
      return NextResponse.json(
        { error: 'ゲーム情報が見つかりません' },
        { status: 404 }
      );
    }

    // Steamのレビュー情報を取得（失敗してもゲーム情報は返す）
    // 旧 /appreviews は 2026-10-22 に廃止されたため IUserReviewsService/GetAppReviews を使う
    const reviewUrl =
      'https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/';
    const reviewSummary = await axios
      .get(reviewUrl, {
        params: {
          input_json: JSON.stringify({
            appid: Number(appid),
            languages: ['all'],
            purchase_type: 1, // k_EUserReviewsPurchaseType_All
            num_per_page: 1,
          }),
        },
      })
      .then((res) => res.data?.response?.query_summary)
      .catch((error) => {
        console.warn('⚠️ Steamレビュー取得失敗:', error.message);
        return undefined;
      });

    // 取得した英語のレビュー評価を日本語に変換
    const allReviewEng: string | undefined = reviewSummary?.review_score_desc;

    const isExistPriceOverview: boolean = !!gameData.price_overview;

    return NextResponse.json({
      name: gameData.name,
      release_date: gameData.release_date?.date || '不明',
      genres:
        gameData.genres
          ?.map((g: { id: string; description: string }) => g.description)
          .join(', ') || '不明',
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
      all_reviews: (allReviewEng && reviewTranslations[allReviewEng]) || '不明',
      all_reviews_count: reviewSummary?.total_reviews || 0,
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
