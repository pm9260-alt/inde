/**
 * Google マップ本体。
 * マーカーは OverlayView 上の HTML として描くので、見た目を CSS で完全に制御できる。
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ENV } from '@/config/env'
import { loadGoogleMaps } from '@/services/googleMaps'
import type { MapCanvasProps } from '@/ui/components/mapTypes'

interface Props extends MapCanvasProps {
  onError: (message: string) => void
}

export function GoogleMapCanvas({ center, zoom, items, onUserInteract, onError }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const overlayRef = useRef<google.maps.OverlayView | null>(null)
  const [layer, setLayer] = useState<HTMLDivElement | null>(null)
  const centerRef = useRef(center)
  centerRef.current = center

  useEffect(() => {
    let cancelled = false
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !hostRef.current) return
        const map = new maps.Map(hostRef.current, {
          center: centerRef.current,
          zoom,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
          keyboardShortcuts: false,
          ...(ENV.googleMapsMapId ? { mapId: ENV.googleMapsMapId } : {}),
          styles: ENV.googleMapsMapId ? undefined : MAP_STYLE,
        })
        mapRef.current = map

        const container = document.createElement('div')
        container.style.position = 'absolute'
        container.style.inset = '0'

        class ItemOverlay extends maps.OverlayView {
          override onAdd() {
            this.getPanes()?.overlayMouseTarget.appendChild(container)
          }
          override draw() {
            const projection = this.getProjection()
            if (!projection) return
            const nodes = container.querySelectorAll<HTMLElement>('[data-lat]')
            for (const node of nodes) {
              const lat = Number(node.dataset.lat)
              const lng = Number(node.dataset.lng)
              const point = projection.fromLatLngToDivPixel(new maps.LatLng(lat, lng))
              if (!point) continue
              node.style.left = `${point.x}px`
              node.style.top = `${point.y}px`
            }
          }
          override onRemove() {
            container.remove()
          }
        }

        const overlay = new ItemOverlay()
        overlay.setMap(map)
        overlayRef.current = overlay
        setLayer(container)

        map.addListener('dragstart', () => onUserInteract?.())
        map.addListener('zoom_changed', () => overlay.draw())
        map.addListener('idle', () => overlay.draw())
      })
      .catch((error: unknown) => {
        if (cancelled) return
        onError(error instanceof Error ? error.message : 'Google マップを読み込めませんでした')
      })
    return () => {
      cancelled = true
      overlayRef.current?.setMap(null)
      overlayRef.current = null
      mapRef.current = null
    }
    // マップの生成は一度だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 中心の追従
  useEffect(() => {
    mapRef.current?.panTo(center)
  }, [center.lat, center.lng])

  // マーカーの位置を再計算
  useEffect(() => {
    overlayRef.current?.draw()
  }, [items, layer])

  return (
    <div className="mapcanvas">
      <div ref={hostRef} className="mapcanvas__host" />
      {layer &&
        createPortal(
          items.map((item) => (
            <div
              key={item.key}
              className="mapcanvas__item"
              data-lat={item.lat}
              data-lng={item.lng}
              style={{ zIndex: item.zIndex ?? 1 }}
            >
              {item.node}
            </div>
          )),
          layer,
        )}
    </div>
  )
}

/** 地図を主役にしつつ、マーカーが読みやすいよう彩度を落とした配色 */
const MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b7075' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#eef1ee' }, { visibility: 'on' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#fafafa' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#e6e8ea' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dfe6ea' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f6f6f5' }] },
]
