import React from 'react';
import {Image, ScrollView, StyleSheet, Text, View} from 'react-native';
import {c, r, t} from '../theme';
import {useLang} from '../i18n';
import {BottomBar, FilledButton, Icon, Screen, StatusPill, TextButton} from '../ui';
import {clockTime, shiftLabel, shiftRange} from '../domain/shifts';
import {formatDistance} from '../domain/geo';
import {localizeWorkerName} from '../localize';

function Row({label, value, valueColor, icon, last}) {
  return (
    <View style={[s.row, last && {borderBottomWidth: 0}]}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.rowValueWrap}>
        {icon ? <Icon name={icon} size={17} color={valueColor} style={{marginRight: 6}} /> : null}
        <Text style={[s.rowValue, valueColor ? {color: valueColor} : null]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function Thumb({uri, caption, fallbackIcon}) {
  return (
    <View style={{alignItems: 'center'}}>
      <View style={s.thumb}>
        {uri ? (
          <Image source={{uri}} style={s.thumbImg} />
        ) : (
          <Icon name={fallbackIcon} size={26} color={c.textMuted} />
        )}
      </View>
      <Text style={s.thumbCap}>{caption}</Text>
    </View>
  );
}

export default function VerifiedScreen({record, worker, ward, onNext, onHome}) {
  const {t: tr, lang} = useLang();
  const verified = record.verified !== false;
  const pct = Math.round((record.matchScore || 0) * 100);
  // Reflect what was actually recorded (and sent to the backend), so the success
  // screen never claims "inside" for a mark stored as outside the geo-fence.
  const inside = record.insideGeofence !== false;

  return (
    <Screen bg={c.surface}>
      <ScrollView contentContainerStyle={{paddingBottom: 10}}>
        <View style={[s.hero, !verified && {backgroundColor: c.warningContainer}]}>
          <View style={[s.heroIcon, !verified && {backgroundColor: c.warningStrong}]}>
            <Icon name={verified ? 'check' : 'info-outline'} size={34} color="#fff" />
          </View>
          <Text style={[s.heroTitle, !verified && {color: c.onWarningContainer}]}>
            {verified ? tr('identityVerified') : tr('unverified')}
          </Text>
          <Text style={[s.heroSub, !verified && {color: c.onWarningContainer}]}>
            {verified ? tr('faceMatched') : tr('demoNotice')}
          </Text>
        </View>

        <View style={s.body}>
          <View style={s.compareRow}>
            <Thumb uri={record.photoUri} caption={tr('live')} fallbackIcon="photo-camera" />
            <Icon name="compare-arrows" size={24} color={c.success} style={{marginHorizontal: 12}} />
            <Thumb uri={worker.photoUri} caption={tr('onFile')} fallbackIcon="person" />
            <View style={{flex: 1, alignItems: 'flex-end'}}>
              {verified ? (
                <>
                  <Text style={s.score}>{pct}%</Text>
                  <Text style={t.small}>{tr('matchScore')}</Text>
                </>
              ) : (
                <StatusPill label={tr('unverified')} tone="warning" />
              )}
            </View>
          </View>

          <View style={s.table}>
            <Row label={tr('worker')} value={localizeWorkerName(worker.name, tr, lang)} />
            <Row label={tr('ward')} value={ward.name} />
            <Row
              label={tr('shift')}
              value={`${shiftLabel(tr, record.shift)} · ${shiftRange(record.shift)}`}
            />
            <Row label={tr('capturedAt')} value={clockTime(record.capturedAt)} />
            <Row
              label={tr('location')}
              value={
                inside
                  ? tr('insideGeofenceTitle')
                  : record.distanceM != null
                  ? tr('outsideByDistance', {d: formatDistance(record.distanceM)})
                  : tr('outsideGeofenceTitle')
              }
              valueColor={inside ? c.onSuccessContainer : c.warningStrong}
              icon={inside ? 'check-circle' : 'wrong-location'}
              last
            />
          </View>

          <View style={s.logged}>
            <Icon name="assignment-turned-in" size={21} style={{marginRight: 12}} />
            <Text style={[t.body, {flex: 1}]}>{tr('loggedLine')}</Text>
            <StatusPill label={tr('present')} tone={verified ? 'present' : 'warning'} />
          </View>
        </View>
      </ScrollView>

      <BottomBar>
        <FilledButton label={tr('markNextWorker')} onPress={onNext} />
        <TextButton label={tr('backToHome')} onPress={onHome} style={{marginTop: 6}} />
      </BottomBar>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: {backgroundColor: c.successContainer, alignItems: 'center', paddingVertical: 30},
  heroIcon: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: c.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {fontSize: 24, fontWeight: '600', color: c.onSuccessContainer, marginTop: 16},
  heroSub: {fontSize: 14, color: c.onSuccessContainer, marginTop: 6},

  body: {padding: 20},
  compareRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 22},
  thumb: {
    width: 72,
    height: 84,
    borderRadius: 10,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.outlineSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: {width: '100%', height: '100%'},
  thumbCap: {...t.small, marginTop: 6},
  score: {fontSize: 30, fontWeight: '600', color: c.onSuccessContainer},

  table: {borderWidth: 1, borderColor: c.outlineSoft, borderRadius: r.card, overflow: 'hidden'},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.outlineSoft,
  },
  rowLabel: {...t.bodyMuted, flex: 1},
  rowValueWrap: {flexDirection: 'row', alignItems: 'center', flexShrink: 1},
  rowValue: {fontSize: 14.5, fontWeight: '600', color: c.text},

  logged: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.bg,
    borderRadius: r.card,
    padding: 14,
    marginTop: 16,
  },
});
