import React, {useMemo, useState} from 'react';
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
  StatusPill,
} from '../ui';
import {dateKey, resolveStatus, shiftLabel} from '../domain/shifts';
import {formatDistance} from '../domain/geo';

export default function SelectWorkerScreen({
  workers,
  records,
  leaves,
  fence,
  shiftId,
  setShiftId,
  onPick,
  onBack,
}) {
  const {t: tr} = useLang();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const dk = dateKey(new Date());

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workers
      .map(w => ({
        worker: w,
        ...resolveStatus({workerId: w.id, dk, shiftId, records, leaves}),
      }))
      .filter(
        row =>
          !q ||
          row.worker.name.toLowerCase().includes(q) ||
          (row.worker.code || '').toLowerCase().includes(q),
      );
  }, [workers, records, leaves, dk, shiftId, query]);

  const pendingCount = rows.filter(r2 => r2.status === 'pending').length;

  const fenceTone =
    fence.state === 'inside' ? 'success' : fence.state === 'outside' ? 'error' : 'neutral';
  const fenceTitle =
    fence.state === 'inside'
      ? tr('insideGeofenceTitle')
      : fence.state === 'outside'
      ? tr('outsideGeofenceTitle')
      : tr('locatingTitle');
  const fenceBody =
    fence.state === 'outside'
      ? tr('distanceOutside', {d: formatDistance(fence.overshoot)})
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
          onPress={() => setShiftId(1)}
          style={{marginRight: 10}}
        />
        <SegmentPill
          label={tr('shift2')}
          icon="wb-twilight"
          selected={shiftId === 2}
          onPress={() => setShiftId(2)}
        />
      </View>

      <View style={{paddingHorizontal: 16}}>
        <Banner
          tone={fenceTone}
          icon={fence.state === 'outside' ? 'wrong-location' : 'my-location'}
          title={fenceTitle}
          body={fenceBody}
        />
      </View>

      <SectionLabel
        right={<Text style={s.pendingLink}>{tr('nPending', {n: pendingCount})}</Text>}>
        {tr('workersInWard', {n: workers.length})}
      </SectionLabel>
      <Divider />

      <FlatList
        data={rows}
        keyExtractor={row => row.worker.id}
        ListEmptyComponent={<EmptyState icon="groups" text={tr('noWorkersYet')} />}
        ItemSeparatorComponent={Divider}
        renderItem={({item}) => {
          const {worker, status} = item;
          const tone =
            status === 'present'
              ? 'present'
              : status === 'leave'
              ? 'leave'
              : status === 'absent'
              ? 'absent'
              : 'pending';
          const label =
            status === 'present'
              ? tr('present')
              : status === 'leave'
              ? tr('onLeave')
              : status === 'absent'
              ? tr('absent')
              : tr('pending');
          const selectable = status === 'pending' || status === 'absent';
          return (
            <Pressable
              onPress={() => selectable && onPick(worker)}
              android_ripple={{color: '#00000010'}}
              style={s.row}>
              <Avatar name={worker.name} uri={worker.photoUri} size={44} />
              <View style={{flex: 1, marginLeft: 14}}>
                <Text style={s.rowName}>{worker.name}</Text>
                <Text style={t.small}>
                  {worker.designation} · {worker.code}
                </Text>
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
