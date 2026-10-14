import "server-only";

import { tiktokDeepProvider } from "@/services/intel/providers/tiktok";
import {
  websiteDeepProvider,
  landingPageProvider,
} from "@/services/intel/providers/website";
import { appStoreDeepProvider } from "@/services/intel/providers/app-store";
import { playStoreDeepProvider } from "@/services/intel/providers/play-store";
import { metaAdsDeepProvider } from "@/services/intel/providers/meta-ad-library";
import type { DeepProvider } from "@/services/intel/providers/types";

/** Register new providers here — engine picks them up automatically. */
export const DEEP_PROVIDER_REGISTRY: DeepProvider[] = [
  tiktokDeepProvider,
  websiteDeepProvider,
  landingPageProvider,
  appStoreDeepProvider,
  playStoreDeepProvider,
  metaAdsDeepProvider,
];

export function providersFor(
  target: Parameters<DeepProvider["supports"]>[0],
): DeepProvider[] {
  return DEEP_PROVIDER_REGISTRY.filter((p) => p.supports(target));
}

// Back-compat aliases used by older imports
export { tiktokDeepProvider as tiktokProvider };
export { websiteDeepProvider as websiteProvider };
export { appStoreDeepProvider as appStoreProvider };
export { playStoreDeepProvider as playStoreProvider };
export { metaAdsDeepProvider as metaAdLibraryProvider };
