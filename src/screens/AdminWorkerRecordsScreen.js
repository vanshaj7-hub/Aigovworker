import React, {useMemo, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {c, t} from '../theme';
import {useLang} from '../i18n';
import {
  Avatar,
  Banner,
  Divider,
  EmptyState,
  Field,
  FilterChip,
  Icon,
  LanguageToggle,
  PickerField,
  Screen,
  StatusPill,
} from '../ui';
import {filterWorkers, mapWorkerRows, pageSlice} from '../domain/adminWorkers';

const STATUS_TONE = {present: 'present', absent: 'absent', on_leave: 'leave', not_marked: 'neutral'};

function ShiftCell({label, cell}) {
  return (
    <View style={sc.cell}>
      <Text style={sc.shiftLabel}>{label}</Text>
      <View style={sc.topRow}>
        <StatusPill label={cell.statusLabel} tone={STATUS_TONE[cell.status]} />
        {cell.isLate ? (
          <View style={sc.lateBadge}>
            <Icon name="schedule" size={12} color={c.warningStrong} />
            <Text style={sc.lateText}>Late</Text>
          </View>
        ) : null}
        {cell.attendanceTime ? <Text style={sc.time}>{cell.attendanceTime}</Text> : null}
      </View>
      <View style={sc.bottomRow}>
        <Icon
          name={
            cell.location === 'inside_fence' ? 'check-circle' : cell.location === 'not_verified' ? 'location-off' : 'remove'
          }
          size={14}
          color={cell.location === 'inside_fence' ? c.success : cell.location === 'not_verified' ? c.error : c.textDisabled}
        />
        <Text style={sc.locationLabel} numberOfLines={1}>
          {cell.locationLabel}
        </Text>
        <Icon name="photo-camera" size={14} color={c.textMuted} style={{opacity: cell.hasPhoto ? 1 : 0.35, marginLeft: 8}} />
        <Icon name="place" size={14} color={c.textMuted} style={{opacity: cell.hasPhoto ? 1 : 0.35, marginLeft: 4}} />
      </View>
    </View>
  );
}

export default function AdminWorkerRecordsScreen({raw, loading, error, onRefresh, onOpenWorker, zw}) {
  const {t: tr, lang} = useLang();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);

  const allRows = useMemo(() => (raw ? mapWorkerRows(raw) : []), [raw]);
  const filtered = useMemo(() => {
    const byFilter =
      zw.kind === 'zone'
        ? {zoneCode: zw.value}
        : {wardCode: zw.value};
    return filterWorkers(allRows, {search, status, ...byFilter});
  }, [allRows, search, status, zw.value, zw.kind]);
  const visible = pageSlice(filtered, page);

  const resetAndFilter = fn => {
    setPage(1);
    fn();
  };

  const dateLabel = raw
    ? new Date(raw.date).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  if (loading && !raw) {
    return (
      <Screen bg={c.surface}>
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
          <ActivityIndicator color={c.primary} size="large" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={s.header}>
        <View style={{flex: 1}}>
          <Text style={s.title}>{tr('workerRecords')}</Text>
          {raw ? (
            <Text style={t.small}>{tr('workerRecordsSubtitle', {n: raw.total_workers, date: dateLabel})}</Text>
          ) : null}
        </View>
        <LanguageToggle />
      </View>
      <Divider />

      <View style={s.filters}>
        {error ? <Banner tone="error" icon="error-outline" body={error} /> : null}
        <Field
          label={tr('adminSearchWorkers')}
          value={search}
          onChangeText={v => resetAndFilter(() => setSearch(v))}
          icon="search"
        />
        {zw.options.length > 0 ? (
          <PickerField
            label={zw.kind === 'zone' ? tr('filterAllZones') : tr('filterAllWards')}
            value={zw.value}
            options={zw.options}
            onChange={v => resetAndFilter(() => zw.setValue(v))}
            allLabel={zw.kind === 'zone' ? tr('filterAllZones') : tr('filterAllWards')}
          />
        ) : null}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={['all', 'present', 'late', 'absent', 'on_leave']}
          keyExtractor={x => x}
          contentContainerStyle={{gap: 8, paddingBottom: 4}}
          renderItem={({item}) => (
            <FilterChip
              label={
                item === 'all'
                  ? tr('statusAll')
                  : item === 'on_leave'
                  ? tr('onLeave')
                  : tr(item)
              }
              selected={status === item}
              onPress={() => resetAndFilter(() => setStatus(item))}
            />
          )}
        />
      </View>

      <FlatList
        data={visible}
        keyExtractor={w => w.workerId}
        ListEmptyComponent={<EmptyState icon="groups" text={tr('noWorkersFound')} />}
        ItemSeparatorComponent={Divider}
        contentContainerStyle={{paddingBottom: 24}}
        renderItem={({item: w}) => (
          <Pressable onPress={() => onOpenWorker(w)} android_ripple={{color: '#00000010'}} style={s.row}>
            <Avatar name={w.name} size={44} />
            <View style={{flex: 1, marginLeft: 14}}>
              <Text style={s.name}>{w.name}</Text>
              <Text style={t.small}>
                {w.designation} · {w.wardName}
              </Text>
              <View style={s.shiftRow}>
                <ShiftCell label={tr('shift1')} cell={w.shift1} />
                <ShiftCell label={tr('shift2')} cell={w.shift2} />
              </View>
            </View>
          </Pressable>
        )}
        ListFooterComponent={
          filtered.length > visible.length ? (
            <Pressable onPress={() => setPage(p => p + 1)} style={s.loadMore}>
              <Text style={s.loadMoreText}>{tr('loadMore')}</Text>
            </Pressable>
          ) : null
        }
        onRefresh={onRefresh}
        refreshing={!!loading && !!raw}
      />
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
  title: {fontSize: 17, fontWeight: '600', color: c.text},
  filters: {paddingHorizontal: 16, paddingTop: 12, backgroundColor: c.surface},
  row: {paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'flex-start'},
  name: {fontSize: 15.5, fontWeight: '600', color: c.text},
  shiftRow: {flexDirection: 'row', gap: 10, marginTop: 10},
  loadMore: {alignItems: 'center', paddingVertical: 18},
  loadMoreText: {color: c.primaryDark, fontWeight: '700', fontSize: 14},
});

const sc = StyleSheet.create({
  cell: {flex: 1, backgroundColor: c.fill, borderRadius: 10, padding: 8},
  shiftLabel: {fontSize: 10.5, fontWeight: '700', color: c.textMuted, marginBottom: 4},
  topRow: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6},
  lateBadge: {flexDirection: 'row', alignItems: 'center', gap: 3},
  lateText: {fontSize: 10.5, fontWeight: '700', color: c.warningStrong},
  time: {fontSize: 11, color: c.textMuted},
  bottomRow: {flexDirection: 'row', alignItems: 'center', marginTop: 6},
  locationLabel: {fontSize: 10.5, color: c.textMuted, marginLeft: 4, flexShrink: 1},
});
