import React, {useMemo, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {ac, ar} from '../adminTheme';
import {useLang} from '../i18n';
import {Avatar, Banner, Divider, EmptyState, FilterChip, Icon, LanguageToggle, PickerField, Screen} from '../ui';
import DatePickerSheet from '../DatePickerSheet';
import {filterWorkers, mapWorkerRows, pageSlice} from '../domain/adminWorkers';

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
  if (cell.status === 'absent') {
    return {icon: 'location-off', color: ac.redDark};
  }
  if (cell.location === 'not_verified') {
    return {icon: 'location-off', color: ac.redDark};
  }
  return {icon: 'remove', color: ac.grey600};
}

function ShiftCell({label, cell}) {
  const tone = STATUS_COLORS[cell.status];
  const ev = evidenceStyle(cell);
  const evidenceText =
    cell.status === 'present' && cell.attendanceTime ? `${cell.locationLabel} · ${cell.attendanceTime}` : cell.locationLabel;
  return (
    <View style={sc.cell}>
      <View style={sc.topRow}>
        <Text style={sc.shiftLabel} numberOfLines={1}>
          {label}
        </Text>
        <View style={{flex: 1}} />
        {cell.isLate ? <Icon name="schedule" size={14} color={ac.yellowDark} /> : null}
        <View style={[sc.statusPill, {backgroundColor: tone.bg}]}>
          <Text style={[sc.statusText, {color: tone.fg}]}>{cell.statusLabel}</Text>
        </View>
      </View>
      <View style={sc.bottomRow}>
        <Icon name={ev.icon} size={13} color={ev.color} />
        <Text style={[sc.evidenceText, {color: ev.color}]} numberOfLines={1}>
          {evidenceText}
        </Text>
        <Icon name="photo-camera" size={13} color={ac.grey600} style={{opacity: cell.hasPhoto ? 1 : 0.35, marginLeft: 4}} />
        <Icon name="place" size={13} color={ac.grey600} style={{opacity: cell.hasPhoto ? 1 : 0.35, marginLeft: 4}} />
      </View>
    </View>
  );
}

export default function AdminWorkerRecordsScreen({raw, loading, error, onRefresh, onOpenWorker, zw, day, onDayChange}) {
  const {t: tr, lang} = useLang();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [dateOpen, setDateOpen] = useState(false);
  const showZonePill = zw.zoneOptions.length > 0;

  const allRows = useMemo(() => (raw ? mapWorkerRows(raw) : []), [raw]);
  const filtered = useMemo(
    () => filterWorkers(allRows, {search, status, wardCode: zw.wardValue, zoneCode: zw.wardValue ? null : zw.zoneValue}),
    [allRows, search, status, zw.wardValue, zw.zoneValue],
  );
  const visible = pageSlice(filtered, page);

  const resetAndFilter = fn => {
    setPage(1);
    fn();
  };

  const dateLabel = raw
    ? new Date(raw.date).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-GB', {day: 'numeric', month: 'long', year: 'numeric'})
    : '';
  const dateShort = raw
    ? new Date(raw.date).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-GB', {day: 'numeric', month: 'short'})
    : '';

  if (loading && !raw) {
    return (
      <Screen bg={ac.white}>
        <View style={s.centerFill}>
          <ActivityIndicator color={ac.blue} size="large" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={s.header}>
        {searchOpen ? (
          <TextInput
            value={search}
            onChangeText={v => resetAndFilter(() => setSearch(v))}
            placeholder={tr('adminSearchWorkers')}
            placeholderTextColor={ac.grey500}
            autoFocus
            style={s.searchInput}
          />
        ) : (
          <View style={{flex: 1}}>
            <Text style={s.title}>{tr('navWorkers')}</Text>
            {raw ? <Text style={s.subtitle}>{tr('workerRecordsSubtitle', {n: raw.total_workers, date: dateLabel})}</Text> : null}
          </View>
        )}
        <Pressable
          onPress={() => {
            if (searchOpen && search) {
              resetAndFilter(() => setSearch(''));
            }
            setSearchOpen(v => !v);
          }}
          hitSlop={8}
          style={{marginLeft: 10}}>
          <Icon name={searchOpen ? 'close' : 'search'} size={22} color={ac.grey700} />
        </Pressable>
        <LanguageToggle style={{marginLeft: 10}} />
      </View>

      <View style={s.filters}>
        {error ? <Banner tone="error" icon="error-outline" body={error} /> : null}
        <View style={s.pillRow}>
          {showZonePill ? (
            <PickerField
              label={tr('filterAllZones')}
              value={zw.zoneValue}
              options={zw.zoneOptions}
              onChange={v => resetAndFilter(() => zw.setZoneValue(v))}
              allLabel={tr('filterAllZones')}
              icon={null}
              style={{flex: 1}}
            />
          ) : null}
          <PickerField
            label={tr('filterAllWards')}
            value={zw.wardValue}
            options={zw.wardOptions}
            onChange={v => resetAndFilter(() => zw.setWardValue(v))}
            allLabel={tr('filterAllWards')}
            icon={null}
            style={{flex: 1}}
          />
          <Pressable onPress={() => setDateOpen(true)} style={s.datePill}>
            <Icon name="event" size={14} color={ac.grey700} style={{marginRight: 4}} />
            <Text style={s.datePillText}>{dateShort}</Text>
          </Pressable>
        </View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={['all', 'present', 'late', 'absent', 'on_leave']}
          keyExtractor={x => x}
          contentContainerStyle={{gap: 8, paddingVertical: 4}}
          renderItem={({item}) => (
            <FilterChip
              label={item === 'all' ? tr('statusAll') : item === 'on_leave' ? tr('onLeave') : tr(item)}
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
            <View style={s.rowTop}>
              <Avatar name={w.name} size={38} bg={ac.grey100} fg={ac.grey700} />
              <View style={{flex: 1, marginLeft: 12}}>
                <Text style={s.name} numberOfLines={1}>
                  {w.name}
                </Text>
                <Text style={s.meta} numberOfLines={1}>
                  {w.designation} · {w.wardName}
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color={ac.grey500} />
            </View>
            <View style={s.shiftRow}>
              <ShiftCell label={tr('shift1')} cell={w.shift1} />
              <ShiftCell label={tr('shift2')} cell={w.shift2} />
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

      <DatePickerSheet
        visible={dateOpen}
        value={day}
        onSelect={key => {
          setDateOpen(false);
          resetAndFilter(() => onDayChange(key));
        }}
        onClose={() => setDateOpen(false)}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  centerFill: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: ac.white,
  },
  title: {fontSize: 17, fontWeight: '500', color: ac.textPrimary},
  subtitle: {fontSize: 12, color: ac.textSecondary, marginTop: 1},
  searchInput: {flex: 1, fontSize: 15, color: ac.textPrimary, padding: 0},
  filters: {paddingHorizontal: 16, paddingBottom: 6, backgroundColor: ac.white},
  pillRow: {flexDirection: 'row', gap: 6, marginBottom: 10},
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingHorizontal: 10,
    borderRadius: ar.pill,
    borderWidth: 1,
    borderColor: ac.borderStrong,
  },
  datePillText: {fontSize: 12, color: ac.textPrimary},
  row: {paddingHorizontal: 16, paddingVertical: 9, borderTopWidth: 1, borderTopColor: ac.divider},
  rowTop: {flexDirection: 'row', alignItems: 'center'},
  name: {fontSize: 14, fontWeight: '500', color: ac.textPrimary},
  meta: {fontSize: 11, color: ac.textSecondary, marginTop: 1},
  shiftRow: {flexDirection: 'row', gap: 8, marginTop: 8, marginLeft: 50},
  loadMore: {alignItems: 'center', paddingVertical: 18},
  loadMoreText: {color: ac.blueDark, fontWeight: '700', fontSize: 14},
});

const sc = StyleSheet.create({
  cell: {flex: 1, backgroundColor: ac.grey50, borderRadius: 8, padding: 7, minWidth: 0},
  topRow: {flexDirection: 'row', alignItems: 'center', gap: 5},
  shiftLabel: {fontSize: 11, fontWeight: '500', color: ac.grey800},
  statusPill: {paddingHorizontal: 8, paddingVertical: 2, borderRadius: ar.pill},
  statusText: {fontSize: 10, fontWeight: '500'},
  bottomRow: {flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4},
  evidenceText: {fontSize: 10, flex: 1, minWidth: 0},
});
