/**
 * バランス測定の実行部。npm run report:balance から呼ばれる。
 */
import { GAME_RULES, LOCATION_RULES } from '@/config/gameConfig'
import { HAND_DEFINITIONS } from '@/config/gameConfig'
import { DETOUR_FACTOR, REPORT_SPOTS, reportSpot } from '@/tools/balanceReport'

const pad = (value: string, width: number) => {
  const length = [...value].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0)
  return value + ' '.repeat(Math.max(0, width - length))
}

console.log('街ポーカー 盤面バランス測定')
console.log(
  `候補の範囲 ${LOCATION_RULES.nearbyRadiusMeters}m / 盤面 ${20} 枚 / 手札 ${GAME_RULES.handSize} 枚 / 制限 ${GAME_RULES.durationMinutes} 分`,
)
console.log(`道のりは直線距離 × ${DETOUR_FACTOR}（信号待ちや歩く速さは含まない）`)
console.log('')
console.log(
  `${pad('出発地', 10)}${pad('候補', 6)}${pad('盤面の型', 10)}${pad('近い5枚の道のり', 18)}${pad('平均倍率', 10)}`,
)
console.log('-'.repeat(56))

const reports = REPORT_SPOTS.map((spot) => reportSpot(spot.name, spot.center))
for (const report of reports) {
  console.log(
    pad(report.name, 10) +
      pad(`${report.candidateCount}`, 6) +
      pad(`${report.handPatternCount} 種`, 10) +
      pad(`${(report.medianRouteMeters / 1000).toFixed(1)} km`, 18) +
      pad(`×${report.averageMultiplier.toFixed(2)}`, 10),
  )
}

console.log('')
console.log('狙える役の出現率（盤面 40 回あたり）')
console.log('-'.repeat(56))
for (const report of reports) {
  const rates = report.handRates
    .map((entry) => `${HAND_DEFINITIONS[entry.handId].name} ${Math.round(entry.rate * 100)}%`)
    .join(' / ')
  console.log(`${pad(report.name, 10)}${rates}`)
}

console.log('')
console.log('※ 30 分で回れるかは、この数字だけでは決められない。実地テストで確認すること。')
