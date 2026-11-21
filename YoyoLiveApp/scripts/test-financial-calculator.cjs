const assert = require('node:assert/strict');
const { calculateGiftEconomics } = require('../financialCalculator');

const profitable = calculateGiftEconomics({
  packagePriceEgp: 100,
  packageCoins: 1000,
  giftCoinsSpent: 1000,
  hostRedeemablePoints: 500,
  egpPerHostPoint: 0.05,
  paymentFeePercent: 2,
  storeFeePercent: 0,
  taxPercent: 5,
  refundReservePercent: 2,
  payoutFeePercent: 1,
  paymentFixedFeeEgp: 1,
  payoutFixedFeeEgp: 0,
  allocatedOperatingCostEgp: 5,
  targetMarginPercent: 15,
});
assert.equal(profitable.status, 'PASS');
assert.ok(profitable.platformContributionEgp > 0);
assert.ok(profitable.meetsTargetMargin);

const loss = calculateGiftEconomics({
  packagePriceEgp: 100,
  packageCoins: 1000,
  giftCoinsSpent: 1000,
  hostRedeemablePoints: 5000,
  egpPerHostPoint: 0.05,
  paymentFeePercent: 2,
  taxPercent: 5,
  refundReservePercent: 2,
  allocatedOperatingCostEgp: 5,
});
assert.equal(loss.status, 'LOSS');
assert.ok(loss.platformContributionEgp < 0);

assert.throws(() => calculateGiftEconomics({
  packagePriceEgp: 10, packageCoins: 100, giftCoinsSpent: 101,
  hostRedeemablePoints: 0, egpPerHostPoint: 0,
}), /cannot exceed/);

assert.throws(() => calculateGiftEconomics({
  packagePriceEgp: 10, packageCoins: 100, giftCoinsSpent: 10,
  hostRedeemablePoints: 1, egpPerHostPoint: -1,
}), /non-negative/);

console.log('Financial calculator tests passed (4 checks).');
