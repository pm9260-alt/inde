/**
 * 画面から使う派生値。
 *
 * zustand のセレクタで毎回新しい配列やオブジェクトを作ると、
 * React が「値が変わり続けている」と判断して再描画が止まらなくなる。
 * そのため参照が安定した値だけをストアから取り出し、
 * 組み立ては useMemo 側で行う。
 */
import { useMemo } from 'react'
import { buildHandHints } from '@/domain/handHints'
import { calculateScore } from '@/domain/scoring'
import type { LatLng } from '@/domain/geo'
import type { HandHint, PlaceCard, ScoreBreakdown } from '@/domain/types'
import { useGameStore } from '@/state/gameStore'
import { cardsOf, nearbyCards, type NearbyCard } from '@/state/selectors'

const EMPTY_CAPTURED: ReadonlyArray<{ cardId: string }> = []

/** 現在の手札 */
export function useHand(): PlaceCard[] {
  const captured = useGameStore((state) => state.session?.captured ?? EMPTY_CAPTURED)
  return useMemo(() => cardsOf(captured.map((entry) => entry.cardId)), [captured])
}

/** 暫定スコア */
export function useInterimScore(hand: readonly PlaceCard[]): ScoreBreakdown {
  return useMemo(() => calculateScore(hand), [hand])
}

/** 役予告 */
export function useHandHints(hand: readonly PlaceCard[]): HandHint[] {
  return useMemo(() => buildHandHints(hand), [hand])
}

/**
 * 現在地から近い順の候補カード。
 * 現在地は小刻みに動き続けるので、およそ 20m 単位に丸めてから再計算する。
 */
export function useNearbyCards(center: LatLng | null): NearbyCard[] {
  const captured = useGameStore((state) => state.session?.captured ?? EMPTY_CAPTURED)
  const latKey = center ? Math.round(center.lat * 5000) : null
  const lngKey = center ? Math.round(center.lng * 5000) : null
  const lat = center?.lat ?? null
  const lng = center?.lng ?? null

  return useMemo(() => {
    const capturedIds = new Set(captured.map((entry) => entry.cardId))
    return nearbyCards(lat === null || lng === null ? null : { lat, lng }, capturedIds)
    // lat/lng そのものではなく丸めた値を依存に使う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captured, latKey, lngKey])
}

/** 残り時間（秒）。ゲーム中でなければ null。 */
export function useRemainingSeconds(): number | null {
  return useGameStore((state) =>
    state.session ? Math.max(0, Math.ceil((state.session.endsAt - state.now) / 1000)) : null,
  )
}
