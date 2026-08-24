import React, {useMemo, useState} from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {Badge, Button, Card, Header, Screen} from '../components';
import {colors} from '../theme';
import {BarChart, DonutChart, SERIES, SERIES_OTHER} from '../charts';
import {clearDemoData, seedDemoData} from '../storage';

const DAY = 24 * 60 * 60 * 1000;
const UP_GREEN = '#006300';

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function inRange(r, from, to) {
  const t = new Date(r.timestamp).getTime();
  return t >= from.getTime() && t < to.getTime();
}

function pctDelta(current, previous) {
  if (previous === 0) {
    return current > 0 ? null : 0; // null = "new" (no base to compare)
  }
  return Math.round(((current - previous) / previous) * 100);
}

function Delta({value}) {
  if (value === null) {
    return <Text style={[styles.delta, {color: colors.textMuted}]}>new</Text>;
  }
  const up = value >= 0;
  return (
    <Text style={[styles.delta, {color: up ? UP_GREEN : colors.danger}]}>
      {up ? '▲' : '▼'} {Math.abs(value)}%
    </Text>
  );
}

function Kpi({label, value, delta, sub}) {
  return (
    <Card style={styles.kpi}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4}}>
        {delta !== undefined ? <Delta value={delta} /> : null}
        {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
      </View>
    </Card>
  );
}

export default function AdminScreen({session, records, setRecords, workers, onLogout}) {
  const {width} = useWindowDimensions();
  const chartW = width - 18 * 2 - 16 * 2;
  const [busy, setBusy] = useState(false);

  const hasDemo = records.some(r => r.demo);

  const stats = useMemo(() => {
    const today = startOfDay(new Date());
    const tomorrow = new Date(today.getTime() + DAY);

    const last7From = new Date(tomorrow.getTime() - 7 * DAY);
    const prev7From = new Date(tomorrow.getTime() - 14 * DAY);
    const last30From = new Date(tomorrow.getTime() - 30 * DAY);
    const prev30From = new Date(tomorrow.getTime() - 60 * DAY);

    const last7 = records.filter(r => inRange(r, last7From, tomorrow));
    const prev7 = records.filter(r => inRange(r, prev7From, last7From));
    const last30 = records.filter(r => inRange(r, last30From, tomorrow));
    const prev30 = records.filter(r => inRange(r, prev30From, last30From));

    // Weekly buckets: last 8 weeks ending today.
    const weekly = [];
    for (let i = 7; i >= 0; i--) {
      const to = new Date(tomorrow.getTime() - i * 7 * DAY);
      const from = new Date(to.getTime() - 7 * DAY);
      weekly.push({
        label: `${from.getDate()}/${from.getMonth() + 1}`,
        value: records.filter(r => inRange(r, from, to)).length,
      });
    }

    // Monthly buckets: last 6 calendar months.
    const monthly = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let i = 5; i >= 0; i--) {
      const from = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const to = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
      monthly.push({
        label: monthNames[from.getMonth()],
        value: records.filter(r => inRange(r, from, to)).length,
      });
    }

    // Per-region: last 30 days, top 5 + Other.
    const byArea = new Map();
    for (const r of last30) {
      const area = r.area || 'Unassigned';
      byArea.set(area, (byArea.get(area) || 0) + 1);
    }
    const sorted = [...byArea.entries()].sort((a, b) => b[1] - a[1]);
    const regionPie = sorted.slice(0, 5).map(([label, value], i) => ({
      label,
      value,
      color: SERIES[i],
    }));
    if (sorted.length > 5) {
      regionPie.push({
        label: 'Other',
        value: sorted.slice(5).reduce((s, [, v]) => s + v, 0),
        color: SERIES_OTHER,
      });
    }

    // Region table: this week vs previous week.
    const areas = new Set([
      ...last7.map(r => r.area || 'Unassigned'),
      ...prev7.map(r => r.area || 'Unassigned'),
    ]);
    const regionRows = [...areas]
      .map(area => {
        const cur = last7.filter(r => (r.area || 'Unassigned') === area);
        const prev = prev7.filter(r => (r.area || 'Unassigned') === area).length;
        return {
          area,
          current: cur.length,
          workers: new Set(cur.map(r => r.workerId)).size,
          delta: pctDelta(cur.length, prev),
        };
      })
      .sort((a, b) => b.current - a.current);

    const matched = last30.filter(r => typeof r.similarity === 'number');
    const avgMatch = matched.length
      ? Math.round(
          (matched.reduce((s, r) => s + r.similarity, 0) / matched.length) * 100,
        )
      : null;

    return {
      wow: {current: last7.length, delta: pctDelta(last7.length, prev7.length)},
      mom: {current: last30.length, delta: pctDelta(last30.length, prev30.length)},
      activeWorkers: new Set(last7.map(r => r.workerId)).size,
      avgMatch,
      pending: records.filter(r => !r.synced).length,
      weekly,
      monthly,
      regionPie,
      regionRows,
    };
  }, [records]);

  const toggleDemo = () => {
    if (hasDemo) {
      Alert.alert('Remove sample data', 'Delete all demo records? Real attendance records are kept.', [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              setRecords(await clearDemoData());
            } finally {
              setBusy(false);
            }
          },
        },
      ]);
    } else {
      setBusy(true);
      seedDemoData()
        .then(setRecords)
        .finally(() => setBusy(false));
    }
  };

  return (
    <Screen>
      <Header
        title="Admin Dashboard"
        subtitle={`${session.name} · region overview`}
        right={
          <TouchableOpacity onPress={onLogout}>
            <Text style={styles.logout}>Logout</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{padding: 18, gap: 14}}>
        {hasDemo ? (
          <Badge text="Showing sample data — remove it below" color={colors.warning} />
        ) : null}

        <View style={styles.kpiRow}>
          <Kpi
            label="Check-ins · last 7 days"
            value={stats.wow.current}
            delta={stats.wow.delta}
            sub="vs prior week"
          />
          <Kpi
            label="Check-ins · last 30 days"
            value={stats.mom.current}
            delta={stats.mom.delta}
            sub="vs prior 30 days"
          />
        </View>
        <View style={styles.kpiRow}>
          <Kpi
            label="Active workers · 7 days"
            value={stats.activeWorkers}
            sub={`of ${workers.length || '—'} enrolled`}
          />
          <Kpi
            label="Avg face match · 30 days"
            value={stats.avgMatch !== null ? `${stats.avgMatch}%` : '—'}
            sub={stats.pending > 0 ? `${stats.pending} pending sync` : 'all synced'}
          />
        </View>

        <Card>
          <Text style={styles.chartTitle}>Weekly check-ins</Text>
          <Text style={styles.chartSub}>Last 8 weeks · week starting</Text>
          <BarChart data={stats.weekly} width={chartW} />
        </Card>

        <Card>
          <Text style={styles.chartTitle}>Monthly check-ins</Text>
          <Text style={styles.chartSub}>Last 6 months</Text>
          <BarChart data={stats.monthly} width={chartW} color={SERIES[0]} />
        </Card>

        <Card>
          <Text style={styles.chartTitle}>Check-ins by region</Text>
          <Text style={styles.chartSub}>Last 30 days</Text>
          <DonutChart data={stats.regionPie} centerLabel="check-ins" />
          {stats.regionPie.length === 0 ? (
            <Text style={styles.empty}>No check-ins in the last 30 days.</Text>
          ) : null}
        </Card>

        <Card>
          <Text style={styles.chartTitle}>Region performance · this week</Text>
          <Text style={styles.chartSub}>Check-ins last 7 days vs prior 7 days</Text>
          <View style={{marginTop: 10}}>
            <View style={[styles.tRow, styles.tHead]}>
              <Text style={[styles.tCell, styles.tArea, styles.tHeadTxt]}>Region</Text>
              <Text style={[styles.tCell, styles.tNum, styles.tHeadTxt]}>Check-ins</Text>
              <Text style={[styles.tCell, styles.tNum, styles.tHeadTxt]}>Workers</Text>
              <Text style={[styles.tCell, styles.tNum, styles.tHeadTxt]}>WoW</Text>
            </View>
            {stats.regionRows.map(row => (
              <View key={row.area} style={styles.tRow}>
                <Text style={[styles.tCell, styles.tArea]} numberOfLines={1}>
                  {row.area}
                </Text>
                <Text style={[styles.tCell, styles.tNum, {fontWeight: '700'}]}>
                  {row.current}
                </Text>
                <Text style={[styles.tCell, styles.tNum]}>{row.workers}</Text>
                <View style={[styles.tCell, styles.tNum, {alignItems: 'flex-end'}]}>
                  <Delta value={row.delta} />
                </View>
              </View>
            ))}
            {stats.regionRows.length === 0 ? (
              <Text style={styles.empty}>No check-ins recorded this week.</Text>
            ) : null}
          </View>
        </Card>

        <Button
          title={hasDemo ? 'Remove Sample Data' : 'Load Sample Data (demo)'}
          variant="secondary"
          busy={busy}
          onPress={toggleDemo}
        />
        <Text style={styles.footnote}>
          Regions come from each worker's assigned area at enrollment. Sample
          data is flagged separately and never mixes with real records.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logout: {color: '#ffd9a0', fontWeight: '700', fontSize: 13},
  kpiRow: {flexDirection: 'row', gap: 14},
  kpi: {flex: 1, padding: 14},
  kpiValue: {fontSize: 26, fontWeight: '800', color: colors.text},
  kpiLabel: {fontSize: 11, color: colors.textMuted, marginTop: 2},
  kpiSub: {fontSize: 11, color: colors.textMuted},
  delta: {fontSize: 12, fontWeight: '800'},
  chartTitle: {fontSize: 15, fontWeight: '800', color: colors.text},
  chartSub: {fontSize: 12, color: colors.textMuted, marginBottom: 10, marginTop: 2},
  tRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tHead: {borderBottomColor: colors.textMuted},
  tHeadTxt: {fontSize: 11, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase'},
  tCell: {fontSize: 13, color: colors.text},
  tArea: {flex: 2.2},
  tNum: {flex: 1, textAlign: 'right'},
  empty: {color: colors.textMuted, fontSize: 13, paddingVertical: 12, textAlign: 'center'},
  footnote: {fontSize: 11, color: colors.textMuted, textAlign: 'center', marginBottom: 20},
});
