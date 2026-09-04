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
  SectionLabel,
  StatusPill,
} from '../ui';
import {
  clockTime,
  currentShift,
  dateKey,
  resolveStatus,
  shiftLabel,
  shiftWindowState,
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

function DemoRow({icon, label, onPress, danger}) {
  return (
    <Pressable onPress={onPress} android_ripple={{color: '#00000010'}} style={s.demoRow}>
      <Icon name={icon} size={20} color={danger ? c.error : c.primaryDark} style={{marginRight: 12}} />
      <Text style={[s.demoLabel, danger && {color: c.error}]}>{label}</Text>
    </Pressable>
  );
}

export default function HomeScreen({profile, ward, workers, records, leaves, lastSync, isOnline, navigate, onDemo, onChangePassword, counts: serverCounts}) {
  const {t: tr, lang} = useLang();
  const shift = currentShift();
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
  const hasDemo = workers.some(w => w.demo) || records.some(rec => rec.demo);
  const state = shiftWindowState(shift);
  const shiftKey =
    state === 'open' ? 'shiftInProgress' : state === 'closed' ? 'shiftClosed' : 'shiftNotStarted';

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
              label={tr(shiftKey, {shift: shiftLabel(tr, shift.id)})}
              tone={state === 'open' ? 'info' : 'neutral'}
            />
          </View>
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
            icon="person-add-alt"
            color={c.success}
            title={tr('addWorker')}
            sub={tr('oneTimeOnboarding')}
            onPress={() => navigate('addWorker')}
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

        <View style={s.demoBox}>
          <SectionLabel style={{paddingHorizontal: 0, paddingTop: 4}}>{tr('demoData')}</SectionLabel>
          <Text style={[t.small, {marginBottom: 10}]}>{tr('demoDataSub')}</Text>
          <DemoRow
            icon="group-add"
            label={tr('loadDemoWorkers')}
            onPress={() => onDemo('workers')}
          />
          <DemoRow
            icon="history"
            label={tr('loadDemoHistory')}
            onPress={() => onDemo('history')}
          />
          {hasDemo ? (
            <DemoRow
              icon="delete-outline"
              label={tr('clearDemo')}
              danger
              onPress={() => onDemo('clear')}
            />
          ) : null}
        </View>

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
  countRow: {flexDirection: 'row', alignItems: 'baseline', marginTop: 14, marginBottom: 12},
  bigCount: {fontSize: 40, fontWeight: '500', color: c.text, lineHeight: 44},
  countSub: {fontSize: 17, color: c.textMuted, marginLeft: 8},
  legendRow: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 14},

  grid: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, marginHorizontal: -6},
  tile: {width: '50%', marginHorizontal: 6, flexBasis: '46%', flexGrow: 1, marginBottom: 12, minHeight: 128},
  tileTitle: {fontSize: 16, fontWeight: '600', color: c.text, marginTop: 14},
  tileSub: {...t.small, marginTop: 3},

  demoBox: {
    marginTop: 16,
    backgroundColor: c.surface,
    borderRadius: r.card,
    borderWidth: 1,
    borderColor: c.outlineSoft,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  demoRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 13},
  demoLabel: {fontSize: 14.5, color: c.primaryDark, fontWeight: '600'},
  signOut: {alignItems: 'center', paddingVertical: 22},
  signOutText: {color: c.primaryDark, fontSize: 14.5, fontWeight: '600'},
});
