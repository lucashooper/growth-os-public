/** TikTok Content Sharing Guidelines — shared UX constants (client + server safe). */

export const TIKTOK_MUSIC_CONFIRMATION_URL =
  "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";

export const TIKTOK_BRANDED_CONTENT_POLICY_URL =
  "https://www.tiktok.com/legal/page/global/bc-policy/en";

export const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Public",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only you",
};

export const POSTING_BLOCKED_CODES = new Set([
  "spam_risk_too_many_posts",
  "spam_risk_user_banned_from_posting",
  "reached_active_user_cap",
]);

export const POSTING_BLOCKED_MESSAGE =
  "Your TikTok account cannot make new posts right now. Please try again later.";

export function privacyLabel(code: string): string {
  return PRIVACY_LABELS[code] || code.replace(/_/g, " ").toLowerCase();
}

export function consentDeclarationText(opts: {
  commercial: boolean;
  yourBrand: boolean;
  branded: boolean;
}): string {
  if (opts.commercial && opts.branded) {
    return "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.";
  }
  return "By posting, you agree to TikTok's Music Usage Confirmation.";
}

export function commercialLabelHint(opts: {
  yourBrand: boolean;
  branded: boolean;
}): string | null {
  if (opts.yourBrand && opts.branded) {
    return "Your photo/video will be labeled as 'Paid partnership'";
  }
  if (opts.branded) {
    return "Your photo/video will be labeled as 'Paid partnership'";
  }
  if (opts.yourBrand) {
    return "Your photo/video will be labeled as 'Promotional content'";
  }
  return null;
}

export const POST_SUCCESS_MESSAGE =
  "Your post was sent to TikTok! It may take 1–2 minutes to process and appear on your profile.";

export type ComposerCreatorInfo = {
  creator_avatar_url?: string;
  creator_username?: string;
  creator_nickname?: string;
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
  canPost?: boolean;
  postingBlockedCode?: string | null;
  postingBlockedReason?: string | null;
};
