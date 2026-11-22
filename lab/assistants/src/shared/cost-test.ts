import assert from 'node:assert/strict';
import test from 'node:test';
import { DEEPSEEK_FLASH_PRICING, isPeakTime, turnCostUsd } from './cost.js';
import type { ModelUsage } from './model.js';

const ONE_MILLION_MISS: ModelUsage = {
  inputTokens: 1_000_000,
  outputTokens: 1_000_000,
  cacheHitTokens: 0,
  cacheMissTokens: 1_000_000,
};

test('cost: deepseek-flash prices match the public table in spec section 7.3', () => {
  assert.deepEqual(DEEPSEEK_FLASH_PRICING, {
    cacheHitPerMillionUsd: 0.003,
    cacheMissPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.6,
  });
});

test('cost: off-peak, peak and cache-hit prices come out as the price table says', () => {
  assert.equal(turnCostUsd(ONE_MILLION_MISS, new Date('2026-11-22T00:00:00Z')), 0.75);
  assert.equal(turnCostUsd(ONE_MILLION_MISS, new Date('2026-11-23T02:00:00Z')), 1.5);
  assert.equal(
    turnCostUsd(
      { inputTokens: 1_000_000, outputTokens: 0, cacheHitTokens: 1_000_000, cacheMissTokens: 0 },
      new Date('2026-11-22T00:00:00Z'),
    ),
    0.003,
  );
});

test('cost: peak windows are 01:00-04:00 and 06:00-10:00 UTC on weekdays', () => {
  const monday = (hour: number, minute = 0): Date => new Date(Date.UTC(2026, 10, 23, hour, minute));
  assert.equal(isPeakTime(monday(0, 59)), false);
  assert.equal(isPeakTime(monday(1)), true);
  assert.equal(isPeakTime(monday(3, 59)), true);
  assert.equal(isPeakTime(monday(4)), false);
  assert.equal(isPeakTime(monday(5, 59)), false);
  assert.equal(isPeakTime(monday(6)), true);
  assert.equal(isPeakTime(monday(9, 59)), true);
  assert.equal(isPeakTime(monday(10)), false);
  assert.equal(isPeakTime(new Date('2026-11-21T02:00:00Z')), false, 'Saturday is off-peak');
  assert.equal(isPeakTime(new Date('2026-11-22T02:00:00Z')), false, 'Sunday is off-peak');
});
