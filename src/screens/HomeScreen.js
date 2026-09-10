import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {c, elevation, r, t} from '../theme';
import {useLang} from '../i18n';
import {
  Avatar,
  Banner,
  Card,
  Divider,
  Icon,
  LanguageToggle,
  LegendDot,
  ProgressBar,
  Screen,
  Skeleton,
  StatusPill,
} from '../ui';
import {
  clockTime,
  currentShift,
  dateKey,
  getShift,
  resolveStatus,
  shiftLabel,
} from '../domain/shifts';

function ActionTile({icon, color, title, sub, onPress}) {
  return (
    <Card style={s.tile} onPress={onPress}>
      <Icon name={icon} size={26} color={color} />
      <Text style={s.tileTitle}>{title}</Text>
      <Text style={s.tileSub}>{sub}</Text>
    </Card>
  );
}


export default function HomeScreen({profile, ward, workers, records, leaves, lastSync, isOnline, navigate, onChangePassword, counts: serverCounts, shiftId, activeShiftId, loading}) {
  const {t: tr, lang} = useLang();
  // Show progress for the shift the backend counts are for (the ongoing one
  // during shift hours), not the app's local clock.
  const displayShiftId = shiftId || currentShift().id;
  const shift = getShift(displayShiftId);
  const dk = dateKey(new Date());

  const counts = useMemo(() => {
    let present = 0;
    let leave = 0;
    let pending = 0;
    let absent = 0;
    workers.forEach(w => {
      const {status} = resolveStatus({
        workerId: w.id,
        dk,
        shiftId: shift.id,
        records,
        leaves,
      });
      if (status === 'present') present++;
      else if (status === 'leave') leave++;
      else if (status === 'absent') absent++;
      else pending++;
    });
    return {present, leave, pending, absent, total: workers.length};
  }, [workers, records, leaves, dk, shift.id]);

  // The backend returns authoritative counts; prefer them when present.
  const view = serverCounts
    ? {
        present: serverCounts.present || 0,
        pending: serverCounts.pending || 0,
        leave: serverCounts.on_leave || 0,
        absent: 0,
        total: serverCounts.total_workers || workers.length,
      }
    : counts;

  const queued = records.filter(rec => !rec.synced).length;
  // Whether the shift we are showing progress for is the one running now.
  const shiftRunning = activeShiftId != null && activeShiftId === displayShiftId;

  const dateLabel = new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <Screen>
      <View style={s.header}>
        <Avatar name={profile.name} uri={profile.photoUri} size={46} bg={c.primary} fg="#fff" />
        <View style={{flex: 1, marginLeft: 12}}>
          <Text style={s.name} numberOfLines={1}>
            {profile.name}
          </Text>
          <Text style={t.small}>{ward.name}</Text>
        </View>
        <LanguageToggle />
      </View>
      <Divider />

      <ScrollView contentContainerStyle={s.body}>
        <Card>
          <View style={s.summaryTop}>
            <Text style={s.date}>{dateLabel}</Text>
            <StatusPill
              label={
                shiftRunning
                  ? tr('shiftInProgress', {shift: shiftLabel(tr, displayShiftId)})
                  : tr('noActiveShift')
              }
              tone={shiftRunning ? 'info' : 'neutral'}
            />
          </View>
          {loading ? (
            <View style={{paddingVertical: 6}}>
              <Skeleton width={130} height={40} radius={8} style={{marginTop: 12}} />
              <Skeleton width={'100%'} height={8} radius={4} style={{marginTop: 18}} />
              <Skeleton width={'70%'} height={12} style={{marginTop: 16}} />
            </View>
          ) : (
            <>
              <Text style={s.progressLabel}>
                {tr('shiftProgress', {shift: shiftLabel(tr, displayShiftId)})}
              </Text>
              <View style={s.countRow}>
                <Text style={s.bigCount}>{view.present}</Text>
                <Text style={s.countSub}>{tr('marked', {total: view.total})}</Text>
              </View>
              <ProgressBar value={view.present} total={view.total} />
              <View style={s.legendRow}>
                <LegendDot color={c.success} label={tr('present')} value={view.present} />
                <LegendDot color={c.textDisabled} label={tr('pending')} value={view.pending} />
                <LegendDot color={c.warning} label={tr('onLeave')} value={view.leave} />
              </View>
            </>
          )}
        </Card>

        <View style={s.grid}>
          <ActionTile
            icon="how-to-reg"
            color={c.primary}
            title={tr('markAttendance')}
            sub={
              view.total === 0
                ? tr('addWorkersFirst')
                : view.pending > 0
                ? tr('workersLeft', {n: view.pending})
                : tr('allMarked')
            }
            onPress={() => navigate('attendance')}
          />
          <ActionTile
            icon="groups"
            color={c.success}
            title={tr('manageWorkers')}
            sub={tr('addOrEditWorkers')}
            onPress={() => navigate('workers')}
          />
          <ActionTile
            icon="event-busy"
            color={c.warningStrong}
            title={tr('addLeave')}
            sub={tr('recordApprovedLeave')}
            onPress={() => navigate('addLeave')}
          />
          <ActionTile
            icon="history"
            color={c.error}
            title={tr('history')}
            sub={tr('pastAttendance')}
            onPress={() => navigate('history')}
          />
        </View>

        <Pressable onPress={() => navigate('sync')}>
          {queued > 0 || !isOnline ? (
            <Banner
              tone="warning"
              icon="cloud-off"
              title={!isOnline ? tr('youAreOffline') : undefined}
              body={tr('queuedCount', {n: queued})}
            />
          ) : (
            <Banner
              tone="success"
              icon="cloud-done"
              body={
                lastSync ? tr('allSynced', {time: clockTime(lastSync)}) : tr('nothingQueued')
              }
            />
          )}
        </Pressable>

        <Pressable onPress={onChangePassword} style={s.signOut}>
          <Text style={s.signOutText}>{tr('changePassword')}</Text>
        </Pressable>

        <Pressable onPress={() => navigate('signOut')} style={[s.signOut, {paddingTop: 0}]}>
          <Text style={s.signOutText}>{tr('signOut')}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: c.surface,
  },
  name: {fontSize: 17, fontWeight: '600', color: c.text},
  body: {padding: 16, paddingBottom: 32},

  summaryTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  date: {...t.body, color: c.textMuted, flex: 1, marginRight: 10},
  progressLabel: {...t.small, fontWeight: '700', color: c.textMuted, marginTop: 14, letterSpacing: 0.3},
  countRow: {flexDirection: 'row', alignItems: 'baseline', marginTop: 4, marginBottom: 12},
  bigCount: {fontSize: 40, fontWeight: '500', color: c.text, lineHeight: 44},
  countSub: {fontSize: 17, color: c.textMuted, marginLeft: 8},
  legendRow: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 14},

  grid: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, marginHorizontal: -6},
  tile: {width: '50%', marginHorizontal: 6, flexBasis: '46%', flexGrow: 1, marginBottom: 12, minHeight: 128},
  tileTitle: {fontSize: 16, fontWeight: '600', color: c.text, marginTop: 14},
  tileSub: {...t.small, marginTop: 3},

  signOut: {alignItems: 'center', paddingVertical: 22},
  signOutText: {color: c.primaryDark, fontSize: 14.5, fontWeight: '600'},
});
