import React, {useMemo, useState} from 'react';
import {SectionList, Share, StyleSheet, Text, View} from 'react-native';
import {Badge, Button, EmptyState, Field, Header, Screen} from '../components';
import {colors} from '../theme';

function toCsv(records) {
  const header =
    'Date,Time,Worker,Area,Department,Status,Supervisor,Latitude,Longitude,FaceMatch,Synced';
  const rows = records.map(r => {
    const d = new Date(r.timestamp);
    const cells = [
      r.dateKey,
      d.toLocaleTimeString(),
      r.workerName,
      r.area || '',
      r.department || '',
      r.status,
      r.supervisor,
      r.location ? r.location.lat : '',
      r.location ? r.location.lng : '',
      r.similarity,
      r.synced ? 'yes' : 'pending',
    ];
    return cells
      .map(c => {
        const s = String(c);
        return s.includes(',') || s.includes('"')
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      })
      .join(',');
  });
  return [header, ...rows].join('\n');
}

export default function HistoryScreen({records, navigate}) {
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? records.filter(
          r =>
            r.workerName.toLowerCase().includes(q) ||
            (r.department || '').toLowerCase().includes(q) ||
            r.dateKey.includes(q),
        )
      : records;
    const byDate = new Map();
    for (const r of filtered) {
      if (!byDate.has(r.dateKey)) {
        byDate.set(r.dateKey, []);
      }
      byDate.get(r.dateKey).push(r);
    }
    return [...byDate.entries()].map(([title, data]) => ({title, data}));
  }, [records, query]);

  const exportCsv = async () => {
    await Share.share({
      title: 'Attendance report',
      message: toCsv(records),
    });
  };

  return (
    <Screen>
      <Header
        title="Attendance History"
        subtitle={`${records.length} records`}
        onBack={() => navigate('home')}
      />
      <View style={{paddingHorizontal: 18, paddingTop: 14}}>
        <Field
          placeholder="Search by worker, department, or date (YYYY-MM-DD)"
          value={query}
          onChangeText={setQuery}
        />
      </View>
      <SectionList
        sections={sections}
        keyExtractor={r => r.id}
        contentContainerStyle={{paddingHorizontal: 18, paddingBottom: 10}}
        ListEmptyComponent={<EmptyState text="No attendance records yet." />}
        renderSectionHeader={({section}) => (
          <Text style={styles.section}>
            {section.title} · {section.data.length} present
          </Text>
        )}
        renderItem={({item}) => (
          <View style={styles.row}>
            <View style={{flex: 1}}>
              <Text style={styles.name}>{item.workerName}</Text>
              <Text style={styles.meta}>
                {new Date(item.timestamp).toLocaleTimeString()} ·{' '}
                {item.area ? `${item.area} · ` : ''}
                {item.department || 'General'} · by {item.supervisor}
              </Text>
              <Text style={styles.meta}>
                {item.location
                  ? `📍 ${item.location.lat.toFixed(5)}, ${item.location.lng.toFixed(5)}`
                  : '📍 no location'}{' '}
                · match {Math.round(item.similarity * 100)}%
              </Text>
            </View>
            <Badge
              text={item.synced ? 'Synced' : 'Pending'}
              color={item.synced ? colors.success : colors.warning}
            />
          </View>
        )}
      />
      {records.length > 0 ? (
        <View style={{padding: 18}}>
          <Button title="Export Report (CSV)" variant="secondary" onPress={exportCsv} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    marginTop: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  name: {fontSize: 15, fontWeight: '700', color: colors.text},
  meta: {fontSize: 12, color: colors.textMuted, marginTop: 2},
});
