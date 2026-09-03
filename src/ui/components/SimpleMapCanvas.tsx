/**
 * 簡易マップ。
 *
 * Google マップのキーが無い・読み込めないときに使う代替の地図。
 * 道路は描けないが、現在地とカード地点の位置関係・距離はそのまま分かるので、
 * ゲームの進行はすべて同じように行える。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MapCanvasProps } from '@/ui/components/mapTypes'

const TILE = 256

function project(lat: number, lng: number, scale: number) {
  const sin = Math.sin((lat * Math.PI) / 180)
  const clamped = Math.min(Math.max(sin, -0.9999), 0.9999)
  return {
    x: scale * (lng + 180) / 360,
    y: scale * (0.5 - Math.log((1 + clamped) / (1 - clamped)) / (4 * Math.PI)),
  }
}

export function SimpleMapCanvas({ center, zoom, items, onUserInteract }: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState({ lat: center.lat, lng: center.lng, zoom })
  const dragRef = useRef<{ x: number; y: number; lat: number; lng: number } | null>(null)
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null)

  // 追従: 外から中心が変わったら合わせる
  useEffect(() => {
    setView((current) => ({ ...current, lat: center.lat, lng: center.lng }))
  }, [center.lat, center.lng])

  // 盤面の広さに応じた拡大率を反映する
  useEffect(() => {
    setView((current) => ({ ...current, zoom }))
  }, [zoom])

  useEffect(() => {
    const element = hostRef.current
    if (!element) return
    const update = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const scale = TILE * 2 ** view.zoom
  const origin = useMemo(() => project(view.lat, view.lng, scale), [view.lat, view.lng, scale])

  const toScreen = (lat: number, lng: number) => {
    const point = project(lat, lng, scale)
    return { x: point.x - origin.x + size.width / 2, y: point.y - origin.y + size.height / 2 }
  }

  const metersPerPixel =
    (156543.03392 * Math.cos((view.lat * Math.PI) / 180)) / 2 ** view.zoom

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.isPrimary === false) return
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, lat: view.lat, lng: view.lng }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (Math.abs(dx) + Math.abs(dy) < 3) return
    onUserInteract?.()
    const start = project(drag.lat, drag.lng, scale)
    const nextX = start.x - dx
    const nextY = start.y - dy
    const lng = (nextX / scale) * 360 - 180
    const n = Math.PI - (2 * Math.PI * nextY) / scale
    const lat = (180 / Math.PI) * Math.atan(Math.sinh(n))
    setView((current) => ({ ...current, lat, lng }))
  }

  const endDrag = () => {
    dragRef.current = null
    pinchRef.current = null
  }

  const changeZoom = (delta: number) => {
    onUserInteract?.()
    setView((current) => ({
      ...current,
      zoom: Math.min(19, Math.max(10, current.zoom + delta)),
    }))
  }

  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return
    const [a, b] = [event.touches[0]!, event.touches[1]!]
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    if (!pinchRef.current) {
      pinchRef.current = { distance, zoom: view.zoom }
      return
    }
    const ratio = distance / pinchRef.current.distance
    const nextZoom = Math.min(19, Math.max(10, pinchRef.current.zoom + Math.log2(ratio)))
    setView((current) => ({ ...current, zoom: nextZoom }))
  }

  // 目盛りバー（おおよそ 80px 分の距離）
  const scaleMeters = niceDistance(metersPerPixel * 80)
  const scaleWidth = scaleMeters / metersPerPixel

  return (
    <div className="mapcanvas">
      <div
        ref={hostRef}
        className="mapcanvas__host mapcanvas__host--simple"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onTouchMove={onTouchMove}
        onTouchEnd={endDrag}
        onWheel={(event) => changeZoom(event.deltaY > 0 ? -0.4 : 0.4)}
      >
        <div className="simplemap__grid" aria-hidden="true" />
        {size.width > 0 &&
          items.map((item) => {
            const point = toScreen(item.lat, item.lng)
            if (
              point.x < -120 ||
              point.y < -120 ||
              point.x > size.width + 120 ||
              point.y > size.height + 120
            ) {
              return null
            }
            return (
              <div
                key={item.key}
                className="mapcanvas__item"
                data-lat={item.lat}
                data-lng={item.lng}
                data-ward={item.ward}
                style={{ left: `${point.x}px`, top: `${point.y}px`, zIndex: item.zIndex ?? 1 }}
              >
                {item.node}
              </div>
            )
          })}
      </div>
      <div className="simplemap__scale">
        <span className="simplemap__scale-bar" style={{ width: `${scaleWidth}px` }} />
        <span className="num">{scaleMeters >= 1000 ? `${scaleMeters / 1000}km` : `${scaleMeters}m`}</span>
      </div>
      <div className="mapcanvas__zoom">
        <button type="button" onClick={() => changeZoom(1)} aria-label="拡大">
          ＋
        </button>
        <button type="button" onClick={() => changeZoom(-1)} aria-label="縮小">
          －
        </button>
      </div>
    </div>
  )
}

function niceDistance(meters: number): number {
  const steps = [25, 50, 100, 200, 500, 1000, 2000, 5000]
  for (const step of steps) if (meters <= step) return step
  return 10000
}
