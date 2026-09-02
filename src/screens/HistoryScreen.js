import React, {useMemo, useState} from 'react';
import {FlatList, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {c, r, t} from '../theme';
import {useLang} from '../i18n';
import {
  AppBar,
  Avatar,
  Divider,
  EmptyState,
  FilterChip,
  Icon,
  Screen,
  StatusDot,
} from '../ui';
import {dateKey, resolveStatus, timeOfDay} from '../domain/shifts';

const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

function StatTile({value, label, tone}) {
  const map = {
    present: {bg: c.successContainer, fg: c.onSuccessContainer},
    absent: {bg: c.errorContainer, fg: c.onErrorContainer},
    leave: {bg: c.warningContainer, fg: c.onWarningContainer},
  };
  const p = map[tone];
  return (
    <View style={[s.tile, {backgroundColor: p.bg}]}>
      <Text style={[s.tileValue, {color: p.fg}]}>{value}</Text>
      <Text style={[s.tileLabel, {color: p.fg}]}>{label}</Text>
    </View>
  );
}

export default function HistoryScreen({workers, records, leaves, onBack}) {
  const {t: tr, lang} = useLang();
  const now = new Date();
  const [month, setMonth] = useState(monthKey(now));
  const [shiftFilter, setShiftFilter] = useState('both'); // both | 1 | 2
  const [workerId, setWorkerId] = useState(null);
  const [monthOpen, setMonthOpen] = useState(false);
  const [workerOpen, setWorkerOpen] = useState(false);

  const months = useMemo(() => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({
        key: monthKey(d),
        label: d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-GB', {
          month: 'short',
          year: 'numeric',
        }),
      });
    }
    return out;
  }, [lang]);

  const dayList = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    const todayKey = dateKey(now);
    const days = [];
    for (let d = last; d >= 1; d--) {
      const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (key > todayKey) {
        continue;
      }
      days.push(key);
    }
    return days;
  }, [month]);

  const shownWorkers = workerId ? workers.filter(w => w.id === workerId) : workers;

  const rows = useMemo(() => {
    const out = [];
    dayList.forEach(dk => {
      const entries = shownWorkers.map(w => {
        const s1 = resolveStatus({workerId: w.id, dk, shiftId: 1, records, leaves});
        const s2 = resolveStatus({workerId: w.id, dk, shiftId: 2, records, leaves});
        return {worker: w, s1, s2};
      });
      const relevant = entries.filter(e => {
        if (shiftFilter === 1) return e.s1.status !== 'pending';
        if (shiftFilter === 2) return e.s2.status !== 'pending';
        return e.s1.status !== 'pending' || e.s2.status !== 'pending';
      });
      if (relevant.length) {
        out.push({type: 'header', dk});
        relevant.forEach(e => out.push({type: 'row', dk, ...e}));
      }
    });
    return out;
  }, [dayList, shownWorkers, records, leaves, shiftFilter]);

  const totals = useMemo(() => {
    let present = 0;
    let absent = 0;
    let leave = 0;
    rows
      .filter(x => x.type === 'row')
      .forEach(e => {
        [e.s1, e.s2].forEach((st, i) => {
          if (shiftFilter !== 'both' && shiftFilter !== i + 1) {
            return;
          }
          if (st.status === 'present') present++;
          else if (st.status === 'absent') absent++;
          else if (st.status === 'leave') leave++;
        });
      });
    return {present, absent, leave};
  }, [rows, shiftFilter]);

  const dotFor = st => {
    if (st.status === 'present') return {letter: 'P', tone: 'present'};
    if (st.status === 'absent') return {letter: 'A', tone: 'absent'};
    if (st.status === 'leave') return {letter: 'L', tone: 'leave'};
    return {letter: '·', tone: 'pending'};
  };

  const monthLabel = months.find(m => m.key === month)?.label || month;
  const workerLabel = workerId
    ? workers.find(w => w.id === workerId)?.name || tr('allWorkers')
    : tr('allWorkers');
  const shiftLabelText =
    shiftFilter === 'both' ? tr('bothShifts') : shiftFilter === 1 ? tr('shift1') : tr('shift2');

  return (
    <Screen bg={c.surface}>
      <AppBar
        title={tr('attendanceHistory')}
        onBack={onBack}
        right={<Icon name="tune" size={24} color={c.text} />}
      />

      <View style={s.chipRow}>
        <FilterChip label={monthLabel} selected onPress={() => setMonthOpen(true)} />
        <FilterChip label={workerLabel} onPress={() => setWorkerOpen(true)} />
        <FilterChip
          label={shiftLabelText}
          onPress={() =>
            setShiftFilter(v => (v === 'both' ? 1 : v === 1 ? 2 : 'both'))
          }
        />
      </View>

      <View style={s.tiles}>
        <StatTile value={totals.present} label={tr('present')} tone="present" />
        <StatTile value={totals.absent} label={tr('absent')} tone="absent" />
        <StatTile value={totals.leave} label={tr('onLeave')} tone="leave" />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item, i) => (item.type === 'header' ? 'h' + item.dk : item.dk + item.worker.id)}
        ListEmptyComponent={<EmptyState icon="event-note" text={tr('noRecords')} />}
        renderItem={({item}) => {
          if (item.type === 'header') {
            const d = new Date(item.dk + 'T00:00:00');
            const isToday = item.dk === dateKey(now);
            const label = d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-GB', {
              day: 'numeric',
              month: 'long',
            });
            return (
              <View style={s.dayHeader}>
                <Text style={s.dayLabel}>{isToday ? `${tr('today')} · ${label}` : label}</Text>
                <Text style={t.small}>S1 / S2</Text>
              </View>
            );
          }
          const {worker, s1, s2} = item;
          const d1 = dotFor(s1);
          const d2 = dotFor(s2);
          const sub =
            s1.status === 'leave' || s2.status === 'leave'
              ? `${tr((s1.leave || s2.leave).type)} · ${tr('onLeave')}`
              : `${s1.record ? timeOfDay(s1.record.capturedAt) : '—'} · ${
                  s2.record ? timeOfDay(s2.record.capturedAt) : '—'
                }`;
          return (
            <View style={s.row}>
              <Avatar name={worker.name} uri={worker.photoUri} size={40} />
              <View style={{flex: 1, marginLeft: 14}}>
                <Text style={s.rowName}>{worker.name}</Text>
                <Text style={t.small}>{sub}</Text>
              </View>
              <StatusDot {...d1} />
              <View style={{width: 8}} />
              <StatusDot {...d2} />
            </View>
          );
        }}
        ItemSeparatorComponent={({leadingItem}) =>
          leadingItem && leadingItem.type === 'row' ? <Divider /> : null
        }
      />

      <PickSheet
        visible={monthOpen}
        title={tr('history')}
        options={months.map(m => ({key: m.key, label: m.label}))}
        selected={month}
        onSelect={k => {
          setMonth(k);
          setMonthOpen(false);
        }}
        onClose={() => setMonthOpen(false)}
      />
      <PickSheet
        visible={workerOpen}
        title={tr('allWorkers')}
        options={[{key: '__all', label: tr('allWorkers')}].concat(
          workers.map(w => ({key: w.id, label: w.name})),
        )}
        selected={workerId || '__all'}
        onSelect={k => {
          setWorkerId(k === '__all' ? null : k);
          setWorkerOpen(false);
        }}
        onClose={() => setWorkerOpen(false)}
      />
    </Screen>
  );
}

function PickSheet({visible, title, options, selected, onSelect, onClose}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalBg} onPress={onClose}>
        <View style={s.sheet}>
          <Text style={[t.label, {marginBottom: 6}]}>{title}</Text>
          {options.map(o => (
            <Pressable key={o.key} onPress={() => onSelect(o.key)} style={s.sheetRow}>
              <Text style={[t.body, {flex: 1, fontSize: 16}]}>{o.label}</Text>
              {selected === o.key ? <Icon name="check" size={20} color={c.primary} /> : null}
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  chipRow: {flexDirection: 'row', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14},
  tiles: {flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16},
  tile: {flex: 1, borderRadius: r.card, padding: 14, marginRight: 10},
  tileValue: {fontSize: 26, fontWeight: '600'},
  tileLabel: {fontSize: 13, marginTop: 2},

  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: c.surface,
  },
  dayLabel: {fontSize: 14.5, fontWeight: '600', color: c.text},
  row: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12},
  rowName: {fontSize: 15.5, fontWeight: '600', color: c.text},

  modalBg: {flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end'},
  sheet: {backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20},
  sheetRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 14},
});
