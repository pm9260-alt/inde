/** プロフィール。ユーザー名・総プレイ数・最高得点・取得カード数だけ。 */
import { useState } from 'react'
import { hasEnvGoogleMapsKey } from '@/config/env'
import { formatScore } from '@/domain/scoring'
import {
  clearMapsKey,
  hasStoredMapsKey,
  looksLikeMapsKey,
  resolveMapsKey,
  saveMapsKey,
} from '@/services/mapsKey'
import { ALL_CARDS } from '@/state/cards'
import { useGameStore } from '@/state/gameStore'
import { DATA_SOURCE_LABEL } from '@/data/stations'
import { formatDate } from '@/ui/format'

export function ProfileScreen({ onClose }: { onClose: () => void }) {
  const profile = useGameStore((state) => state.profile)
  const dex = useGameStore((state) => state.dex)
  const history = useGameStore((state) => state.history)
  const setUserName = useGameStore((state) => state.setUserName)
  const [draft, setDraft] = useState(profile.userName)

  return (
    <div className="screen screen--scroll screen--overlay">
      <div className="subhead">
        <button type="button" className="subhead__back" onClick={onClose}>
          戻る
        </button>
        <h1 className="subhead__title">プロフィールと設定</h1>
      </div>

      <div className="section">
        <p className="section__label">ユーザー名</p>
        <div className="namerow">
          <input
            className="namerow__input"
            value={draft}
            maxLength={12}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => setUserName(draft)}
            aria-label="ユーザー名"
          />
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => setUserName(draft)}
          >
            保存
          </button>
        </div>
      </div>

      <div className="section">
        <p className="section__label">記録</p>
        <div className="metarow">
          <span className="metarow__key">総プレイ数</span>
          <span className="metarow__value num">{profile.totalPlays} 回</span>
        </div>
        <div className="metarow">
          <span className="metarow__key">最高得点</span>
          <span className="metarow__value num">{formatScore(profile.bestScore)}</span>
        </div>
        <div className="metarow">
          <span className="metarow__key">取得カード数</span>
          <span className="metarow__value num">
            {Object.keys(dex).length} / {ALL_CARDS.length}
          </span>
        </div>
      </div>

      {history.length > 0 && (
        <div className="section">
          <p className="section__label">最近のプレイ</p>
          {history.slice(0, 8).map((record) => (
            <div className="metarow" key={record.id}>
              <span className="metarow__key">
                {formatDate(record.playedAt)}　{record.bestHandName || '役なし'}
              </span>
              <span className="metarow__value num">{formatScore(record.score)}</span>
            </div>
          ))}
        </div>
      )}

      <MapKeySection />

      <div className="section">
        <p className="footnote">カードデータ：{DATA_SOURCE_LABEL}</p>
      </div>
    </div>
  )
}

/**
 * Google マップの設定。
 * 設定ファイルを触らずに、キーを貼り付けるだけで地図を切り替えられるようにする。
 */
function MapKeySection() {
  const [draft, setDraft] = useState(hasStoredMapsKey() ? resolveMapsKey() : '')
  const [message, setMessage] = useState('')
  const connected = resolveMapsKey().length > 0
  const fromEnvOnly = !hasStoredMapsKey() && hasEnvGoogleMapsKey()

  const save = () => {
    const key = draft.trim()
    if (!key) {
      setMessage('キーを貼り付けてください')
      return
    }
    if (!looksLikeMapsKey(key)) {
      setMessage('キーの形が違うようです。もう一度コピーし直してください')
      return
    }
    saveMapsKey(key)
    setMessage('保存しました。読み込み直します')
    setTimeout(() => window.location.reload(), 700)
  }

  const clear = () => {
    clearMapsKey()
    setDraft('')
    setMessage('解除しました。読み込み直します')
    setTimeout(() => window.location.reload(), 700)
  }

  return (
    <div className="section">
      <p className="section__label">地図の設定</p>
      <div className="metarow">
        <span className="metarow__key">いまの地図</span>
        <span className="metarow__value">
          {connected ? 'Google マップ' : '簡易マップ'}
        </span>
      </div>

      {fromEnvOnly ? (
        <p className="footnote" style={{ marginTop: 12 }}>
          設定ファイルのキーを使っています
        </p>
      ) : (
        <>
          <div className="namerow" style={{ marginTop: 12 }}>
            <input
              className="namerow__input"
              value={draft}
              placeholder="Google マップのキーを貼り付け"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => {
                setDraft(event.target.value)
                setMessage('')
              }}
              aria-label="Google マップのキー"
            />
            <button type="button" className="btn btn--quiet" onClick={save}>
              保存
            </button>
          </div>
          {message && <p className="footnote" style={{ marginTop: 8 }}>{message}</p>}
          {hasStoredMapsKey() && (
            <button
              type="button"
              className="btn btn--ghost"
              style={{ marginTop: 4, paddingLeft: 0 }}
              onClick={clear}
            >
              キーを削除して簡易マップに戻す
            </button>
          )}
          <p className="footnote" style={{ marginTop: 10 }}>
            キーはこの端末の中だけに保存され、どこにも送られません
          </p>
        </>
      )}
    </div>
  )
}
