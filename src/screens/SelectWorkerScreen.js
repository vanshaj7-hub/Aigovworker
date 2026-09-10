import React, {useEffect, useMemo, useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {c, r, t} from '../theme';
import {useLang} from '../i18n';
import {
  AppBar,
  Avatar,
  Banner,
  Divider,
  EmptyState,
  Icon,
  Screen,
  SectionLabel,
  SegmentPill,
  SkeletonList,
  StatusPill,
} from '../ui';
import {dateKey, resolveStatus} from '../domain/shifts';
import {formatDistance} from '../domain/geo';
import {localizeDesignation, localizeWorkerName} from '../localize';

export default function SelectWorkerScreen({
  workers,
  records,
  leaves,
  failed,
  fence,
  shiftId,
  setShiftId,
  ongoingShiftId,
  loading,
  onPick,
  onBack,
}) {
  const {t: tr, lang} = useLang();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const dk = dateKey(new Date());

  // Attendance may only be marked while a shift the backend reports as open is
  // running. Between shifts `ongoingShiftId` is null and marking is closed.
  const hasOngoing = ongoingShiftId != null;

  // Pin the selected shift to whichever one is running right now.
  useEffect(() => {
    if (hasOngoing && shiftId !== ongoingShiftId) {
      setShiftId(ongoingShiftId);
    }
  }, [ongoingShiftId, hasOngoing, shiftId, setShiftId]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workers
      .map(w => {
        // Backend workers carry their own status; local ones are resolved from records.
        const backendStatus = w.attendanceStatus
          ? {status: w.attendanceStatus === 'on_leave' ? 'leave' : w.attendanceStatus}
          : null;
        const resolved = backendStatus || resolveStatus({workerId: w.id, dk, shiftId, records, leaves});
        // A failed verification this session shows as Absent, but stays retryable.
        const status =
          resolved.status === 'pending' && failed && failed[w.id] ? 'absent' : resolved.status;
        return {worker: w, ...resolved, status};
      })
      .filter(
        row =>
          !q ||
          row.worker.name.toLowerCase().includes(q) ||
          (row.worker.code || '').toLowerCase().includes(q),
      );
  }, [workers, records, leaves, failed, dk, shiftId, query]);

  const pendingCount = rows.filter(r2 => r2.status === 'pending').length;

  const fenceTone =
    fence.state === 'inside' ? 'success' : fence.state === 'outside' ? 'error' : 'neutral';
  const fenceTitle =
    fence.state === 'inside'
      ? tr('insideGeofenceTitle')
      : fence.state === 'outside'
      ? tr('outsideGeofenceTitle')
      : tr('locatingTitle');
  // A very wide accuracy circle means the fix cannot be trusted for the fence.
  const poorAccuracy = fence.accuracy != null && fence.accuracy > 100;
  const fenceBody =
    fence.state === 'outside'
      ? tr('distanceOutside', {d: formatDistance(fence.overshoot)})
      : poorAccuracy
      ? tr('accuracyPoor', {m: Math.round(fence.accuracy)})
      : fence.accuracy != null
      ? tr('accuracyLocked', {m: Math.round(fence.accuracy)})
      : tr('accuracySearching');

  return (
    <Screen bg={c.surface}>
      <AppBar
        title={tr('markAttendance')}
        onBack={onBack}
        right={
          <Pressable onPress={() => setSearching(v => !v)} hitSlop={12}>
            <Icon name="search" size={24} color={c.text} />
          </Pressable>
        }
      />
      {searching ? (
        <View style={s.searchWrap}>
          <Icon name="search" size={20} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={tr('searchWorkers')}
            placeholderTextColor={c.textMuted}
            style={s.searchInput}
          />
        </View>
      ) : null}

      <View style={s.shiftRow}>
        <SegmentPill
          label={tr('shift1')}
          icon="wb-sunny"
          selected={shiftId === 1}
          disabled={!hasOngoing || ongoingShiftId !== 1}
          onPress={() => hasOngoing && ongoingShiftId === 1 && setShiftId(1)}
          style={{marginRight: 10}}
        />
        <SegmentPill
          label={tr('shift2')}
          icon="wb-twilight"
          selected={shiftId === 2}
          disabled={!hasOngoing || ongoingShiftId !== 2}
          onPress={() => hasOngoing && ongoingShiftId === 2 && setShiftId(2)}
        />
      </View>

      <View style={{paddingHorizontal: 16}}>
        {hasOngoing ? (
          <Banner
            tone={fenceTone}
            icon={fence.state === 'outside' ? 'wrong-location' : 'my-location'}
            title={fenceTitle}
            body={fenceBody}
          />
        ) : (
          <Banner
            tone="warning"
            icon="schedule"
            title={tr('noOngoingShift')}
            body={tr('shiftHoursBody')}
          />
        )}
      </View>

      <SectionLabel
        right={<Text style={s.pendingLink}>{tr('nPending', {n: pendingCount})}</Text>}>
        {tr('workersInWard', {n: workers.length})}
      </SectionLabel>
      <Divider />

      {loading ? (
        <SkeletonList n={6} />
      ) : (
      <FlatList
        data={rows}
        keyExtractor={row => row.worker.id}
        ListEmptyComponent={<EmptyState icon="groups" text={tr('noWorkersYet')} />}
        ItemSeparatorComponent={Divider}
        renderItem={({item}) => {
          const {worker, status} = item;
          // A backend worker with no reference photo yet (onboarding_completed=0)
          // must be onboarded before attendance — flag it and route the tap to the
          // photo-capture flow instead of the mark-attendance camera.
          const needsOnboarding =
            worker.onboardingCompleted === false && (status === 'pending' || status === 'absent');
          const tone = needsOnboarding
            ? 'warning'
            : status === 'present'
            ? 'present'
            : status === 'leave'
            ? 'leave'
            : status === 'absent'
            ? 'absent'
            : 'pending';
          const label = needsOnboarding
            ? tr('addPhoto')
            : status === 'present'
            ? tr('present')
            : status === 'leave'
            ? tr('onLeave')
            : status === 'absent'
            ? tr('absent')
            : tr('pending');
          // Only markable/onboardable while a shift is running.
          const selectable = (status === 'pending' || status === 'absent') && hasOngoing;
          return (
            <Pressable
              onPress={() => selectable && onPick(worker)}
              android_ripple={{color: '#00000010'}}
              style={s.row}>
              <Avatar name={localizeWorkerName(worker.name, tr, lang)} uri={worker.photoUri} size={44} />
              <View style={{flex: 1, marginLeft: 14}}>
                <Text style={s.rowName}>{localizeWorkerName(worker.name, tr, lang)}</Text>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <Text style={t.small}>
                    {localizeDesignation(worker.designation, tr)} · {worker.code}
                  </Text>
                  {worker.demo ? (
                    <StatusPill label={tr('demoBadge')} tone="info" style={{marginLeft: 8, paddingVertical: 2}} />
                  ) : null}
                </View>
              </View>
              <StatusPill label={label} tone={tone} />
              <Icon
                name="chevron-right"
                size={22}
                color={selectable ? c.textMuted : c.outlineSoft}
                style={{marginLeft: 6}}
              />
            </Pressable>
          );
        }}
      />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: r.pill,
    backgroundColor: c.fill,
  },
  searchInput: {flex: 1, marginLeft: 10, fontSize: 15, color: c.text, padding: 0},
  shiftRow: {flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14},
  pendingLink: {color: c.primaryDark, fontSize: 13.5, fontWeight: '600'},
  row: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14},
  rowName: {fontSize: 16, fontWeight: '600', color: c.text},
});
