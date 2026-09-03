/** 座標まわりの計算（外部ライブラリなし） */

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_M = 6_371_008.8

/** 2 地点間の距離 (m)。ハバーサイン公式。 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 距離の表示用フォーマット。1km 未満は m、以上は km。 */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—'
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)}km`
}

/** 指定地点から指定方位・距離だけ動いた座標を返す（デバッグ用の移動に使う）。 */
export function offsetLatLng(origin: LatLng, meters: number, bearingDeg = 0): LatLng {
  const latDelta = (meters * Math.cos((bearingDeg * Math.PI) / 180)) / 111_320
  const lngDelta =
    (meters * Math.sin((bearingDeg * Math.PI) / 180)) /
    (111_320 * Math.cos((origin.lat * Math.PI) / 180))
  return { lat: origin.lat + latDelta, lng: origin.lng + lngDelta }
}

/**
 * 指定した地点がすべて画面に収まる拡大率を返す。
 * 開始前に盤面の全体像を見せるために使う。
 */
export function zoomToFit(
  points: readonly LatLng[],
  widthPx: number,
  heightPx: number,
  options: { padding?: number; min?: number; max?: number } = {},
): number {
  const { padding = 1.25, min = 11, max = 16 } = options
  if (points.length === 0 || widthPx <= 0 || heightPx <= 0) return max

  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const point of points) {
    minLat = Math.min(minLat, point.lat)
    maxLat = Math.max(maxLat, point.lat)
    minLng = Math.min(minLng, point.lng)
    maxLng = Math.max(maxLng, point.lng)
  }

  const centerLat = (minLat + maxLat) / 2
  const latMeters = distanceMeters({ lat: minLat, lng: centerLat }, { lat: maxLat, lng: centerLat })
  const lngMeters = distanceMeters({ lat: centerLat, lng: minLng }, { lat: centerLat, lng: maxLng })
  if (latMeters === 0 && lngMeters === 0) return max

  const metersPerPixel = Math.max(
    (lngMeters * padding) / widthPx,
    (latMeters * padding) / heightPx,
    0.5,
  )
  const zoom = Math.log2((156543.03392 * Math.cos((centerLat * Math.PI) / 180)) / metersPerPixel)
  return Math.max(min, Math.min(max, Math.floor(zoom * 10) / 10))
}
