/**
 * 位置情報デバッグパネル（開発ビルド専用）。
 *
 * 本番ビルドでは App.tsx 側で読み込み自体が行われず、
 * さらにこのファイル内でも ENV.isDev を再確認して二重に止めている。
 *
 * できること:
 *   ・現在地を任意のカード地点へ移動
 *   ・取得できるぎりぎりの距離に立った状態を再現
 *   ・タイマーを短縮 / ゲームを即終了
 *   ・位置情報を拒否された状態を再現
 *   ・保存データの全消去
 */
import { useMemo, useState } from 'react'
import { ENV } from '@/config/env'
import { LOCATION_RULES } from '@/config/gameConfig'
import { offsetLatLng } from '@/domain/geo'
import { geolocation } from '@/services/geolocation'
import { ALL_CARDS } from '@/state/cards'
import { useGameStore } from '@/state/gameStore'
import './debug.css'

export default function DebugPanel() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [accuracy, setAccuracy] = useState(10)
  const phase = useGameStore((state) => state.phase)
  const session = useGameStore((state) => state.session)
  const finishGame = useGameStore((state) => state.finishGame)
  const devSetRemainingSeconds = useGameStore((state) => state.devSetRemainingSeconds)
  const resetAllData = useGameStore((state) => state.resetAllData)
  const captureCard = useGameStore((state) => state.captureCard)

  const matches = useMemo(() => {
    const keyword = query.trim()
    const pool = keyword
      ? ALL_CARDS.filter(
          (card) => card.name.includes(keyword) || card.municipality.includes(keyword),
        )
      : ALL_CARDS
    return pool.slice(0, 12)
  }, [query])

  if (!ENV.isDev) return null

  const teleport = (lat: number, lng: number, offsetMeters = 0) => {
    const target = offsetMeters > 0 ? offsetLatLng({ lat, lng }, offsetMeters, 45) : { lat, lng }
    geolocation.setMockLocation(target, accuracy)
  }

  return (
    <div className={`debug${open ? ' debug--open' : ''}`}>
      <button type="button" className="debug__toggle" onClick={() => setOpen((v) => !v)}>
        {open ? '閉じる' : 'DEV'}
      </button>

      {open && (
        <div className="debug__body">
          <p className="debug__title">位置情報デバッグ（開発ビルドのみ）</p>

          <div className="debug__row">
            <label className="debug__label" htmlFor="debug-accuracy">
              GPS 精度 ±{accuracy}m
            </label>
            <input
              id="debug-accuracy"
              type="range"
              min={5}
              max={250}
              step={5}
              value={accuracy}
              onChange={(event) => setAccuracy(Number(event.target.value))}
            />
          </div>

          <input
            className="debug__search"
            placeholder="駅名・区名で絞り込み"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <div className="debug__list">
            {matches.map((card) => (
              <div className="debug__item" key={card.id}>
                <span className="debug__name">{card.name}</span>
                <button type="button" onClick={() => teleport(card.lat, card.lng)}>
                  真上へ
                </button>
                <button
                  type="button"
                  onClick={() =>
                    teleport(card.lat, card.lng, LOCATION_RULES.captureRadiusMeters - 20)
                  }
                >
                  圏内へ
                </button>
                <button
                  type="button"
                  onClick={() =>
                    teleport(card.lat, card.lng, LOCATION_RULES.captureRadiusMeters + 400)
                  }
                >
                  圏外へ
                </button>
                {phase === 'playing' && (
                  <button
                    type="button"
                    onClick={() => {
                      teleport(card.lat, card.lng)
                      setTimeout(() => captureCard(card.id), 60)
                    }}
                  >
                    取得
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="debug__actions">
            <button type="button" onClick={() => geolocation.simulateDenied()}>
              位置情報を拒否
            </button>
            <button type="button" onClick={() => geolocation.clearMockLocation()}>
              実際のGPSへ戻す
            </button>
            <button
              type="button"
              disabled={!session}
              onClick={() => devSetRemainingSeconds(30)}
            >
              残り30秒に
            </button>
            <button type="button" disabled={!session} onClick={() => finishGame('timeup')}>
              即終了
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('保存データをすべて消します。よろしいですか？')) resetAllData()
              }}
            >
              データ全消去
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
