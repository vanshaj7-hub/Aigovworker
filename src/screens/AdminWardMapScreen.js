import React, {useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {ac, ar} from '../adminTheme';
import {useLang} from '../i18n';
import {Banner, FilterPillButton, Icon, LanguageToggle, Screen} from '../ui';
import DatePickerSheet from '../DatePickerSheet';
import {heatColor, mapWardMap, wardFlag} from '../domain/wardMap';

const FLAG_ICON = {vacantSupervisor: 'person-off', noAttendance: 'block', lowPct: 'trending-down'};

function SegTrack({options, value, onChange}) {
  return (
    <View style={s.segWrap}>
      {options.map(opt => {
        const on = value === opt.value;
        return (
          <Pressable key={opt.value} onPress={() => onChange(opt.value)} style={[s.segBtn, on && s.segBtnOn]}>
            <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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
      <Text style={s.summaryLabel}>{label}</Text>
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
      <Screen bg={ac.white}>
        <View style={s.centerFill}>
          <ActivityIndicator color={ac.blue} size="large" />
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

      <ScrollView contentContainerStyle={s.body}>
        {error ? <Banner tone="error" icon="error-outline" body={error} /> : null}

        <View style={s.dateRow}>
          <FilterPillButton icon="event" label={fromDate} onPress={() => setDateTarget('from')} chevron={false} style={{flex: 1}} />
          <FilterPillButton icon="event" label={toDate} onPress={() => setDateTarget('to')} chevron={false} style={{flex: 1}} />
        </View>

        <SegTrack
          value={shiftFilter}
          onChange={setShiftFilter}
          options={[
            {value: 'both', label: tr('shiftBoth')},
            {value: 1, label: tr('shift1')},
            {value: 2, label: tr('shift2')},
          ]}
        />
        <View style={s.gradientRow}>
          <Text style={s.gradientLabel}>&lt;80</Text>
          <View style={s.gradientBar} />
          <Text style={s.gradientLabel}>100</Text>
        </View>

        {dash ? (
          <>
            <SegTrack
              value={viewMode}
              onChange={setViewMode}
              options={[
                {value: 'grid', label: tr('viewGrid')},
                {value: 'zoneRows', label: tr('viewZoneRows')},
                {value: 'ranked', label: tr('viewRanked')},
              ]}
            />

            {viewMode === 'grid' ? (
              user.role === 'department_head' ? (
                dash.zones.map(z => (
                  <View key={z.zoneId} style={{marginBottom: 16}}>
                    <View style={s.zoneHeadRow}>
                      <Text style={s.zoneName}>{z.name}</Text>
                      <Text style={s.metaText}>
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
                    const active = activeZone === z.zoneId;
                    return (
                      <Pressable
                        key={z.zoneId}
                        onPress={() => setActiveZone(z.zoneId)}
                        style={[s.zonePill, active && s.zonePillOn]}>
                        <View style={[s.zoneDot, {backgroundColor: bad ? ac.red : ac.green}]} />
                        <Text style={[s.zonePillText, active && s.zonePillTextOn]} numberOfLines={1}>
                          {z.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {(dash.zones.find(z => z.zoneId === activeZone) || dash.zones[0] || {cells: []}).cells.map(cell => (
                  <View key={cell.wardNumber} style={[s.card, s.zoneRowCard]}>
                    <View style={{flex: 1}}>
                      <Text style={s.wardName}>{cell.wardName}</Text>
                      <Text style={s.metaText}>
                        {!cell.supervisorName
                          ? tr('adminVacantSupervisor')
                          : cell.noAttendance
                          ? tr('notReporting')
                          : `${cell.totalWorkers} on roll · ${cell.absentCount} absent`}
                      </Text>
                      <Text style={[s.metaText, {marginTop: 2}]}>
                        {tr('shift1')} {cell.shift1Pct}% · {tr('shift2')} {cell.shift2Pct}%
                      </Text>
                    </View>
                    <Icon
                      name={wardFlag(cell) ? FLAG_ICON[wardFlag(cell)] : 'check-circle'}
                      size={20}
                      color={wardFlag(cell) ? ac.red : ac.green}
                    />
                  </View>
                ))}
              </>
            ) : null}

            {viewMode === 'ranked'
              ? dash.ranked.map(cell => (
                  <View key={cell.wardNumber} style={[s.card, s.rankRow]}>
                    <Text style={s.rankNumber}>#{cell.rank}</Text>
                    <View style={{flex: 1, marginLeft: 10}}>
                      <Text style={s.wardName}>{cell.wardName}</Text>
                      <View style={s.rankTrack}>
                        <View style={[s.rankFill, {width: `${cell.pct}%`, backgroundColor: heatColor(cell.pct).bg}]} />
                      </View>
                    </View>
                    <Text style={s.rankPct}>{cell.pct}%</Text>
                  </View>
                ))
              : null}

            {dash.attention.length > 0 ? (
              <>
                <Text style={s.sectionLabel}>{tr('needsAttention')}</Text>
                {dash.attention.map(a => (
                  <View key={a.wardNumber} style={[s.card, s.attentionRow]}>
                    <View style={{flex: 1}}>
                      <Text style={s.wardName}>{a.wardName}</Text>
                      <Text style={s.metaText}>
                        {a.zone} · {a.supervisor}
                      </Text>
                      <Text style={s.attentionNote}>{tr('underPctForDays', {n: dash.attentionWindowDays})}</Text>
                    </View>
                    <Text style={s.attentionPct}>{a.presentPct}%</Text>
                  </View>
                ))}
              </>
            ) : null}

            <Text style={s.sectionLabel}>
              {tr('wardSitHeading', {
                n: dash.summary.above90 + dash.summary.between80and90 + dash.summary.below80 + dash.summary.wardsNotReporting,
              })}
            </Text>
            <View style={s.card}>
              <SummaryRow color={ac.greenDark} label={tr('aboveNinety')} value={dash.summary.above90} />
              <SummaryRow color={ac.green} label={tr('eightyToNinety')} value={dash.summary.between80and90} />
              <SummaryRow color={ac.yellow} label={tr('belowEighty')} value={dash.summary.below80} />
              <SummaryRow color={ac.grey400} label={tr('notReporting')} value={dash.summary.wardsNotReporting} />
            </View>
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
  centerFill: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: ac.white,
  },
  title: {fontSize: 17, fontWeight: '500', color: ac.textPrimary},
  body: {padding: 16, paddingBottom: 32},
  dateRow: {flexDirection: 'row', gap: 8, marginBottom: 12},

  segWrap: {flexDirection: 'row', backgroundColor: ac.grey100, borderRadius: ar.pill, padding: 3, gap: 2, marginBottom: 10},
  segBtn: {flex: 1, height: 30, borderRadius: ar.pill, alignItems: 'center', justifyContent: 'center'},
  segBtnOn: {backgroundColor: ac.white},
  segText: {fontSize: 12, fontWeight: '500', color: ac.grey700},
  segTextOn: {color: ac.blue},

  gradientRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14},
  gradientLabel: {fontSize: 10, color: ac.textSecondary},
  gradientBar: {flex: 1, height: 8, borderRadius: 4, backgroundColor: ac.grey300},

  card: {backgroundColor: ac.white, borderWidth: 1, borderColor: ac.border, borderRadius: ar.card, padding: 14, marginBottom: 12},
  sectionLabel: {fontSize: 11.5, fontWeight: '600', color: ac.grey700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8},
  attentionRow: {flexDirection: 'row', alignItems: 'center'},
  attentionPct: {fontSize: 18, fontWeight: '700', color: ac.red},
  attentionNote: {fontSize: 11, color: ac.red, marginTop: 2},
  wardName: {fontSize: 14.5, fontWeight: '500', color: ac.textPrimary},
  metaText: {fontSize: 11, color: ac.textSecondary},
  summaryRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 6},
  summaryDot: {width: 10, height: 10, borderRadius: 5, marginRight: 10},
  summaryLabel: {flex: 1, fontSize: 13, color: ac.textPrimary},
  summaryValue: {fontSize: 15, fontWeight: '700', color: ac.textPrimary},
  zoneHeadRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8},
  zoneName: {fontSize: 13, fontWeight: '500', color: ac.textPrimary},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  tile: {width: '31%', aspectRatio: 1, borderRadius: 8, padding: 8, justifyContent: 'flex-end'},
  tileFlag: {position: 'absolute', top: 6, right: 6},
  tileWard: {fontSize: 11.5, fontWeight: '600'},
  tilePct: {fontSize: 16, fontWeight: '700', marginTop: 2},
  zonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    paddingHorizontal: 12,
    borderRadius: ar.pill,
    borderWidth: 1,
    borderColor: ac.borderStrong,
    marginRight: 8,
    gap: 6,
  },
  zonePillOn: {backgroundColor: ac.blueLight, borderColor: ac.blueLight},
  zoneDot: {width: 6, height: 6, borderRadius: 3},
  zonePillText: {fontSize: 12, fontWeight: '500', color: ac.grey800},
  zonePillTextOn: {color: ac.blueDark},
  zoneRowCard: {flexDirection: 'row', alignItems: 'center'},
  rankRow: {flexDirection: 'row', alignItems: 'center'},
  rankNumber: {fontSize: 14, fontWeight: '700', color: ac.textSecondary, width: 28},
  rankTrack: {height: 6, borderRadius: 3, backgroundColor: ac.grey100, marginTop: 6, overflow: 'hidden'},
  rankFill: {height: '100%', borderRadius: 3},
  rankPct: {fontSize: 15, fontWeight: '700', color: ac.textPrimary, marginLeft: 10},
});
