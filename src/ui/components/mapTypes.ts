import type { ReactNode } from 'react'
import type { LatLng } from '@/domain/geo'

export interface MapItem {
  key: string
  lat: number
  lng: number
  /** 重なったときの前後関係。大きいほど手前。 */
  zIndex?: number
  node: ReactNode
}

export interface MapCanvasProps {
  center: LatLng
  zoom: number
  items: readonly MapItem[]
  /** 地図を動かしたときに呼ばれる（自動追従を止めるため） */
  onUserInteract?: () => void
}
