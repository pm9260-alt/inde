/**
 * 調整。
 *
 * 実際の夜空と画面がずれたときに、原因を切り分けて詰めるための画面。
 * 上半分は「いま何が起きているか」、下半分は「何を動かせるか」。
 *
 * 使い方は docs/ACCURACY.md にある手順と対応している。
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { altitudeOf, azimuthOf } from '../src/astro/math';
import { makeProjection, viewingDirection } from '../src/astro/projection';
import { SKY_ENVIRONMENTS, type SkyEnvironment } from '../src/astro/visibility';
import { DEMO_MODE_AVAILABLE } from '../src/config/featureFlags';
import { color, gutter, hitSlop, radius, space, stroke } from '../src/design/tokens';
import { useObserver, useClock } from '../src/sensors/useObserver';
import { useOrientation } from '../src/sensors/useOrientation';
import { useSettings } from '../src/state/settings';
import { useSkyModel } from '../src/sky/useSkyModel';
import { compassName, moonPhaseName } from '../src/ui/format';
import { Stepper } from '../src/ui/Stepper';
import { Type } from '../src/ui/Type';

/** 読み値の更新間隔。目で追える速さでよい。 */
const READOUT_INTERVAL_MS = 200;

export default function TuneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { settings, update, reset } = useSettings();
  const observerState = useObserver();
  const now = useClock(30_000);

  const { attitudeRef, status: orientation } = useOrientation(
    observerState.declination ?? 0,
    settings.headingOffsetDeg,
    true,
  );
  const model = useSkyModel({
    kind: 'live',
    observer: observerState.observer,
    time: now,
    environment: settings.environment,
    onlyVisibleStars: settings.onlyVisibleStars,
  });

  const [aim, setAim] = useState({ azimuth: 0, altitude: 0 });
  useEffect(() => {
    const timer = setInterval(() => {
      const direction = viewingDirection(attitudeRef.current);
      setAim({ azimuth: azimuthOf(direction), altitude: altitudeOf(direction) });
    }, READOUT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [attitudeRef]);

  const projection = makeProjection({ width, height }, settings.verticalFovDeg);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Type variant="title">調整</Type>
        <Pressable onPress={() => router.back()} hitSlop={hitSlop} accessibilityRole="button">
          <Type variant="body" tone="ember">
            完了
          </Type>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.x4l }]}
        showsVerticalScrollIndicator={false}
      >
        <Section title="いま向いている先">
          <Readout label="方位" value={`${aim.azimuth.toFixed(1)}°　${compassName(aim.azimuth)}`} />
          <Readout label="高度" value={`${aim.altitude.toFixed(1)}°`} />
          <Type variant="caption" tone="tertiary" style={styles.note}>
            方位がわかっている目標（真南の建物など）に向けて、この値が合っているかを
            確かめられます。ずれていれば下の「方位の補正」で詰めてください。
          </Type>
        </Section>

        <Section title="ずれを詰める">
          <Stepper
            label="方位の補正"
            hint="右にずれて見えるならマイナスへ"
            value={settings.headingOffsetDeg}
            step={0.5}
            min={-30}
            max={30}
            format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}°`}
            onChange={(headingOffsetDeg) => update({ headingOffsetDeg })}
          />
          <Divider />
          <Stepper
            label="カメラの画角"
            hint="星の間隔が広すぎるなら小さく"
            value={settings.verticalFovDeg}
            step={0.5}
            min={40}
            max={100}
            format={(v) => `${v.toFixed(1)}°`}
            onChange={(verticalFovDeg) => update({ verticalFovDeg })}
          />
          <Readout
            label="横方向の画角"
            value={`${projection.horizontalFovDeg.toFixed(1)}°`}
            muted
          />
        </Section>

        {DEMO_MODE_AVAILABLE ? (
          <Section title="デモ">
            <Pressable
              onPress={() => update({ demoMode: !settings.demoMode })}
              style={styles.toggle}
              accessibilityRole="switch"
              accessibilityState={{ checked: settings.demoMode }}
            >
              <View style={styles.toggleLabels}>
                <Type variant="body">デモ表示</Type>
                <Type variant="caption" tone="tertiary" style={styles.note}>
                  季節も時刻も現在地も無視して、端末を空へ向けるとオリオン座が
                  現れます。昼でも屋内でも動きます。実際の夜空ではありません。
                </Type>
              </View>
              <Type variant="body" tone={settings.demoMode ? 'ember' : 'tertiary'}>
                {settings.demoMode ? '入' : '切'}
              </Type>
            </Pressable>
          </Section>
        ) : null}

        <Section title="空の明るさ">
          <View style={styles.choices}>
            {(Object.keys(SKY_ENVIRONMENTS) as SkyEnvironment[]).map((key) => {
              const selected = settings.environment === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => update({ environment: key })}
                  style={[styles.choice, selected && styles.choiceSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Type variant="body" tone={selected ? 'ember' : 'primary'}>
                    {SKY_ENVIRONMENTS[key].label}
                  </Type>
                  <Type variant="caption" tone="tertiary" style={styles.choiceDetail}>
                    {SKY_ENVIRONMENTS[key].detail}
                  </Type>
                </Pressable>
              );
            })}
          </View>
          <Divider />
          <Pressable
            onPress={() => update({ onlyVisibleStars: !settings.onlyVisibleStars })}
            style={styles.toggle}
            accessibilityRole="switch"
            accessibilityState={{ checked: settings.onlyVisibleStars }}
          >
            <View style={styles.toggleLabels}>
              <Type variant="body">見えそうな星だけを描く</Type>
              <Type variant="caption" tone="tertiary" style={styles.note}>
                切ると、肉眼では見えない暗い星もうっすら描きます
              </Type>
            </View>
            <Type variant="body" tone={settings.onlyVisibleStars ? 'ember' : 'tertiary'}>
              {settings.onlyVisibleStars ? 'する' : 'しない'}
            </Type>
          </Pressable>
        </Section>

        <Section title="いまの状態">
          <Readout
            label="この空の限界"
            value={`${model.limitingMagnitude.toFixed(1)} 等`}
            muted
          />
          <Readout
            label="太陽の高度"
            value={`${model.conditions.sunAltitude.toFixed(1)}°`}
            muted
          />
          <Readout
            label="月"
            value={
              model.conditions.moonAltitude < 0
                ? '地平線の下'
                : `${moonPhaseName(model.conditions.moonIllumination)}・高度 ${model.conditions.moonAltitude.toFixed(0)}°`
            }
            muted
          />
          <Readout
            label="観測地"
            value={`${observerState.observer.latitude.toFixed(3)}, ${observerState.observer.longitude.toFixed(3)}`}
            muted
          />
          <Readout
            label="磁気偏角"
            value={
              observerState.declination == null
                ? '取得中'
                : `${observerState.declination > 0 ? '+' : ''}${observerState.declination.toFixed(1)}°`
            }
            muted
          />
          <Readout label="姿勢の取得元" value={orientation.source ?? '—'} muted />
          <Readout
            label="磁力"
            value={`${orientation.fieldMagnitude.toFixed(1)} µT`}
            muted
          />
        </Section>

        <Pressable onPress={reset} style={styles.resetButton} accessibilityRole="button">
          <Type variant="body" tone="tertiary">
            設定を初期状態に戻す
          </Type>
        </Pressable>
      </ScrollView>
    </View>
  );
}

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
  root: {
    flex: 1,
    backgroundColor: color.ink.deep,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    paddingBottom: space.lg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: gutter,
  },
  section: {
    marginTop: space.x3l,
  },
  sectionTitle: {
    marginBottom: space.md,
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  note: {
    marginTop: space.sm,
  },
  divider: {
    height: stroke.hairline,
    backgroundColor: color.ink.line,
    marginVertical: space.sm,
  },
  choices: {
    gap: space.xs,
  },
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
  choiceDetail: {
    marginTop: space.xxs,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
    gap: space.lg,
  },
  toggleLabels: {
    flex: 1,
  },
  resetButton: {
    marginTop: space.x4l,
    minHeight: 44,
    justifyContent: 'center',
  },
});
