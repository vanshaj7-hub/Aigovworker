import React, {useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {c, r, t} from '../theme';
import {useLang} from '../i18n';
import {
  Avatar,
  Banner,
  Card,
  Divider,
  Icon,
  LanguageToggle,
  LegendDot,
  PickerField,
  ProgressBar,
  Screen,
  SectionLabel,
  SegmentPill,
  StatusPill,
} from '../ui';
import {mapDashboard} from '../domain/adminDashboard';

const SPLIT_COLORS = [c.primary, c.success, c.warning, c.error];

/** Simple proportional bar chart — this app has no charting library, and a
 * handful of weekly/monthly points don't need one. */
function MiniBarChart({points}) {
  const max = Math.max(1, ...points.map(p => p.value));
  return (
    <View style={bc.row}>
      {points.map((p, i) => (
        <View key={i} style={bc.col}>
          <View style={bc.track}>
            <View
              style={[
                bc.bar,
                {
                  height: `${Math.max(4, (p.value / max) * 100)}%`,
                  backgroundColor: p.emphasized ? c.primary : c.outline,
                },
              ]}
            />
          </View>
          <Text style={bc.label} numberOfLines={1}>
            {p.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ShiftCard({shift}) {
  const tone = shift.state === 'In progress' ? 'info' : shift.state === 'Closed' ? 'neutral' : 'pending';
  return (
    <Card style={sc.card}>
      <View style={sc.top}>
        <Icon name={shift.icon} size={18} color={c.primaryDark} />
        <Text style={sc.name} numberOfLines={1}>
          {shift.name}
        </Text>
      </View>
      <Text style={sc.window}>{shift.window}</Text>
      <StatusPill label={shift.state} tone={tone} style={{alignSelf: 'flex-start', marginTop: 8}} />
      <View style={sc.counts}>
        <Text style={sc.countText}>
          {shift.present} <Text style={sc.countSub}>({shift.presentPct}%)</Text>
        </Text>
        <Text style={t.small}>present</Text>
      </View>
    </Card>
  );
}

export default function AdminDashboardScreen({user, raw, loading, error, onRefresh, onSignOut, zw}) {
  const {t: tr} = useLang();
  const [shiftId, setShiftId] = useState(1);

  const dash = useMemo(
    () => (raw ? mapDashboard(raw, user.role, {shiftId}) : null),
    [raw, user.role, shiftId],
  );

  if (loading && !dash) {
    return (
      <Screen bg={c.surface}>
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
          <ActivityIndicator color={c.primary} size="large" />
          <Text style={{marginTop: 16, color: c.textMuted, fontSize: 14.5}}>{tr('loadingDashboard')}</Text>
        </View>
      </Screen>
    );
  }

  const splitTitle = user.role === 'sanitary_inspector' ? tr('adminAttendanceSplit') : tr('adminCheckInsByZone');

  return (
    <Screen>
      <View style={s.header}>
        <Avatar name={user.name} size={44} bg={c.primary} fg="#fff" />
        <View style={{flex: 1, marginLeft: 12}}>
          <Text style={s.title} numberOfLines={1}>
            {dash ? dash.header.title : user.scope.label}
          </Text>
          {dash ? <Text style={t.small}>{dash.header.subtitle}</Text> : null}
        </View>
        <LanguageToggle />
      </View>
      <Divider />

      <ScrollView contentContainerStyle={s.body}>
        {zw && zw.options.length > 0 ? (
          <PickerField
            label={zw.kind === 'zone' ? tr('filterAllZones') : tr('filterAllWards')}
            value={zw.value}
            options={zw.options}
            onChange={zw.setValue}
            allLabel={zw.kind === 'zone' ? tr('filterAllZones') : tr('filterAllWards')}
          />
        ) : null}
        {error ? (
          <Banner
            tone="error"
            icon="error-outline"
            body={error}
            right={<Pressable onPress={onRefresh}><Text style={s.retry}>{tr('retry')}</Text></Pressable>}
          />
        ) : null}

        {dash ? (
          <>
            <Card>
              <Text style={t.label}>{tr('adminWorkersOnRoll')}</Text>
              <Text style={s.bigCount}>{dash.roll.value}</Text>
              <Text style={t.bodyMuted}>{dash.roll.subtitle}</Text>
            </Card>

            <SectionLabel>{tr('adminShifts')}</SectionLabel>
            <View style={s.shiftTabs}>
              {dash.shiftCards.map(sh => (
                <SegmentPill
                  key={sh.shiftId}
                  label={sh.name}
                  icon={sh.icon}
                  selected={shiftId === sh.shiftId}
                  onPress={() => setShiftId(sh.shiftId)}
                />
              ))}
            </View>
            <View style={s.shiftRow}>
              {dash.shiftCards.map(sh => (
                <ShiftCard key={sh.shiftId} shift={sh} />
              ))}
            </View>

            <SectionLabel>{tr('adminWeeklyTrend')}</SectionLabel>
            <Card>
              <MiniBarChart points={dash.weeklyChart} />
            </Card>

            <SectionLabel>{tr('adminMonthlyTrend')}</SectionLabel>
            <Card>
              <MiniBarChart points={dash.monthlyChart} />
            </Card>

            <SectionLabel>{splitTitle}</SectionLabel>
            <Card>
              {dash.split.slices.map((slice, i) => (
                <View key={slice.key || slice.zoneCode || slice.name} style={s.sliceRow}>
                  <LegendDot
                    color={SPLIT_COLORS[i % SPLIT_COLORS.length]}
                    label={slice.key ? tr(slice.key) : slice.name}
                    value={`${slice.value} (${slice.pct}%)`}
                  />
                  <ProgressBar
                    value={slice.pct}
                    total={100}
                    color={SPLIT_COLORS[i % SPLIT_COLORS.length]}
                    height={6}
                  />
                </View>
              ))}
            </Card>

            {dash.rightPanel.type === 'lowestWards' ? (
              <>
                <SectionLabel>{tr('adminLowestWards')}</SectionLabel>
                {dash.rightPanel.items.map(w => (
                  <Card key={w.wardCode} style={s.wardCard}>
                    <View style={{flex: 1}}>
                      <Text style={s.wardName}>{w.wardName}</Text>
                      <Text style={t.small}>{w.zoneName}</Text>
                      <Text style={[t.small, !w.supervisorName && s.vacant]}>
                        {w.supervisorName || tr('adminVacantSupervisor')}
                      </Text>
                    </View>
                    <View style={{alignItems: 'flex-end'}}>
                      <StatusPill
                        label={`${w.pct}%`}
                        tone={w.tone === 'red' ? 'error' : w.tone === 'yellow' ? 'warning' : 'neutral'}
                      />
                      <Text style={[t.small, {marginTop: 6}]}>
                        {w.present}/{w.total}
                      </Text>
                    </View>
                  </Card>
                ))}
              </>
            ) : (
              <>
                <SectionLabel>{dash.rightPanel.title || tr('adminWardsAtAGlance')}</SectionLabel>
                <View style={s.shiftRow}>
                  {dash.rightPanel.shifts.map(sh => (
                    <ShiftCard key={sh.shiftId} shift={sh} />
                  ))}
                </View>
              </>
            )}

            {dash.workersNeedingALook ? (
              <>
                <SectionLabel>{tr('adminWorkersNeedingALook')}</SectionLabel>
                {dash.workersNeedingALook.length === 0 ? (
                  <Card>
                    <Text style={t.bodyMuted}>{tr('allMarked')}</Text>
                  </Card>
                ) : (
                  dash.workersNeedingALook.map((w, i) => (
                    <Card key={i} style={s.lookRow}>
                      <Avatar name={w.name} size={36} />
                      <View style={{flex: 1, marginLeft: 10}}>
                        <Text style={s.lookName}>{w.name}</Text>
                        <Text style={t.small}>
                          {w.wardCode} · {w.shiftName}
                        </Text>
                      </View>
                      {w.time ? <Text style={t.small}>{w.time}</Text> : null}
                    </Card>
                  ))
                )}
              </>
            ) : null}
          </>
        ) : null}

        <Pressable onPress={onSignOut} style={s.signOut}>
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
  title: {fontSize: 17, fontWeight: '600', color: c.text},
  body: {padding: 16, paddingBottom: 32},
  bigCount: {fontSize: 40, fontWeight: '500', color: c.text, lineHeight: 44, marginTop: 4},
  retry: {color: c.primaryDark, fontWeight: '700', fontSize: 13},
  shiftTabs: {flexDirection: 'row', gap: 8, marginBottom: 12},
  shiftRow: {flexDirection: 'row', gap: 10, marginBottom: 4},
  sliceRow: {marginBottom: 14},
  wardCard: {flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between'},
  wardName: {fontSize: 15, fontWeight: '600', color: c.text},
  vacant: {color: c.warningStrong, fontStyle: 'italic'},
  lookRow: {flexDirection: 'row', alignItems: 'center'},
  lookName: {fontSize: 14.5, fontWeight: '600', color: c.text},
  signOut: {alignItems: 'center', paddingVertical: 22},
  signOutText: {color: c.primaryDark, fontSize: 14.5, fontWeight: '600'},
});

const sc = StyleSheet.create({
  card: {flex: 1, minWidth: 150},
  top: {flexDirection: 'row', alignItems: 'center', gap: 6},
  name: {fontSize: 13.5, fontWeight: '700', color: c.text, flex: 1},
  window: {...t.small, marginTop: 4},
  counts: {marginTop: 10},
  countText: {fontSize: 20, fontWeight: '600', color: c.text},
  countSub: {fontSize: 13, fontWeight: '400', color: c.textMuted},
});

const bc = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 6},
  col: {flex: 1, alignItems: 'center'},
  track: {width: '70%', height: 84, justifyContent: 'flex-end'},
  bar: {width: '100%', borderRadius: r.chip, minHeight: 4},
  label: {...t.small, marginTop: 6, fontSize: 10.5},
});
