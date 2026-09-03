import React from 'react';
import {Alert, ScrollView, StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Line, Path, Rect} from 'react-native-svg';
import {c, r, t} from '../theme';
import {useLang} from '../i18n';
import {Banner, BottomBar, FilledButton, Icon, OutlinedButton, Screen} from '../ui';
import {formatDistance} from '../domain/geo';
import {reportBoundaryIssue} from '../storage';

/** Schematic of the ward fence and the device's position relative to it. */
function FenceMap({wardLabel, youLabel, distanceLabel}) {
  const W = 300;
  const H = 150;
  return (
    <View style={s.map}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Rect x="0" y="0" width={W} height={H} fill={c.bg} />
        {[1, 2, 3, 4, 5].map(i => (
          <Line key={'v' + i} x1={(W / 6) * i} y1="0" x2={(W / 6) * i} y2={H} stroke={c.outlineSoft} strokeWidth="1" />
        ))}
        {[1, 2].map(i => (
          <Line key={'h' + i} x1="0" y1={(H / 3) * i} x2={W} y2={(H / 3) * i} stroke={c.outlineSoft} strokeWidth="1" />
        ))}
        <Rect
          x="22"
          y="24"
          width="148"
          height="100"
          rx="10"
          fill="#D2E3FC66"
          stroke={c.primary}
          strokeWidth="2"
          strokeDasharray="7 5"
        />
        <Circle cx="238" cy="66" r="11" fill={c.error} />
        <Circle cx="238" cy="63" r="4" fill="#fff" />
        <Path d="M238 77 l-6 -8 h12 z" fill={c.error} />
      </Svg>
      <Text style={[s.mapTag, {left: 32, top: 34, color: c.primaryDeep}]}>{wardLabel}</Text>
      <Text style={[s.mapTag, s.mapYou]}>{youLabel}</Text>
      <View style={s.mapChip}>
        <Text style={s.mapChipText}>{distanceLabel}</Text>
      </View>
    </View>
  );
}

export default function GeofenceBreachScreen({ward, fence, onRetry, onBack, onRecentre, movedAfterMatch}) {
  const {t: tr} = useLang();
  const dist = formatDistance(fence.overshoot);

  const report = async () => {
    await reportBoundaryIssue({
      wardCode: ward.code,
      distance: fence.overshoot,
      position: fence.position || null,
    });
    Alert.alert(tr('boundaryReported'), tr('boundaryReportedBody', {ward: ward.shortName}));
  };

  return (
    <Screen bg={c.surface}>
      <ScrollView contentContainerStyle={{paddingBottom: 10}}>
        <View style={s.hero}>
          <View style={s.heroIcon}>
            <Icon name="wrong-location" size={32} color="#fff" />
          </View>
          <Text style={s.heroTitle}>
            {movedAfterMatch ? tr('movedOutside') : tr('outsideGeofenceTitle')}
          </Text>
          <Text style={s.heroSub}>
            {movedAfterMatch
              ? tr('movedOutsideBody')
              : tr('geofenceBreachBody', {ward: ward.shortName})}
          </Text>
        </View>

        <View style={s.body}>
          <FenceMap
            wardLabel={ward.shortName}
            youLabel={tr('you')}
            distanceLabel={tr('fromBoundary', {d: dist})}
          />

          <Banner
            tone="warning"
            icon="warning-amber"
            body={tr('absentWarning')}
            style={{marginTop: 16}}
          />

          <View style={s.steps}>
            <Text style={[t.label, {marginBottom: 12}]}>{tr('whatToDo')}</Text>
            {[tr('step1'), tr('step2'), tr('step3')].map((line, i) => (
              <View key={i} style={s.stepRow}>
                <Text style={s.stepNum}>{i + 1}.</Text>
                <Text style={[t.body, {flex: 1, lineHeight: 21}]}>{line}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <BottomBar>
        <FilledButton label={tr('retry')} icon="refresh" onPress={onRetry} />
        <OutlinedButton label={tr('reportBoundary')} onPress={report} style={{marginTop: 10}} />
        {onRecentre ? (
          <>
            <OutlinedButton
              label={tr('recentreWard')}
              onPress={async () => {
                const ok = await onRecentre();
                if (ok) {
                  Alert.alert(tr('assignedWard'), tr('recentreDone'));
                }
              }}
              style={{marginTop: 10}}
            />
            <Text style={s.recentreNote}>{tr('recentreNote')}</Text>
          </>
        ) : null}
      </BottomBar>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: {backgroundColor: c.errorContainer, alignItems: 'center', paddingVertical: 28, paddingHorizontal: 26},
  heroIcon: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: c.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {fontSize: 23, fontWeight: '600', color: c.onErrorContainer, marginTop: 16, textAlign: 'center'},
  heroSub: {fontSize: 14, color: c.onErrorContainer, marginTop: 8, textAlign: 'center', lineHeight: 20},

  body: {padding: 20},
  map: {
    borderRadius: r.card,
    borderWidth: 1,
    borderColor: c.outlineSoft,
    overflow: 'hidden',
    backgroundColor: c.bg,
  },
  mapTag: {position: 'absolute', fontSize: 12, fontWeight: '600'},
  mapYou: {right: 26, top: 92, color: c.onErrorContainer},
  mapChip: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    backgroundColor: c.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.outlineSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  mapChipText: {fontSize: 12, color: c.text},

  steps: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: c.outlineSoft,
    borderRadius: r.card,
    padding: 16,
  },
  stepRow: {flexDirection: 'row', marginBottom: 10},
  stepNum: {color: c.primaryDark, fontWeight: '600', width: 22, fontSize: 14},
  recentreNote: {...t.small, textAlign: 'center', marginTop: 10, lineHeight: 17},
});
