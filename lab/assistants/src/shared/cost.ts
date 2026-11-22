import type { ModelUsage } from './model.js';

/** USD per one million tokens. */
export interface ModelPricing {
  readonly cacheHitPerMillionUsd: number;
  readonly cacheMissPerMillionUsd: number;
  readonly outputPerMillionUsd: number;
}

/**
 * DeepSeek's published off-peak price for `deepseek-flash`, read on 2026-11-20
 * (spec section 7.3 and issue #102). Peak windows cost twice as much.
 */
export const DEEPSEEK_FLASH_PRICING: ModelPricing = {
  cacheHitPerMillionUsd: 0.003,
  cacheMissPerMillionUsd: 0.15,
  outputPerMillionUsd: 0.6,
};

/**
 * DeepSeek doubles its price from 01:00-04:00 and 06:00-10:00 UTC, Monday to
 * Friday. That is 08:00-11:00 and 13:00-17:00 in Vietnam.
 */
export function isPeakTime(now: Date): boolean {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hour = now.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

/**
 * The money one conversation turn costs. The result is rounded to six places,
 * the precision the gateway stores and the reports print.
 */
export function turnCostUsd(
  usage: ModelUsage,
  now: Date = new Date(),
  pricing: ModelPricing = DEEPSEEK_FLASH_PRICING,
): number {
  const peakMultiplier = isPeakTime(now) ? 2 : 1;
  const usd =
    (usage.cacheHitTokens * pricing.cacheHitPerMillionUsd +
      usage.cacheMissTokens * pricing.cacheMissPerMillionUsd +
      usage.outputTokens * pricing.outputPerMillionUsd) /
    1_000_000;
  return Math.round(usd * peakMultiplier * 1_000_000) / 1_000_000;
}
