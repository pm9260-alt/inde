/**
 * 現在地の取得。
 *
 * ・許可されない／取得できない場合もアプリを落とさず、状態として返す
 * ・開発ビルドでのみ、任意の座標に差し替えられる（本番では無効）
 */
import { ENV } from '@/config/env'
import type { LatLng } from '@/domain/geo'

export type GeoStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported'

export interface GeoFix {
  coords: LatLng
  /** 位置精度 (m)。小さいほど正確。 */
  accuracy: number
  timestamp: number
  /** 開発用のモック位置かどうか */
  mocked: boolean
}

export interface GeoState {
  status: GeoStatus
  fix: GeoFix | null
  /** 画面に出す 1 行の案内文 */
  message: string
}

type Listener = (state: GeoState) => void

const STATUS_MESSAGE: Record<GeoStatus, string> = {
  idle: '現在地を取得していません',
  requesting: '現在地を確認しています',
  granted: '',
  denied: '位置情報の利用が許可されていません',
  unavailable: '現在地を取得できませんでした',
  timeout: '現在地の取得に時間がかかっています',
  unsupported: 'この端末では位置情報を利用できません',
}

class GeolocationService {
  private listeners = new Set<Listener>()
  private watchId: number | null = null
  private state: GeoState = { status: 'idle', fix: null, message: STATUS_MESSAGE.idle }
  /** 開発用モック。本番ビルドでは常に null のまま。 */
  private mock: { coords: LatLng; accuracy: number } | null = null
  private mockTimer: ReturnType<typeof setInterval> | null = null

  getState(): GeoState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(next: Partial<GeoState>): void {
    const status = next.status ?? this.state.status
    this.state = {
      status,
      fix: next.fix !== undefined ? next.fix : this.state.fix,
      message: next.message ?? STATUS_MESSAGE[status],
    }
    for (const listener of this.listeners) listener(this.state)
  }

  start(): void {
    if (this.mock) {
      this.startMockLoop()
      return
    }
    if (this.watchId !== null) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.emit({ status: 'unsupported', fix: null })
      return
    }
    this.emit({ status: 'requesting' })
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.emit({
          status: 'granted',
          fix: {
            coords: { lat: position.coords.latitude, lng: position.coords.longitude },
            accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : 999,
            timestamp: position.timestamp,
            mocked: false,
          },
          message: '',
        })
      },
      (error) => {
        const status: GeoStatus =
          error.code === error.PERMISSION_DENIED
            ? 'denied'
            : error.code === error.TIMEOUT
              ? 'timeout'
              : 'unavailable'
        this.emit({ status })
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    )
  }

  stop(): void {
    if (this.watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId)
    }
    this.watchId = null
    if (this.mockTimer !== null) {
      clearInterval(this.mockTimer)
      this.mockTimer = null
    }
  }

  /** 一度だけ取り直す（「もう一度試す」ボタン用） */
  retry(): void {
    this.stop()
    this.start()
  }

  /* ---------------- 開発用のモック（本番ビルドでは動かない） --------------- */

  isMocked(): boolean {
    return this.mock !== null
  }

  setMockLocation(coords: LatLng, accuracy = 10): void {
    if (!ENV.isDev) return
    this.stop()
    this.mock = { coords, accuracy }
    this.pushMockFix()
    this.startMockLoop()
  }

  clearMockLocation(): void {
    if (!ENV.isDev) return
    this.mock = null
    this.stop()
    this.emit({ status: 'idle', fix: null })
    this.start()
  }

  /** 位置情報を拒否された状態を再現する */
  simulateDenied(): void {
    if (!ENV.isDev) return
    this.stop()
    this.mock = null
    this.emit({ status: 'denied', fix: null })
  }

  private startMockLoop(): void {
    if (this.mockTimer !== null) clearInterval(this.mockTimer)
    this.mockTimer = setInterval(() => this.pushMockFix(), 2_000)
  }

  private pushMockFix(): void {
    if (!this.mock) return
    this.emit({
      status: 'granted',
      fix: {
        coords: this.mock.coords,
        accuracy: this.mock.accuracy,
        timestamp: Date.now(),
        mocked: true,
      },
      message: '',
    })
  }
}

export const geolocation = new GeolocationService()
