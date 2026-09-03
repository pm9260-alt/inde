/** プロフィール。ユーザー名・総プレイ数・最高得点・取得カード数だけ。 */
import { useState } from 'react'
import { formatScore } from '@/domain/scoring'
import { ALL_CARDS } from '@/state/cards'
import { useGameStore } from '@/state/gameStore'
import { DATA_SOURCE_LABEL } from '@/data/stations'
import { formatDate } from '@/ui/format'

export function ProfileScreen() {
  const profile = useGameStore((state) => state.profile)
  const dex = useGameStore((state) => state.dex)
  const history = useGameStore((state) => state.history)
  const setUserName = useGameStore((state) => state.setUserName)
  const [draft, setDraft] = useState(profile.userName)

  return (
    <div className="screen screen--scroll">
      <div className="page-head">
        <h1 className="page-head__title">プロフィール</h1>
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

      <div className="section">
        <p className="footnote">カードデータ：{DATA_SOURCE_LABEL}</p>
      </div>
    </div>
  )
}
