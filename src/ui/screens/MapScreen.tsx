/**
 * マップ画面。ゲームループの中心。
 * ・周辺カードのマーカー表示 → 作戦を考える
 * ・30分チャレンジの開始
 * ・対象地点へ近づいてカードを取得
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { GAME_RULES, LOCATION_RULES } from '@/config/gameConfig'
import { hasGoogleMaps } from '@/config/env'
import { evaluateCaptureEligibility } from '@/domain/capture'
import { distanceMeters, formatDistance, type LatLng } from '@/domain/geo'
import type { PlaceCard } from '@/domain/types'
import { geolocation, type GeoState } from '@/services/geolocation'
import { tapFeedback } from '@/services/haptics'
import { useGameStore } from '@/state/gameStore'
import {
  useHand,
  useHandHints,
  useInterimScore,
  useNearbyCards,
  useRemainingSeconds,
} from '@/ui/hooks/useGameDerived'
import { CardMarker } from '@/ui/components/CardMarker'
import { CardSheet } from '@/ui/components/CardSheet'
import { GameHud } from '@/ui/components/GameHud'
import { GoogleMapCanvas } from '@/ui/components/GoogleMapCanvas'
import { HandStrip } from '@/ui/components/HandStrip'
import { SimpleMapCanvas } from '@/ui/components/SimpleMapCanvas'
import type { MapItem } from '@/ui/components/mapTypes'

/** 現在地が取れないときの初期表示位置（東京駅） */
const DEFAULT_CENTER: LatLng = { lat: 35.6812, lng: 139.7671 }

export function MapScreen({ geo }: { geo: GeoState }) {
  const phase = useGameStore((state) => state.phase)
  const session = useGameStore((state) => state.session)
  const dex = useGameStore((state) => state.dex)
  const startGame = useGameStore((state) => state.startGame)
  const captureCard = useGameStore((state) => state.captureCard)
  const abortGame = useGameStore((state) => state.abortGame)

  const hand = useHand()
  const hints = useHandHints(hand)
  const interimScore = useInterimScore(hand)
  const remainingSeconds = useRemainingSeconds()

  const fix = geo.fix
  const center = fix?.coords ?? DEFAULT_CENTER
  const nearby = useNearbyCards(fix?.coords ?? null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [following, setFollowing] = useState(true)
  const [mapCenter, setMapCenter] = useState<LatLng>(center)
  const [mapsFailed, setMapsFailed] = useState(false)
  const [toast, setToast] = useState('')
  const lastCenterRef = useRef<string>('')

  // 追従中は現在地に合わせて地図を動かす
  useEffect(() => {
    if (!following) return
    const key = `${center.lat.toFixed(5)},${center.lng.toFixed(5)}`
    if (key === lastCenterRef.current) return
    lastCenterRef.current = key
    setMapCenter(center)
  }, [center.lat, center.lng, following])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(timer)
  }, [toast])

  const selectedCard = useMemo<PlaceCard | null>(
    () => nearby.find((entry) => entry.card.id === selectedId)?.card ?? null,
    [nearby, selectedId],
  )

  const selectedDistance =
    selectedCard && fix
      ? distanceMeters(fix.coords, { lat: selectedCard.lat, lng: selectedCard.lng })
      : null

  const selectedCaptured =
    selectedCard !== null &&
    (session?.captured.some((entry) => entry.cardId === selectedCard.id) ?? false)

  const eligibility = evaluateCaptureEligibility({
    distanceMeters: selectedDistance,
    accuracyMeters: fix?.accuracy ?? null,
    alreadyCaptured: selectedCaptured,
    handFull: hand.length >= GAME_RULES.handSize,
    playing: phase === 'playing',
  })

  const items: MapItem[] = useMemo(() => {
    const markers: MapItem[] = nearby.map((entry) => {
      const inRange =
        entry.distance !== null &&
        entry.distance - Math.min(fix?.accuracy ?? 0, LOCATION_RULES.accuracyAllowanceMaxMeters) <=
          LOCATION_RULES.captureRadiusMeters
      return {
        key: entry.card.id,
        lat: entry.card.lat,
        lng: entry.card.lng,
        zIndex: entry.card.id === selectedId ? 30 : inRange && !entry.captured ? 12 : 10,
        node: (
          <CardMarker
            card={entry.card}
            captured={entry.captured}
            inRange={inRange && !entry.captured}
            selected={entry.card.id === selectedId}
            onSelect={(cardId) => {
              tapFeedback(8)
              setSelectedId(cardId)
            }}
          />
        ),
      }
    })
    if (fix) {
      markers.push({
        key: '__me__',
        lat: fix.coords.lat,
        lng: fix.coords.lng,
        zIndex: 15,
        node: <span className={`me${fix.accuracy > LOCATION_RULES.poorAccuracyThresholdMeters ? ' me--stale' : ''}`} />,
      })
    }
    return markers
  }, [nearby, selectedId, fix])

  const useGoogle = hasGoogleMaps() && !mapsFailed
  const nearestUncaptured = nearby.find((entry) => !entry.captured)

  const handleCapture = () => {
    if (!selectedCard) return
    const result = captureCard(selectedCard.id)
    if (result.ok) {
      // 成功したことは中央のカード演出で伝えるので、トーストは出さない
      setSelectedId(null)
    } else {
      setToast(result.message)
    }
  }

  return (
    <div className="screen">
      {phase === 'playing' && remainingSeconds !== null && (
        <GameHud
          remainingSeconds={remainingSeconds}
          capturedCount={hand.length}
          score={interimScore}
          hints={hints}
        />
      )}

      <LocationNotice geo={geo} />
      {!useGoogle && (
        <div className="notice">
          <span className="notice__text">
            <span className="notice__main">簡易マップで表示しています</span>
          </span>
        </div>
      )}

      <div className="app__body">
        {useGoogle ? (
          <GoogleMapCanvas
            center={mapCenter}
            zoom={15}
            items={items}
            onUserInteract={() => setFollowing(false)}
            onError={() => setMapsFailed(true)}
          />
        ) : (
          <SimpleMapCanvas
            center={mapCenter}
            zoom={15}
            items={items}
            onUserInteract={() => setFollowing(false)}
          />
        )}

        <div className="mapctl">
          {!following && (
            <button
              type="button"
              className="mapctl__btn"
              onClick={() => {
                setFollowing(true)
                setMapCenter(center)
              }}
            >
              現在地へ
            </button>
          )}
        </div>

        {phase === 'playing' ? (
          <HandStrip cards={hand} />
        ) : (
          <div className="startbar">
            <p className="startbar__note">
              {!fix
                ? '現在地が分かるとチャレンジを始められます'
                : nearestUncaptured && nearestUncaptured.distance !== null
                  ? `いちばん近いカードは ${nearestUncaptured.card.name}（${formatDistance(nearestUncaptured.distance)}）`
                  : `周辺のカードを見ながら ${GAME_RULES.durationMinutes} 分のルートを考えましょう`}
            </p>
            <button
              type="button"
              className="btn btn--accent"
              disabled={!fix}
              onClick={() => {
                tapFeedback(12)
                startGame()
              }}
            >
              {GAME_RULES.durationMinutes}分チャレンジを始める
            </button>
          </div>
        )}

        {selectedCard && (
          <CardSheet
            card={selectedCard}
            distance={selectedDistance}
            captured={selectedCaptured}
            eligibility={eligibility}
            dexEntry={dex[selectedCard.id]}
            onCapture={handleCapture}
            onClose={() => setSelectedId(null)}
          />
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>

      {phase === 'playing' && (
        <button type="button" className="abort" onClick={abortGame}>
          チャレンジをやめる
        </button>
      )}
    </div>
  )
}

/** 位置情報の状態に応じた案内 */
function LocationNotice({ geo }: { geo: GeoState }) {
  if (geo.status === 'granted') {
    if (geo.fix && geo.fix.accuracy > LOCATION_RULES.poorAccuracyThresholdMeters) {
      return (
        <div className="notice">
          <span className="notice__text">
            <span className="notice__main">
              現在地の精度が低めです（誤差 約{Math.round(geo.fix.accuracy)}m）
            </span>
            <span className="notice__sub">建物の外に出ると安定します</span>
          </span>
        </div>
      )
    }
    return null
  }
  if (geo.status === 'idle' || geo.status === 'requesting') {
    return (
      <div className="notice">
        <span className="notice__text">
          <span className="notice__main">現在地を確認しています</span>
        </span>
      </div>
    )
  }

  const guide =
    geo.status === 'denied'
      ? '端末の設定で位置情報を「許可」にしてください'
      : geo.status === 'unsupported'
        ? '地図を見ることはできます'
        : 'しばらく待つか、建物の外で試してください'

  return (
    <div className="notice notice--warn">
      <span className="notice__text">
        <span className="notice__main">{geo.message}</span>
        <span className="notice__sub">{guide}</span>
      </span>
      {geo.status !== 'unsupported' && (
        <button type="button" className="notice__action" onClick={() => geolocation.retry()}>
          もう一度
        </button>
      )}
    </div>
  )
}
