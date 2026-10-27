import axios from "axios";

export type SteamGameInfo = {
  name: string;
  release_date: string;
  genres: string;
  is_free: boolean;
  initial_price: number;
  final_price: number;
  discount_percent: number;
  url: string;
  description: string;
  all_reviews: string;
  all_reviews_count: number;
  thumbnail: string;
};

// 英語のレビュー評価を日本語に変換するマッピング
const reviewTranslations: { [key: string]: string } = {
  "Overwhelmingly Positive": "圧倒的に好評",
  "Very Positive": "非常に好評",
  Positive: "好評",
  "Mostly Positive": "やや好評",
  Mixed: "賛否両論",
  "Mostly Negative": "やや不評",
  Negative: "不評",
  "Very Negative": "非常に不評",
  "Overwhelmingly Negative": "圧倒的に不評",
  "No user reviews": "レビューなし",
};

// ゲーム情報を取得する。見つからない・取得に失敗した場合は null を返す
export async function fetchSteamGameInfo(
  appId: string,
): Promise<SteamGameInfo | null> {
  try {
    // Steamストアのゲーム情報を取得
    const gameUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=JP&l=japanese`;
    const gameResponse = await axios.get(gameUrl);
    const gameData = gameResponse.data[appId]?.data;

    if (!gameData) {
      console.warn(`⚠️ ゲーム情報が見つかりません: AppID=${appId}`);
      return null;
    }

    const reviewSummary = await fetchReviewSummary(appId);

    // 取得した英語のレビュー評価を日本語に変換
    const allReviewEng: string | undefined = reviewSummary?.review_score_desc;

    const isExistPriceOverview: boolean = !!gameData.price_overview;

    return {
      name: gameData.name,
      release_date: gameData.release_date?.date || "不明",
      genres:
        gameData.genres
          ?.map((g: { id: string; description: string }) => g.description)
          .join(", ") || "不明",
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
      url: `https://store.steampowered.com/app/${appId}`,
      description: gameData.short_description,
      all_reviews: (allReviewEng && reviewTranslations[allReviewEng]) || "不明",
      all_reviews_count: reviewSummary?.total_reviews || 0,
      thumbnail: gameData.header_image,
    };
  } catch (error) {
    console.error("🚨 Steam APIエラー:", error);
    return null;
  }
}

// Steamのレビュー情報を取得する（失敗時は undefined を返し、呼び出し側は「不明」と表示する）
// 旧 /appreviews は 2026-10-22 に廃止されたため IUserReviewsService/GetAppReviews を使う
async function fetchReviewSummary(
  appId: string,
): Promise<{ review_score_desc?: string; total_reviews?: number } | undefined> {
  const reviewUrl =
    "https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/";
  return axios
    .get(reviewUrl, {
      params: {
        input_json: JSON.stringify({
          appid: Number(appId),
          languages: ["all"],
          purchase_type: 1, // k_EUserReviewsPurchaseType_All
          num_per_page: 1,
        }),
      },
    })
    .then((res) => res.data?.response?.query_summary)
    .catch((error) => {
      console.warn("⚠️ Steamレビュー取得失敗:", error.message);
      return undefined;
    });
}
