/**
 * YOYO LIVE financial scenario calculator.
 *
 * Simulation only: never use client-supplied values to credit wallets or pay hosts.
 * Rates must come from verified contracts and approved accounting rules.
 */
const finiteNonNegative = (name, value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(name + ' must be a finite non-negative number');
  }
  return number;
};

const percent = (name, value) => {
  const number = finiteNonNegative(name, value);
  if (number > 100) throw new Error(name + ' must not exceed 100');
  return number / 100;
};

function calculateGiftEconomics(input) {
  const price = finiteNonNegative('packagePriceEgp', input.packagePriceEgp);
  const coins = finiteNonNegative('packageCoins', input.packageCoins);
  const spent = finiteNonNegative('giftCoinsSpent', input.giftCoinsSpent);
  const points = finiteNonNegative('hostRedeemablePoints', input.hostRedeemablePoints);
  const egpPerPoint = finiteNonNegative('egpPerHostPoint', input.egpPerHostPoint);
  const paymentRate = percent('paymentFeePercent', input.paymentFeePercent || 0);
  const storeRate = percent('storeFeePercent', input.storeFeePercent || 0);
  const taxRate = percent('taxPercent', input.taxPercent || 0);
  const reserveRate = percent('refundReservePercent', input.refundReservePercent || 0);
  const payoutRate = percent('payoutFeePercent', input.payoutFeePercent || 0);
  const paymentFixed = finiteNonNegative('paymentFixedFeeEgp', input.paymentFixedFeeEgp || 0);
  const payoutFixed = finiteNonNegative('payoutFixedFeeEgp', input.payoutFixedFeeEgp || 0);
  const operating = finiteNonNegative('allocatedOperatingCostEgp', input.allocatedOperatingCostEgp || 0);
  const targetMargin = percent('targetMarginPercent', input.targetMarginPercent || 0);

  if (price <= 0 || coins <= 0) throw new Error('Package price and coins must be greater than zero');
  if (spent > coins) throw new Error('Gift coins spent cannot exceed package coins');

  const usageRatio = spent / coins;
  const allocatedGross = price * usageRatio;
  const paymentFees = (price * paymentRate + paymentFixed) * usageRatio;
  const storeFees = price * storeRate * usageRatio;
  const taxes = price * taxRate * usageRatio;
  const refundReserve = price * reserveRate * usageRatio;
  const operatingCost = operating * usageRatio;
  const hostLiability = points * egpPerPoint;
  const payoutFees = hostLiability * payoutRate + (points > 0 ? payoutFixed : 0);
  const contribution = allocatedGross - paymentFees - storeFees - taxes
    - refundReserve - operatingCost - hostLiability - payoutFees;
  const marginPercent = allocatedGross > 0 ? (contribution / allocatedGross) * 100 : 0;
  const requiredContribution = allocatedGross * targetMargin;
  const status = contribution < 0
    ? 'LOSS'
    : contribution < requiredContribution
      ? 'BELOW_TARGET_MARGIN'
      : 'PASS';

  return Object.freeze({
    status,
    allocatedGrossEgp: allocatedGross,
    coinValueEgp: price / coins,
    usageRatio,
    paymentFeesEgp: paymentFees,
    storeFeesEgp: storeFees,
    taxesEgp: taxes,
    refundReserveEgp: refundReserve,
    operatingCostEgp: operatingCost,
    hostLiabilityEgp: hostLiability,
    payoutFeesEgp: payoutFees,
    platformContributionEgp: contribution,
    contributionMarginPercent: marginPercent,
    targetMarginPercent: targetMargin * 100,
    isProfitable: contribution > 0,
    meetsTargetMargin: contribution >= requiredContribution,
  });
}

module.exports = { calculateGiftEconomics };
