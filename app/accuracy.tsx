/**
 * 精度の確認。開発ビルドでのみ開ける。
 *
 * 実際の夜空と画面がどれだけ合っているかは、実機でしか分からない。
 * ここは、その「分かったこと」を数字にして持ち帰るための道具。
 *
 * 見るのは 4 つ。
 *   方位・高度   いまどこを向いていると思っているか
 *   ゆらぎ       端末を置いたまま、値がどれだけ震えるか
 *   ドリフト     置いたまま、時間とともにどれだけ流れるか
 *   星とのずれ   実際の星に中央を合わせたとき、何度ずれているか
 *
 * 経路（fusion / native / arkit）を切り替えても、測り方は変わらない。
 * 同じ条件で並べて比べられる。
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { altitudeOf, azimuthOf } from '../src/astro/math';
import { viewingDirection } from '../src/astro/projection';
import { directionAt } from '../src/astro/sky';
import { DEMO_MODE_AVAILABLE } from '../src/config/featureFlags';
import { color, gutter, hitSlop, radius, space, stroke } from '../src/design/tokens';
import {
  isCorrectionSuspicious,
  measureAlignment,
  suggestedCorrection,
  type AlignmentSample,
} from '../src/sensors/alignment';
import type { AttitudeCorrection } from '../src/sensors/corrections';
import {
  measureDrift,
  StabilityWindow,
  type DriftReference,
  type DriftSummary,
  type StabilitySummary,
  EMPTY_STABILITY,
} from '../src/sensors/stability';
import { NEUTRAL_OBSERVER, useClock, useObserver } from '../src/sensors/useObserver';
import {
  useOrientation,
  type AttitudeSource,
  type ResolvedSource,
} from '../src/sensors/useOrientation';
import { brightReferenceStars, type ReferenceStar } from '../src/sky/referenceStars';
import { useSkyModel } from '../src/sky/useSkyModel';
import { useSettings } from '../src/state/settings';
import { compassName, skyPositionPhrase } from '../src/ui/format';
import { Type } from '../src/ui/Type';

/** 読み値と安定性の更新間隔。目で追える速さ。 */
const SAMPLE_INTERVAL_MS = 100;

const SOURCE_LABELS: Record<AttitudeSource, string> = {
  auto: '自動',
  fusion: 'fusion',
  native: 'native',
  arkit: 'ARKit',
};

const SOURCE_NOTES: Record<ResolvedSource, string> = {
  fusion: '重力と地磁気から自前で組み立て。Expo Go でも動く',
  native: 'CoreMotion のクォータニオン。真北基準',
  arkit: 'ARKit。映像の追跡を併用。磁気の乱れに強い',
};

export default function AccuracyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const observerState = useObserver();
  const now = useClock(30_000);

  const correction = useMemo<AttitudeCorrection>(
    () => ({
      declinationDeg: observerState.declination ?? 0,
      manualHeadingDeg: settings.headingOffsetDeg,
      manualPitchDeg: settings.pitchOffsetDeg,
    }),
    [observerState.declination, settings.headingOffsetDeg, settings.pitchOffsetDeg],
  );

  const { attitudeRef, status, availableSources } = useOrientation({
    correction,
    requested: settings.attitudeSource,
  });

  const model = useSkyModel({
    kind: 'live',
    observer: observerState.observer ?? NEUTRAL_OBSERVER,
    time: now,
    environment: settings.environment,
    onlyVisibleStars: settings.onlyVisibleStars,
  });

  const [aim, setAim] = useState({ azimuth: 0, altitude: 0 });
  const [stability, setStability] = useState<StabilitySummary>(EMPTY_STABILITY);
  const [drift, setDrift] = useState<DriftSummary | null>(null);
  const driftReference = useRef<DriftReference | null>(null);
  const window = useRef(new StabilityWindow(3000));

  const [selectedStar, setSelectedStar] = useState<ReferenceStar | null>(null);
  const [alignment, setAlignment] = useState<{ star: ReferenceStar; sample: AlignmentSample } | null>(
    null,
  );

  const stars = useMemo(() => brightReferenceStars(model.snapshot), [model.snapshot]);

  useEffect(() => {
    const timer = setInterval(() => {
      const attitude = attitudeRef.current;
      const at = Date.now();
      const view = viewingDirection(attitude);
      setAim({ azimuth: azimuthOf(view), altitude: altitudeOf(view) });

      window.current.push(attitude, at);
      setStability(window.current.summary());

      const reference = driftReference.current;
      setDrift(reference ? measureDrift(reference, attitude, at) : null);
    }, SAMPLE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [attitudeRef]);

  // 経路を変えたら、ゆらぎもドリフトも測り直す。混ぜて比べても意味がない。
  useEffect(() => {
    window.current.clear();
    driftReference.current = null;
    setDrift(null);
    setAlignment(null);
  }, [status.source]);

  const captureDriftReference = useCallback(() => {
    driftReference.current = { attitude: attitudeRef.current, at: Date.now() };
    setDrift(null);
  }, [attitudeRef]);

  const captureAlignment = useCallback(() => {
    if (!selectedStar) return;
    const direction = directionAt(model.snapshot, selectedStar.index);
    setAlignment({
      star: selectedStar,
      sample: measureAlignment(attitudeRef.current, direction),
    });
  }, [selectedStar, model.snapshot, attitudeRef]);

  const applySuggestion = useCallback(() => {
    if (!alignment) return;
    const next = suggestedCorrection(correction, alignment.sample);
    update({
      headingOffsetDeg: Number(next.manualHeadingDeg.toFixed(1)),
      pitchOffsetDeg: Number(next.manualPitchDeg.toFixed(2)),
    });
    setAlignment(null);
  }, [alignment, correction, update]);

  if (!DEMO_MODE_AVAILABLE) {
    // 公開ビルドではこの画面へ入る導線が無いが、念のため。
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Type variant="title">精度</Type>
          <Pressable onPress={() => router.back()} hitSlop={hitSlop}>
            <Type variant="body" tone="ember">
              完了
            </Type>
          </Pressable>
        </View>
        <View style={styles.content}>
          <Type variant="body" tone="secondary">
            この画面は開発ビルドでのみ使えます。
          </Type>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Type variant="title">精度</Type>
        <Pressable onPress={() => router.back()} hitSlop={hitSlop} accessibilityRole="button">
          <Type variant="body" tone="ember">
            完了
          </Type>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.x4l }]}
        showsVerticalScrollIndicator={false}
      >
        <Section title="姿勢の取得経路">
          <View style={styles.choices}>
            {(['auto', ...availableSources] as AttitudeSource[]).map((option) => {
              const selected = settings.attitudeSource === option;
              const isActive = status.source === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => update({ attitudeSource: option })}
                  style={[styles.choice, selected && styles.choiceSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View style={styles.choiceRow}>
                    <Type variant="body" tone={selected ? 'ember' : 'primary'}>
                      {SOURCE_LABELS[option]}
                    </Type>
                    {isActive ? (
                      <Type variant="caption" tone="tertiary">
                        いま動作中
                      </Type>
                    ) : null}
                  </View>
                  {option !== 'auto' ? (
                    <Type variant="caption" tone="tertiary" style={styles.choiceDetail}>
                      {SOURCE_NOTES[option as ResolvedSource]}
                    </Type>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          {availableSources.length === 1 ? (
            <Type variant="caption" tone="tertiary" style={styles.note}>
              このビルドでは fusion しか使えません。native と ARKit は開発ビルド
              （EAS Build）でのみ入ります。docs/DEV-BUILD.md を参照してください。
            </Type>
          ) : null}
          <Divider />
          <Readout label="動作中" value={status.source ?? '—'} />
          {status.trackingState ? (
            <Readout label="ARKit の追跡" value={status.trackingState} muted />
          ) : null}
          {status.gravityErrorDeg != null ? (
            <Readout
              label="座標系の検算"
              value={`${status.gravityErrorDeg.toFixed(2)}°`}
              muted
            />
          ) : null}
          {status.fallbackReason ? (
            <Type variant="caption" tone="warn" style={styles.note}>
              {status.fallbackReason}
            </Type>
          ) : null}
        </Section>

        <Section title="いま向いている先">
          <Readout
            label="方位"
            value={`${aim.azimuth.toFixed(1)}°　${compassName(aim.azimuth)}`}
          />
          <Readout label="高度" value={`${aim.altitude.toFixed(1)}°`} />
        </Section>

        <Section title="ゆらぎ">
          <Type variant="caption" tone="tertiary" style={styles.note}>
            端末を机に置いて、触らずに数秒待ってください。動かしていないのに
            振れている分が、そのままセンサーのノイズです。
          </Type>
          <Readout label="方位の振れ幅" value={`${stability.azimuthSpreadDeg.toFixed(2)}°`} />
          <Readout label="高度の振れ幅" value={`${stability.altitudeSpreadDeg.toFixed(2)}°`} />
          <Readout
            label="測定窓"
            value={`${stability.windowSeconds.toFixed(1)} 秒 / ${stability.sampleCount} 点`}
            muted
          />
        </Section>

        <Section title="ドリフト">
          <Type variant="caption" tone="tertiary" style={styles.note}>
            端末を置いたまま「基準にする」を押し、数分そのままにしてください。
            動かしていないのに増えていく分が、時間とともに溜まるずれです。
          </Type>
          <Pressable
            onPress={captureDriftReference}
            style={styles.action}
            accessibilityRole="button"
          >
            <Type variant="body" tone="ember">
              いまの向きを基準にする
            </Type>
          </Pressable>
          {drift ? (
            <>
              <Readout label="経過" value={`${drift.elapsedSeconds.toFixed(0)} 秒`} muted />
              <Readout label="方位のずれ" value={`${signed(drift.azimuthDeg)}°`} />
              <Readout label="高度のずれ" value={`${signed(drift.altitudeDeg)}°`} />
              <Readout
                label="方位の流れ"
                value={
                  drift.azimuthPerMinute == null
                    ? '測定中'
                    : `${signed(drift.azimuthPerMinute)}°/分`
                }
                muted
              />
            </>
          ) : (
            <Type variant="caption" tone="tertiary" style={styles.note}>
              基準がまだありません。
            </Type>
          )}
        </Section>

        <Section title="実際の星で確かめる">
          <Type variant="caption" tone="tertiary" style={styles.note}>
            下から星をひとつ選び、**画面の中央**を実際のその星に合わせて
            「合わせた」を押してください。こちらが思っている位置との差が出ます。
          </Type>
          {stars.length === 0 ? (
            <Type variant="caption" tone="tertiary" style={styles.note}>
              いま空に、基準にできる明るい星がありません（高度 20° 以上・2.2 等より明るい星）。
            </Type>
          ) : (
            <View style={styles.choices}>
              {stars.map((star) => {
                const selected = selectedStar?.hr === star.hr;
                return (
                  <Pressable
                    key={star.hr}
                    onPress={() => setSelectedStar(star)}
                    style={[styles.choice, selected && styles.choiceSelected]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <View style={styles.choiceRow}>
                      <Type variant="body" tone={selected ? 'ember' : 'primary'}>
                        {star.name}
                      </Type>
                      <Type variant="numeric" tone="secondary">
                        {star.magnitude.toFixed(1)} 等
                      </Type>
                    </View>
                    <Type variant="caption" tone="tertiary" style={styles.choiceDetail}>
                      {skyPositionPhrase(star.altitudeDeg, star.azimuthDeg)}　方位{' '}
                      {star.azimuthDeg.toFixed(0)}°・高度 {star.altitudeDeg.toFixed(0)}°
                    </Type>
                  </Pressable>
                );
              })}
            </View>
          )}

          {selectedStar ? (
            <Pressable onPress={captureAlignment} style={styles.action} accessibilityRole="button">
              <Type variant="body" tone="ember">
                中央を {selectedStar.name} に合わせた
              </Type>
            </Pressable>
          ) : null}

          {alignment ? (
            <>
              <Divider />
              <Type variant="label" tone="tertiary" style={styles.note}>
                画面での見え方
              </Type>
              <Readout
                label="予測の位置"
                value={`右へ ${signed(alignment.sample.rightDeg)}°・上へ ${signed(alignment.sample.upDeg)}°`}
              />
              <Type variant="label" tone="tertiary" style={styles.note}>
                空での向き
              </Type>
              <Readout label="方位のずれ" value={`${signed(alignment.sample.azimuthDeg)}°`} />
              <Readout label="高度のずれ" value={`${signed(alignment.sample.altitudeDeg)}°`} />

              {isCorrectionSuspicious(alignment.sample) ? (
                <Type variant="caption" tone="warn" style={styles.note}>
                  ずれが大きすぎます。カメラの光軸の傾きや地磁気の偏りでは
                  説明できない大きさなので、補正で埋める前に原因を探してください。
                  画角の設定、コンパスの較正、周囲の磁気を先に確認します。
                </Type>
              ) : (
                <Type variant="caption" tone="tertiary" style={styles.note}>
                  補正を入れる前に、別の星でも同じずれ量が出るか確かめてください。
                  星ごとに違うなら、原因は方位の偏りではありません。
                </Type>
              )}

              <Pressable onPress={applySuggestion} style={styles.action} accessibilityRole="button">
                <Type variant="body" tone="ember">
                  このずれを補正に反映する
                </Type>
              </Pressable>
            </>
          ) : null}
        </Section>

        <Section title="報告用">
          <Type variant="caption" tone="secondary" style={styles.report}>
            {[
              `経路: ${status.source ?? '—'}（要求 ${settings.attitudeSource}）`,
              status.trackingState ? `ARKit 追跡: ${status.trackingState}` : null,
              status.gravityErrorDeg != null
                ? `座標系の検算: ${status.gravityErrorDeg.toFixed(2)}°`
                : null,
              `方位 ${aim.azimuth.toFixed(1)}° / 高度 ${aim.altitude.toFixed(1)}°`,
              `ゆらぎ 方位 ${stability.azimuthSpreadDeg.toFixed(2)}° / 高度 ${stability.altitudeSpreadDeg.toFixed(2)}°`,
              drift
                ? `ドリフト ${drift.elapsedSeconds.toFixed(0)}秒で 方位 ${signed(drift.azimuthDeg)}° / 高度 ${signed(drift.altitudeDeg)}°`
                : 'ドリフト 未測定',
              alignment
                ? `星ずれ ${alignment.star.name}: 右へ ${signed(alignment.sample.rightDeg)}° 上へ ${signed(alignment.sample.upDeg)}°（方位 ${signed(alignment.sample.azimuthDeg)}° 高度 ${signed(alignment.sample.altitudeDeg)}°）`
                : '星ずれ 未測定',
              `補正 方位 ${signed(settings.headingOffsetDeg)}° / 仰角 ${signed(settings.pitchOffsetDeg)}°`,
              `画角 ${settings.verticalFovDeg.toFixed(1)}°`,
              `偏角 ${observerState.declination == null ? '取得中' : `${signed(observerState.declination)}°`}`,
              observerState.observer
                ? `観測地 ${observerState.observer.latitude.toFixed(3)}, ${observerState.observer.longitude.toFixed(3)}`
                : '観測地 取得できていません',
            ]
              .filter(Boolean)
              .join('\n')}
          </Type>
        </Section>
      </ScrollView>
    </View>
  );
}

const signed = (value: number): string => `${value > 0 ? '+' : ''}${value.toFixed(2)}`;

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Type variant="label" tone="tertiary" style={styles.sectionTitle}>
      {title}
    </Type>
    {children}
  </View>
);

const Readout = ({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) => (
  <View style={styles.readout}>
    <Type variant="body" tone={muted ? 'secondary' : 'primary'}>
      {label}
    </Type>
    <Type variant="numeric" tone={muted ? 'secondary' : 'primary'}>
      {value}
    </Type>
  </View>
);

const Divider = () => <View style={styles.divider} />;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink.deep },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingVertical: space.lg,
  },
  content: { paddingHorizontal: gutter },
  section: { marginTop: space.x3l },
  sectionTitle: { marginBottom: space.md },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  note: { marginTop: space.sm, marginBottom: space.sm },
  divider: {
    height: stroke.hairline,
    backgroundColor: color.ink.line,
    marginVertical: space.md,
  },
  choices: { gap: space.xs },
  choice: {
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.sm,
    borderWidth: stroke.hairline,
    borderColor: 'transparent',
  },
  choiceSelected: {
    backgroundColor: color.ember.wash,
    borderColor: color.ember.deep,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  choiceDetail: { marginTop: space.xxs },
  action: {
    minHeight: 48,
    justifyContent: 'center',
    marginTop: space.md,
  },
  report: {
    fontFamily: undefined,
    marginTop: space.sm,
    lineHeight: 22,
  },
});
