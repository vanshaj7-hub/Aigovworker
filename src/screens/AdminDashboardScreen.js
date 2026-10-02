import React, {useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {ac, ar} from '../adminTheme';
import {useLang} from '../i18n';
import {Avatar, Banner, FilterPillButton, Icon, LanguageToggle, PickerField, Screen} from '../ui';
import AdminDonut from '../AdminDonut';
import {mapDashboard} from '../domain/adminDashboard';

const ROLE_LABEL_KEY = {department_head: 'roleLabelDeptHead', csi: 'roleLabelCsi', sanitary_inspector: 'roleLabelSi'};
const TONE_BG = {red: ac.redLight, yellow: ac.yellowLight, neutral: ac.grey100};
const TONE_FG = {red: ac.redDark, yellow: ac.yellowDark, neutral: ac.grey800};

function todayShort(lang) {
  return new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-GB', {day: 'numeric', month: 'short'});
}

export default function AdminDashboardScreen({user, raw, loading, error, onRefresh, onSignOut, zw}) {
  const {t: tr, lang} = useLang();
  const [shiftId, setShiftId] = useState(1);

  const dash = useMemo(() => (raw ? mapDashboard(raw, user.role, {shiftId}) : null), [raw, user.role, shiftId]);

  if (loading && !dash) {
    return (
      <Screen bg={ac.white}>
        <View style={s.centerFill}>
          <ActivityIndicator color={ac.blue} size="large" />
          <Text style={s.loadingText}>{tr('loadingDashboard')}</Text>
        </View>
      </Screen>
    );
  }

  const splitTitle = user.role === 'department_head' ? tr('adminCheckInsByZone') : tr('adminAttendanceSplit');
  const splitSubtitle =
    user.role === 'department_head'
      ? tr('byZoneSub')
      : user.role === 'csi'
      ? tr('splitSubZone', {zone: user.scope.label})
      : tr('splitSubWards', {n: dash ? dash.totalWorkers : ''});
  const lowestSubtitle = dash
    ? tr(user.role === 'department_head' ? 'lowestSubtitleAll' : 'lowestSubtitleYours', {
        n: dash.lowest.length,
        total: dash.totalWards,
      })
    : '';
  const donutUnit = dash ? tr(dash.split.unit === 'checkIns' ? 'unitCheckIns' : 'unitWorkers') : '';

  return (
    <Screen>
      <View style={s.header}>
        <Avatar name={user.name} size={40} bg={ac.blue} fg="#fff" />
        <View style={{flex: 1, marginLeft: 12}}>
          <Text style={s.name} numberOfLines={1}>
            {user.name}
          </Text>
          <Text style={s.role} numberOfLines={1}>
            {tr(ROLE_LABEL_KEY[user.role])} · {user.scope.label}
          </Text>
        </View>
        <LanguageToggle />
      </View>

      <View style={s.pillRow}>
        {zw && zw.options.length > 0 ? (
          <PickerField
            label={zw.kind === 'zone' ? tr('filterAllZones') : tr('filterAllWards')}
            value={zw.value}
            options={zw.options}
            onChange={zw.setValue}
            allLabel={zw.kind === 'zone' ? tr('filterAllZones') : tr('filterAllWards')}
            style={{flex: 1}}
          />
        ) : (
          <FilterPillButton icon="filter-alt" label={user.scope.label} style={{flex: 1}} />
        )}
        <FilterPillButton icon="event" label={todayShort(lang)} style={{marginLeft: 8}} />
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {error ? <Banner tone="error" icon="error-outline" body={error} right={<Pressable onPress={onRefresh}><Text style={s.retry}>{tr('retry')}</Text></Pressable>} /> : null}

        {dash ? (
          <>
            <View style={s.card}>
              <View style={s.rollRow}>
                <Text style={s.rollLabel}>{tr('adminWorkersOnRoll')}</Text>
                <Text style={s.rollValue}>{dash.totalWorkers.toLocaleString('en-IN')}</Text>
              </View>
              <View style={s.kpiHeadRow}>
                <View style={{flex: 1}} />
                <Text style={[s.kpiHeadLabel, s.kpiColIn]}>{tr('adminCheckedIn')}</Text>
                <Text style={[s.kpiHeadLabel, s.kpiColAbs]}>{tr('absent')}</Text>
                <Text style={[s.kpiHeadLabel, s.kpiColLv]}>{tr('onLeave')}</Text>
              </View>
              {dash.shiftKpiRows.map(row => (
                <View key={row.shiftId} style={s.kpiRow}>
                  <View style={s.kpiShiftName}>
                    <Icon name={row.icon} size={16} color={row.iconColor} />
                    <Text style={s.kpiShiftText} numberOfLines={1}>
                      {row.name}
                    </Text>
                    <View style={[s.kpiDot, {backgroundColor: row.stateColor}]} />
                  </View>
                  <View style={s.kpiColIn}>
                    <Text style={s.kpiN}>
                      {row.inN}
                      <Text style={s.kpiPctGreen}> {row.inPct}</Text>
                    </Text>
                  </View>
                  <View style={s.kpiColAbs}>
                    <Text style={s.kpiN}>
                      {row.absN}
                      <Text style={s.kpiPctRed}> {row.absPct}</Text>
                    </Text>
                  </View>
                  <Text style={[s.kpiN, s.kpiColLv]}>{row.lvN}</Text>
                </View>
              ))}
            </View>

            <View style={s.card}>
              <View style={s.splitHead}>
                <View style={{flex: 1}}>
                  <Text style={s.cardTitle}>{splitTitle}</Text>
                  <Text style={s.cardSubtitle}>{splitSubtitle}</Text>
                </View>
                <View style={s.segWrap}>
                  <Pressable onPress={() => setShiftId(1)} style={[s.segBtn, shiftId === 1 && s.segBtnOn]}>
                    <Text style={[s.segText, shiftId === 1 && s.segTextOn]}>S1</Text>
                  </Pressable>
                  <Pressable onPress={() => setShiftId(2)} style={[s.segBtn, shiftId === 2 && s.segBtnOn]}>
                    <Text style={[s.segText, shiftId === 2 && s.segTextOn]}>S2</Text>
                  </Pressable>
                </View>
              </View>
              <View style={s.donutRow}>
                <AdminDonut
                  slices={dash.split.slices}
                  centerValue={dash.split.total.toLocaleString('en-IN')}
                  centerUnit={donutUnit}
                />
                <View style={s.legend}>
                  {dash.split.slices.map((slice, i) => (
                    <View key={slice.key || slice.zoneCode || i} style={s.legendRow}>
                      <View style={[s.legendDot, {backgroundColor: slice.color}]} />
                      <Text style={s.legendName} numberOfLines={1}>
                        {slice.key ? tr(slice.key) : slice.name}
                      </Text>
                      <Text style={s.legendValue}>{slice.value.toLocaleString('en-IN')}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <View style={[s.card, {flex: 1}]}>
              <View style={s.splitHead}>
                <View style={{flex: 1}}>
                  <Text style={s.cardTitle}>{tr('adminLowestWards')}</Text>
                  <Text style={s.cardSubtitle}>{lowestSubtitle}</Text>
                </View>
                <Text style={s.viewAll}>{tr('viewAll')}</Text>
              </View>
              {dash.lowest.map(w => (
                <View key={w.wardCode} style={s.lowRow}>
                  <View style={[s.lowBadge, {backgroundColor: TONE_BG[w.tone]}]}>
                    <Text style={[s.lowBadgeText, {color: TONE_FG[w.tone]}]}>{w.rank}</Text>
                  </View>
                  <View style={{flex: 1, marginLeft: 12}}>
                    <Text style={s.lowName} numberOfLines={1}>
                      {w.wardName}
                    </Text>
                    <Text style={s.lowMeta} numberOfLines={1}>
                      {w.zoneName} · {w.supervisorName || tr('adminVacantSupervisor')}
                    </Text>
                  </View>
                  <View style={{alignItems: 'flex-end'}}>
                    <Text style={[s.lowPct, {color: TONE_FG[w.tone]}]}>{w.pct}%</Text>
                    <Text style={s.lowCount}>
                      {w.present}/{w.total}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
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
  centerFill: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  loadingText: {marginTop: 16, color: ac.textSecondary, fontSize: 14.5},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: ac.white,
  },
  name: {fontSize: 15, fontWeight: '500', color: ac.textPrimary},
  role: {fontSize: 12, color: ac.textSecondary, marginTop: 1},
  pillRow: {flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: ac.white},
  retry: {color: ac.blueDark, fontWeight: '700', fontSize: 13},

  body: {padding: 16, paddingBottom: 32, gap: 12},
  card: {backgroundColor: ac.white, borderWidth: 1, borderColor: ac.border, borderRadius: ar.card, padding: 14},

  rollRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  rollLabel: {fontSize: 13, color: ac.textSecondary},
  rollValue: {fontSize: 22, fontWeight: '500', color: ac.textPrimary},
  kpiHeadRow: {flexDirection: 'row', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: ac.divider},
  kpiHeadLabel: {fontSize: 10, color: ac.textSecondary, textAlign: 'right'},
  kpiColIn: {width: 64},
  kpiColAbs: {width: 64},
  kpiColLv: {width: 48, textAlign: 'right'},
  kpiRow: {flexDirection: 'row', alignItems: 'center', paddingTop: 9},
  kpiShiftName: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0},
  kpiShiftText: {fontSize: 12, fontWeight: '500', color: ac.textPrimary},
  kpiDot: {width: 6, height: 6, borderRadius: 3},
  kpiN: {fontSize: 15, fontWeight: '500', color: ac.textPrimary, textAlign: 'right'},
  kpiPctGreen: {fontSize: 10, fontWeight: '400', color: ac.greenDark},
  kpiPctRed: {fontSize: 10, fontWeight: '400', color: ac.redDark},

  splitHead: {flexDirection: 'row', alignItems: 'flex-start', gap: 10},
  cardTitle: {fontSize: 14, fontWeight: '500', color: ac.textPrimary},
  cardSubtitle: {fontSize: 11, color: ac.textSecondary, marginTop: 2},
  segWrap: {flexDirection: 'row', backgroundColor: ac.grey100, borderRadius: ar.pill, padding: 3, gap: 2},
  segBtn: {height: 26, paddingHorizontal: 10, borderRadius: ar.pill, alignItems: 'center', justifyContent: 'center'},
  segBtnOn: {backgroundColor: ac.white},
  segText: {fontSize: 12, fontWeight: '500', color: ac.grey700},
  segTextOn: {color: ac.blue},

  donutRow: {flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14},
  legend: {flex: 1, gap: 5, minWidth: 0},
  legendRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  legendDot: {width: 8, height: 8, borderRadius: 2},
  legendName: {flex: 1, fontSize: 12, color: ac.textPrimary},
  legendValue: {fontSize: 12, fontWeight: '500', color: ac.textPrimary},

  viewAll: {fontSize: 12, color: ac.blue, fontWeight: '500'},
  lowRow: {flexDirection: 'row', alignItems: 'center', paddingTop: 11, marginTop: 10, borderTopWidth: 1, borderTopColor: ac.divider},
  lowBadge: {width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center'},
  lowBadgeText: {fontSize: 12, fontWeight: '500'},
  lowName: {fontSize: 13, fontWeight: '500', color: ac.textPrimary},
  lowMeta: {fontSize: 11, color: ac.textSecondary, marginTop: 2},
  lowPct: {fontSize: 14, fontWeight: '500'},
  lowCount: {fontSize: 10, color: ac.textSecondary, marginTop: 2},

  signOut: {alignItems: 'center', paddingVertical: 22},
  signOutText: {color: ac.blueDark, fontSize: 14.5, fontWeight: '600'},
});
