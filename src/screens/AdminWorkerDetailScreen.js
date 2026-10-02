import React, {useMemo} from 'react';
import {Image, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {ac, ar} from '../adminTheme';
import {useLang} from '../i18n';
import {Avatar, Icon, Screen} from '../ui';
import WardMapView from '../WardMapView';
import {demoWardGeo} from '../demoGeo';

const STATUS_COLORS = {
  present: {bg: ac.greenLight, fg: ac.greenDark},
  absent: {bg: ac.redLight, fg: ac.redDark},
  on_leave: {bg: ac.grey100, fg: ac.grey700},
  not_marked: {bg: ac.grey100, fg: ac.grey700},
};

function evidenceStyle(cell) {
  if (cell.location === 'inside_fence') {
    return {icon: 'check-circle', color: ac.greenDark};
  }
  if (cell.location === 'not_verified') {
    return {icon: 'location-off', color: ac.redDark};
  }
  return {icon: 'remove', color: ac.grey600};
}

function ShiftDetail({label, cell, wardCode}) {
  const {t: tr} = useLang();
  const tone = STATUS_COLORS[cell.status];
  const ev = evidenceStyle(cell);
  const evidenceText =
    cell.status === 'present' && cell.attendanceTime ? `${cell.locationLabel} · ${cell.attendanceTime}` : cell.locationLabel;
  const livePhotoOn = cell.status === 'present';

  // Demo boundary + pin — the backend has no confirmed lat/lng or ward
  // boundary field yet (see demoGeo.js). Only shown for a present shift,
  // where there is an actual capture to place a pin for.
  const geo = useMemo(
    () => (livePhotoOn ? demoWardGeo(wardCode, cell.location === 'inside_fence') : null),
    [wardCode, livePhotoOn, cell.location],
  );

  return (
    <View style={s.shiftCard}>
      <View style={s.shiftHead}>
        <Text style={s.shiftLabel}>{label}</Text>
        {cell.isLate ? (
          <View style={s.lateChip}>
            <Icon name="schedule" size={14} color={ac.yellowDark} />
            <Text style={s.lateText}>{tr('late')}</Text>
          </View>
        ) : null}
        <View style={[s.statusPill, {backgroundColor: tone.bg}]}>
          <Text style={[s.statusText, {color: tone.fg}]}>{cell.statusLabel}</Text>
        </View>
      </View>
      <View style={s.evidenceRow}>
        <Icon name={ev.icon} size={16} color={ev.color} />
        <Text style={[s.evidenceText, {color: ev.color}]}>{evidenceText}</Text>
      </View>

      <View style={s.thumbRow}>
        <View style={[s.thumb, {opacity: livePhotoOn ? 1 : 0.35}]}>
          {cell.hasPhoto ? (
            <Image source={{uri: cell.photoUrl}} style={s.thumbImg} resizeMode="cover" />
          ) : (
            <>
              <Icon name="photo-camera" size={20} color={ac.grey500} />
              <Text style={s.thumbLabel}>{tr('liveCapture')}</Text>
            </>
          )}
        </View>
        <View style={s.thumb}>
          <Icon name="person" size={20} color={ac.grey500} />
          <Text style={s.thumbLabel}>{tr('onFile')}</Text>
        </View>
      </View>

      {geo ? (
        <>
          <WardMapView boundary={geo.boundary} point={geo.point} style={{marginTop: 10}} />
          <Text style={s.coordText}>
            {geo.point.lat.toFixed(4)}, {geo.point.lng.toFixed(4)} · {tr('gpsAccuracy', {m: geo.point.accuracy})}
          </Text>
          <Text style={s.demoNote}>{tr('demoLocationNote')}</Text>
        </>
      ) : null}
    </View>
  );
}

export default function AdminWorkerDetailScreen({worker, onBack}) {
  const {t: tr} = useLang();
  return (
    <Screen bg={ac.white}>
      <View style={s.topBar}>
        <Pressable onPress={onBack} hitSlop={10} style={{padding: 8}}>
          <Icon name="arrow-back" size={24} color={ac.grey700} />
        </Pressable>
        <Text style={s.topTitle}>{tr('workerDetail')}</Text>
      </View>
      <View style={s.profile}>
        <Avatar name={worker.name} size={52} bg={ac.grey100} fg={ac.grey700} />
        <View style={{flex: 1, marginLeft: 14}}>
          <Text style={s.name}>{worker.name}</Text>
          <Text style={s.designation}>{worker.designation}</Text>
          <Text style={s.wardLine}>
            {worker.wardName} · #{worker.workerId}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.body}>
        <ShiftDetail label={tr('shift1')} cell={worker.shift1} wardCode={worker.wardCode} />
        <ShiftDetail label={tr('shift2')} cell={worker.shift2} wardCode={worker.wardCode} />

        <View style={s.footerNote}>
          <Icon name="lock" size={18} color={ac.grey600} />
          <Text style={s.footerText}>{tr('readOnlyRecord')}</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  topBar: {height: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, backgroundColor: ac.white},
  topTitle: {fontSize: 17, fontWeight: '500', color: ac.textPrimary},
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: ac.divider,
    backgroundColor: ac.white,
  },
  name: {fontSize: 17, fontWeight: '500', color: ac.textPrimary},
  designation: {fontSize: 13, color: ac.textSecondary, marginTop: 2},
  wardLine: {fontSize: 12, color: ac.textSecondary, marginTop: 1},
  body: {padding: 16, paddingBottom: 32, gap: 12},

  shiftCard: {borderWidth: 1, borderColor: ac.border, borderRadius: ar.card, padding: 14},
  shiftHead: {flexDirection: 'row', alignItems: 'center', gap: 8},
  shiftLabel: {fontSize: 15, fontWeight: '500', color: ac.textPrimary, flex: 1},
  lateChip: {flexDirection: 'row', alignItems: 'center', gap: 3},
  lateText: {fontSize: 11, fontWeight: '500', color: ac.yellowDark},
  statusPill: {paddingHorizontal: 12, paddingVertical: 4, borderRadius: ar.pill},
  statusText: {fontSize: 12, fontWeight: '500'},
  evidenceRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8},
  evidenceText: {fontSize: 12},

  thumbRow: {flexDirection: 'row', gap: 8, marginTop: 12},
  thumb: {
    width: 64,
    height: 76,
    borderRadius: 8,
    backgroundColor: ac.grey100,
    borderWidth: 1,
    borderColor: ac.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  thumbImg: {width: '100%', height: '100%', borderRadius: 8},
  thumbLabel: {fontSize: 9, color: ac.grey600},

  coordText: {fontSize: 11, color: ac.textSecondary, marginTop: 6},
  demoNote: {fontSize: 11, color: ac.yellowDark, marginTop: 2, fontStyle: 'italic'},

  footerNote: {flexDirection: 'row', gap: 10, paddingTop: 4},
  footerText: {flex: 1, fontSize: 12, color: ac.textSecondary, lineHeight: 18},
});
