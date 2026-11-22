# YOYO LIVE — Coin package economics (internal simulation)

Status: **NOT APPROVED FOR REAL-MONEY SALES**. All five catalog packages remain inactive. This document is a sensitivity calculation, not a tax, legal, accounting, or payment-provider quote.

## Verified application rules

- Each active gift currently costs the same number of coins as its gross gift points (1:1 in the inspected gift catalog).
- The live gift transfer function credits 70% of gross points to the host and records 30% as platform points.
- Host points are credited to the host at 70% of gross gift points. The user has now selected a working conversion of **100,000 host points = EGP 500** (EGP 0.005 per host point). This is a product decision, not proof that payout/payment costs are fully covered.
- Package purchase requests are manual-review requests. The database only permits requests for active packages and the admin approval path credits coins after review.
- Payment processor fees, store commission, tax treatment, refunds/chargebacks, infrastructure allocation, and actual host point-to-EGP redemption value are not verified.

## Current draft package sensitivity

The current catalog drafts are:

| Package | Price (EGP) | Paid coins | Bonus coins | Total coins | EGP collected per credited coin |
|---|---:|---:|---:|---:|---:|
| Start | 50 | 5,000 | 0 | 5,000 | 0.010000 |
| Economy | 100 | 10,000 | 500 | 10,500 | 0.009524 |
| Premium | 200 | 20,000 | 2,000 | 22,000 | 0.009091 |
| Pro | 500 | 50,000 | 7,500 | 57,500 | 0.008696 |
| VIP | 1,000 | 100,000 | 20,000 | 120,000 | 0.008333 |

Assume, only for this sensitivity check, that every credited coin is spent on gifts, each gift coin creates one gross point, and 70% of gross points become host points.

The maximum host-point redemption value per point that would merely break even **before** payment fees, app-store fees, tax, refund reserve, payout fees, and operating costs is:

| Package | Break-even ceiling (EGP per host point) |
|---|---:|
| Start | 0.014286 |
| Economy | 0.013605 |
| Premium | 0.012987 |
| Pro | 0.012422 |
| VIP | 0.011905 |

A hypothetical 15% contribution-margin target, still before all unknown costs, would lower those ceilings to:

| Package | Maximum point value for 15% margin (EGP per host point) |
|---|---:|
| Start | 0.012143 |
| Economy | 0.011565 |
| Premium | 0.011039 |
| Pro | 0.010559 |
| VIP | 0.010119 |

## Selected host-point conversion (pending payout implementation)

The selected rate is **EGP 500 per 100,000 host points**, or **EGP 0.005 per host point**. The wallet displays this as an estimated value. The minimum withdrawal threshold is 100,000 earned host points (= EGP 500 at this rate).

Under the full-spend sensitivity assumptions above, host liability per spent gift coin is 70% × EGP 0.005 = **EGP 0.0035**. The resulting contribution before all unverified costs is:

| Package | Revenue per credited coin (EGP) | Host liability per spent coin (EGP) | Contribution before other costs |
|---|---:|---:|---:|
| Start | 0.010000 | 0.003500 | 65.00% |
| Economy | 0.009524 | 0.003500 | 63.25% |
| Premium | 0.009091 | 0.003500 | 61.50% |
| Pro | 0.008696 | 0.003500 | 59.75% |
| VIP | 0.008333 | 0.003500 | 58.00% |

These are gross sensitivity results only. Payment fees, app-store fees, taxes, refunds/chargebacks, payout fees, and operating costs will reduce the actual margin. Keep package sales and cash-out disabled until these costs and the server-side payout workflow are reviewed and tested.

## Formula

For package price P, total credited coins C, and host share s = 70%:

- Revenue per credited coin = P / C.
- Host liability per spent coin = s × E, where E is the approved EGP value of one host point.
- Break-even ceiling before other costs = P / (C × s).
- Ceiling for target contribution margin m before other costs = P × (1 - m) / (C × s).

The ceilings above are **not** safe approved rates. Real payment, tax, refund, payout, and infrastructure costs must be deducted, which makes the safe rate lower.

## Required next inputs before activating packages

1. Confirm the actual payment receiving method/provider and its percentage + fixed fees and settlement/reversal rules.
2. Confirm Egyptian tax/accounting treatment and whether package prices include taxes.
3. Confirm the selected EGP 500 per 100,000 host-point rate against all actual costs, and confirm that every payable point is backed by settled cash.
4. Define refund/chargeback reserves, payout fees, and the operational cost allocation.
5. Test package-level economics at full coin consumption, high-host concentration, bonus coin usage, refund spikes, and payment reversals.

Until those inputs are verified and the calculator passes each scenario, keep all package rows inactive and cash-out disabled. Do not interpret the 70/30 point split as 70/30 of cash revenue or profit.
