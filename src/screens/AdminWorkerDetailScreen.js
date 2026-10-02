import React from 'react';
import {Image, ScrollView, StyleSheet, Text, View} from 'react-native';
import {c, t} from '../theme';
import {useLang} from '../i18n';
import {AppBar, Avatar, Card, Divider, Icon, Screen, StatusPill} from '../ui';

const STATUS_TONE = {present: 'present', absent: 'absent', on_leave: 'leave', not_marked: 'neutral'};

function ShiftDetail({label, cell}) {
  return (
    <Card style={s.shiftCard}>
      <View style={s.shiftHead}>
        <Text style={s.shiftLabel}>{label}</Text>
        <StatusPill label={cell.statusLabel} tone={STATUS_TONE[cell.status]} />
      </View>
      {cell.isLate ? (
        <View style={s.lateRow}>
          <Icon name="schedule" size={16} color={c.warningStrong} />
          <Text style={s.lateText}>Late{cell.attendanceTime ? ` · ${cell.attendanceTime}` : ''}</Text>
        </View>
      ) : cell.attendanceTime ? (
        <Text style={[t.small, {marginTop: 8}]}>{cell.attendanceTime}</Text>
      ) : null}
      <View style={s.locationRow}>
        <Icon
          name={
            cell.location === 'inside_fence' ? 'check-circle' : cell.location === 'not_verified' ? 'location-off' : 'remove'
          }
          size={17}
          color={cell.location === 'inside_fence' ? c.success : cell.location === 'not_verified' ? c.error : c.textDisabled}
        />
        <Text style={[t.body, {marginLeft: 8}]}>{cell.locationLabel}</Text>
      </View>
      {cell.hasPhoto ? (
        <Image source={{uri: cell.photoUrl}} style={s.photo} resizeMode="cover" />
      ) : (
        <View style={[s.photo, s.photoEmpty]}>
          <Icon name="photo-camera" size={28} color={c.textDisabled} />
        </View>
      )}
    </Card>
  );
}

export default function AdminWorkerDetailScreen({worker, onBack}) {
  const {t: tr} = useLang();
  return (
    <Screen bg={c.surface}>
      <AppBar title={tr('workerDetail')} onBack={onBack} />
      <Divider />
      <ScrollView contentContainerStyle={s.body}>
        <View style={s.top}>
          <Avatar name={worker.name} size={56} />
          <View style={{flex: 1, marginLeft: 14}}>
            <Text style={s.name}>{worker.name}</Text>
            <Text style={t.bodyMuted}>{worker.designation}</Text>
            <Text style={t.small}>
              {worker.wardName} · #{worker.workerId}
            </Text>
          </View>
        </View>

        <ShiftDetail label={tr('shift1')} cell={worker.shift1} />
        <ShiftDetail label={tr('shift2')} cell={worker.shift2} />
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: {padding: 16, paddingBottom: 32},
  top: {flexDirection: 'row', alignItems: 'center', marginBottom: 18},
  name: {fontSize: 18, fontWeight: '600', color: c.text},
  shiftCard: {marginBottom: 14},
  shiftHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  shiftLabel: {fontSize: 14, fontWeight: '700', color: c.text},
  lateRow: {flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6},
  lateText: {fontSize: 13, fontWeight: '600', color: c.warningStrong},
  locationRow: {flexDirection: 'row', alignItems: 'center', marginTop: 12},
  photo: {width: '100%', height: 160, borderRadius: 10, marginTop: 12, backgroundColor: c.fill},
  photoEmpty: {alignItems: 'center', justifyContent: 'center'},
});
