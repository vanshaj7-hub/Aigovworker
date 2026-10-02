import React, {useMemo, useState} from 'react';
import {ActivityIndicator, ScrollView, StyleSheet, Text, View} from 'react-native';
import {c, t} from '../theme';
import {useLang} from '../i18n';
import {Banner, Card, Divider, Field, FilterChip, Icon, LanguageToggle, Screen, SegmentPill} from '../ui';
import DatePickerSheet from '../DatePickerSheet';
import {heatColor, mapWardMap, wardFlag} from '../domain/wardMap';

const FLAG_ICON = {vacantSupervisor: 'person-off', noAttendance: 'block', lowPct: 'trending-down'};

function WardTile({cell}) {
  const {bg, text} = heatColor(cell.pct);
  const flag = wardFlag(cell);
  return (
    <View style={[s.tile, {backgroundColor: bg}]}>
      {flag ? <Icon name={FLAG_ICON[flag]} size={14} color={text} style={s.tileFlag} /> : null}
      <Text style={[s.tileWard, {color: text}]} numberOfLines={1}>
        {cell.wardName}
      </Text>
      <Text style={[s.tilePct, {color: text}]}>{cell.pct}%</Text>
    </View>
  );
}

function SummaryRow({color, label, value}) {
  return (
    <View style={s.summaryRow}>
      <View style={[s.summaryDot, {backgroundColor: color}]} />
      <Text style={[t.body, {flex: 1}]}>{label}</Text>
      <Text style={s.summaryValue}>{value}</Text>
    </View>
  );
}

export default function AdminWardMapScreen({user, raw, loading, error, fromDate, toDate, onDateChange}) {
  const {t: tr} = useLang();
  const [shiftFilter, setShiftFilter] = useState('both');
  const [viewMode, setViewMode] = useState('grid');
  const [activeZone, setActiveZone] = useState(null);
  const [dateTarget, setDateTarget] = useState(null); // null | 'from' | 'to'

  const dash = useMemo(() => (raw ? mapWardMap(raw, shiftFilter) : null), [raw, shiftFilter]);

  if (loading && !dash) {
    return (
      <Screen bg={c.surface}>
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
          <ActivityIndicator color={c.primary} size="large" />
        </View>
      </Screen>
    );
  }

  const flatCells = dash ? dash.zones.flatMap(z => z.cells) : [];

  return (
    <Screen>
      <View style={s.header}>
        <Text style={s.title}>{tr('wardMap')}</Text>
        <LanguageToggle />
      </View>
      <Divider />

      <ScrollView contentContainerStyle={s.body}>
        {error ? <Banner tone="error" icon="error-outline" body={error} /> : null}

        <View style={s.dateRow}>
          <Field label={tr('fromDate')} value={fromDate} onPress={() => setDateTarget('from')} style={{flex: 1, marginRight: 8}} />
          <Field label={tr('toDate')} value={toDate} onPress={() => setDateTarget('to')} style={{flex: 1}} />
        </View>

        <View style={s.pillRow}>
          <SegmentPill label={tr('shiftBoth')} icon="schedule" selected={shiftFilter === 'both'} onPress={() => setShiftFilter('both')} />
          <SegmentPill label={tr('shift1')} icon="wb-sunny" selected={shiftFilter === 1} onPress={() => setShiftFilter(1)} />
          <SegmentPill label={tr('shift2')} icon="wb-twilight" selected={shiftFilter === 2} onPress={() => setShiftFilter(2)} />
        </View>

        {dash ? (
          <>
            <Card>
              <SummaryRow color="#137333" label={tr('aboveNinety')} value={dash.summary.above90} />
              <SummaryRow color={c.success} label={tr('eightyToNinety')} value={dash.summary.between80and90} />
              <SummaryRow color={c.warning} label={tr('belowEighty')} value={dash.summary.below80} />
              <SummaryRow color={c.textDisabled} label={tr('notReporting')} value={dash.summary.wardsNotReporting} />
            </Card>

            {dash.attention.length > 0 ? (
              <>
                <Text style={[t.label, s.sectionLabel]}>{tr('needsAttention')}</Text>
                {dash.attention.map(a => (
                  <Card key={a.wardNumber} style={s.attentionRow}>
                    <View style={{flex: 1}}>
                      <Text style={s.wardName}>{a.wardName}</Text>
                      <Text style={t.small}>
                        {a.zone} · {a.supervisor}
                      </Text>
                      <Text style={[t.small, {color: c.error, marginTop: 2}]}>
                        {tr('underPctForDays', {n: dash.attentionWindowDays})}
                      </Text>
                    </View>
                    <Text style={s.attentionPct}>{a.presentPct}%</Text>
                  </Card>
                ))}
              </>
            ) : null}

            <View style={s.pillRow}>
              <FilterChip label={tr('viewGrid')} selected={viewMode === 'grid'} onPress={() => setViewMode('grid')} />
              <FilterChip label={tr('viewZoneRows')} selected={viewMode === 'zoneRows'} onPress={() => setViewMode('zoneRows')} />
              <FilterChip label={tr('viewRanked')} selected={viewMode === 'ranked'} onPress={() => setViewMode('ranked')} />
            </View>

            {viewMode === 'grid' ? (
              user.role === 'department_head' ? (
                dash.zones.map(z => (
                  <View key={z.zoneId} style={{marginBottom: 16}}>
                    <View style={s.zoneHeadRow}>
                      <Text style={s.zoneName}>{z.name}</Text>
                      <Text style={t.small}>
                        {z.wardRange} · {z.avgPct}%
                      </Text>
                    </View>
                    <View style={s.grid}>
                      {z.cells.map(cell => (
                        <WardTile key={cell.wardNumber} cell={cell} />
                      ))}
                    </View>
                  </View>
                ))
              ) : (
                <View style={s.grid}>
                  {flatCells.map(cell => (
                    <WardTile key={cell.wardNumber} cell={cell} />
                  ))}
                </View>
              )
            ) : null}

            {viewMode === 'zoneRows' ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 12}}>
                  {dash.zones.map(z => {
                    const bad = z.cells.some(cell => cell.pct < 80);
                    return (
                      <FilterChip
                        key={z.zoneId}
                        label={z.name}
                        icon={bad ? 'warning' : 'check-circle'}
                        selected={activeZone === z.zoneId}
                        onPress={() => setActiveZone(z.zoneId)}
                        style={{marginRight: 8}}
                      />
                    );
                  })}
                </ScrollView>
                {(dash.zones.find(z => z.zoneId === activeZone) || dash.zones[0] || {cells: []}).cells.map(cell => (
                  <Card key={cell.wardNumber} style={s.zoneRowCard}>
                    <View style={{flex: 1}}>
                      <Text style={s.wardName}>{cell.wardName}</Text>
                      <Text style={t.small}>
                        {!cell.supervisorName
                          ? tr('adminVacantSupervisor')
                          : cell.noAttendance
                          ? tr('notReporting')
                          : `${cell.totalWorkers} on roll · ${cell.absentCount} absent`}
                      </Text>
                      <Text style={[t.small, {marginTop: 2}]}>
                        {tr('shift1')} {cell.shift1Pct}% · {tr('shift2')} {cell.shift2Pct}%
                      </Text>
                    </View>
                    <Icon
                      name={wardFlag(cell) ? FLAG_ICON[wardFlag(cell)] : 'check-circle'}
                      size={20}
                      color={wardFlag(cell) ? c.error : c.success}
                    />
                  </Card>
                ))}
              </>
            ) : null}

            {viewMode === 'ranked' ? (
              dash.ranked.map(cell => (
                <Card key={cell.wardNumber} style={s.rankRow}>
                  <Text style={s.rankNumber}>#{cell.rank}</Text>
                  <View style={{flex: 1, marginLeft: 10}}>
                    <Text style={s.wardName}>{cell.wardName}</Text>
                    <View style={s.rankTrack}>
                      <View style={[s.rankFill, {width: `${cell.pct}%`, backgroundColor: heatColor(cell.pct).bg}]} />
                    </View>
                  </View>
                  <Text style={s.rankPct}>{cell.pct}%</Text>
                </Card>
              ))
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <DatePickerSheet
        visible={!!dateTarget}
        value={dateTarget === 'to' ? toDate : fromDate}
        minDate={dateTarget === 'to' ? fromDate : undefined}
        onSelect={key => {
          if (dateTarget === 'to') {
            onDateChange({fromDate, toDate: key});
          } else {
            onDateChange({fromDate: key, toDate: toDate < key ? key : toDate});
          }
          setDateTarget(null);
        }}
        onClose={() => setDateTarget(null)}
      />
    </Screen>
  );
}


const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: c.surface,
  },
  title: {fontSize: 17, fontWeight: '600', color: c.text},
  body: {padding: 16, paddingBottom: 32},
  dateRow: {flexDirection: 'row', marginBottom: 4},
  pillRow: {flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap'},
  sectionLabel: {marginTop: 4, marginBottom: 8},
  attentionRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 10},
  attentionPct: {fontSize: 18, fontWeight: '700', color: c.error},
  wardName: {fontSize: 14.5, fontWeight: '600', color: c.text},
  summaryRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 6},
  summaryDot: {width: 10, height: 10, borderRadius: 5, marginRight: 10},
  summaryValue: {fontSize: 15, fontWeight: '700', color: c.text},
  zoneHeadRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8},
  zoneName: {fontSize: 15, fontWeight: '700', color: c.text},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  tile: {width: '31%', aspectRatio: 1, borderRadius: 10, padding: 8, justifyContent: 'flex-end'},
  tileFlag: {position: 'absolute', top: 6, right: 6},
  tileWard: {fontSize: 11.5, fontWeight: '600'},
  tilePct: {fontSize: 16, fontWeight: '700', marginTop: 2},
  zoneRowCard: {flexDirection: 'row', alignItems: 'center', marginBottom: 10},
  rankRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 10},
  rankNumber: {fontSize: 14, fontWeight: '700', color: c.textMuted, width: 28},
  rankTrack: {height: 6, borderRadius: 3, backgroundColor: c.fill, marginTop: 6, overflow: 'hidden'},
  rankFill: {height: '100%', borderRadius: 3},
  rankPct: {fontSize: 15, fontWeight: '700', color: c.text, marginLeft: 10},
});
