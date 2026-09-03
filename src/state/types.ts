import type { PlaceCard, ScoreBreakdown } from '@/domain/types'

export interface Profile {
  userId: string
  userName: string
  totalPlays: number
  bestScore: number
  createdAt: number
}

/** 図鑑の 1 件 */
export interface DexEntry {
  cardId: string
  name: string
  prefecture: string
  municipality: string
  firstCapturedAt: number
  captureCount: number
  /** そのカードを使ったときの最高得点 */
  bestScoreWithCard: number
}

/** プレイ履歴の 1 件 */
export interface PlayRecord {
  id: string
  playedAt: number
  score: number
  cardIds: string[]
  cardNames: string[]
  bestHandName: string
  handNames: string[]
  cardTotal: number
  multiplier: number
  durationSeconds: number
  distanceMeters: number
  finishReason: FinishReason
}

export type FinishReason = 'complete' | 'timeup' | 'aborted'

/** 進行中のゲーム（保存して復帰できる形にしておく） */
export interface ActiveSession {
  id: string
  startedAt: number
  endsAt: number
  captured: Array<{ cardId: string; capturedAt: number; distanceAtCapture: number }>
  distanceMeters: number
  lastPoint: { lat: number; lng: number } | null
}

export interface GameResult {
  id: string
  playedAt: number
  cards: PlaceCard[]
  score: ScoreBreakdown
  durationSeconds: number
  distanceMeters: number
  previousBest: number
  isNewBest: boolean
  finishReason: FinishReason
}

export type GamePhase = 'idle' | 'playing' | 'result'
