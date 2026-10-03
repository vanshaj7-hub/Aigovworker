import React, {useState} from 'react';
import {ActivityIndicator, ScrollView, StyleSheet, Text, ToastAndroid, View} from 'react-native';
import {alert} from '../alert';
import {ac, ar} from '../adminTheme';
import {useLang} from '../i18n';
import {
  Banner,
  EmptyState,
  FilledButton,
  FilterChip,
  FilterPillButton,
  LanguageToggle,
  PickerField,
  Screen,
  TextButton,
} from '../ui';
import DatePickerSheet from '../DatePickerSheet';
import {datePresetRange, filenameFromUrl, isStoragePermissionError} from '../domain/adminReports';
import {generateReport} from '../adminSession';
import {downloadReportFile} from '../adminDownload';

const PRESETS = ['today', 'thisWeek', 'thisMonth', 'custom'];
const PRESET_KEY = {today: 'presetToday', thisWeek: 'presetThisWeek', thisMonth: 'presetThisMonth', custom: 'presetCustom'};

export default function AdminReportsScreen({user, recent, loading, error, onRefresh, zw}) {
  const {t: tr} = useLang();
  const [preset, setPreset] = useState('today');
  const range0 = datePresetRange('today');
  const [fromDate, setFromDate] = useState(range0.from);
  const [toDate, setToDate] = useState(range0.to);
  const [format, setFormat] = useState('csv');
  const [dateTarget, setDateTarget] = useState(null); // null | 'from' | 'to'
  const [generating, setGenerating] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const pickPreset = key => {
    setPreset(key);
    const range = datePresetRange(key);
    if (range) {
      setFromDate(range.from);
      setToDate(range.to);
    }
  };

  const pickDate = key => {
    setDateTarget(null);
    setPreset('custom');
    if (dateTarget === 'to') {
      setToDate(key);
    } else {
      setFromDate(key);
      if (toDate < key) {
        setToDate(key);
      }
    }
  };

  const submit = async () => {
    setGenerating(true);
    try {
      const res = await generateReport(user, {fromDate, toDate, filterValue: zw.value, format});
      if (!res.ok) {
        const msg = isStoragePermissionError(res.message) ? tr('reportStorageError') : res.message || tr('uploadNetwork');
        alert(tr('reports'), msg);
        return;
      }
      onRefresh();
      // Download the freshly generated file straight away instead of just
      // pointing at "Recent exports below" — generating a report is the
      // point of this screen, so the result should be immediately
      // actionable, not a second lookup-and-tap away.
      try {
        ToastAndroid.show(tr('downloadStarted'), ToastAndroid.SHORT);
        await downloadReportFile(res.fileUrl, filenameFromUrl(res.fileUrl), format);
      } catch (err) {
        alert(tr('downloadFailed'), (err && err.message) || tr('uploadNetwork'));
      }
    } finally {
      setGenerating(false);
    }
  };

  const download = async report => {
    setDownloadingId(report.id);
    try {
      ToastAndroid.show(tr('downloadStarted'), ToastAndroid.SHORT);
      await downloadReportFile(report.fileUrl, filenameFromUrl(report.fileUrl), report.format);
    } catch (err) {
      alert(tr('downloadFailed'), (err && err.message) || tr('uploadNetwork'));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Screen>
      <View style={s.header}>
        <Text style={s.title}>{tr('reports')}</Text>
        <LanguageToggle />
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {error ? <Banner tone="error" icon="error-outline" body={error} /> : null}

        <View style={s.pillRow}>
          {PRESETS.map(key => (
            <FilterChip key={key} label={tr(PRESET_KEY[key])} selected={preset === key} onPress={() => pickPreset(key)} />
          ))}
        </View>
        <View style={s.dateRow}>
          <FilterPillButton icon="event" label={fromDate} onPress={() => setDateTarget('from')} chevron={false} style={{flex: 1}} />
          <FilterPillButton icon="event" label={toDate} onPress={() => setDateTarget('to')} chevron={false} style={{flex: 1}} />
        </View>

        {zw.options.length > 0 ? (
          <>
            <PickerField
              label={zw.kind === 'zone' ? tr('filterAllZones') : tr('filterAllWards')}
              value={zw.value}
              options={zw.options}
              onChange={zw.setValue}
              allLabel={zw.kind === 'zone' ? tr('filterAllZones') : tr('filterAllWards')}
            />
            <Text style={s.scopeNote}>{tr('scopeNote')}</Text>
          </>
        ) : null}

        <Text style={s.sectionLabel}>{tr('generateReport')}</Text>
        <View style={s.pillRow}>
          <FilterChip label={tr('formatCsv')} selected={format === 'csv'} onPress={() => setFormat('csv')} />
          <FilterChip label={tr('formatPdf')} selected={format === 'pdf'} onPress={() => setFormat('pdf')} />
        </View>
        <Text style={s.formatNote}>{format === 'csv' ? tr('formatCsvNote') : tr('formatPdfNote')}</Text>

        <FilledButton label={tr('generateReport')} onPress={submit} busy={generating} style={{marginBottom: 24}} />

        <Text style={s.sectionLabel}>{tr('recentExports')}</Text>
        {loading && !recent ? (
          <ActivityIndicator color={ac.blue} />
        ) : !recent || recent.length === 0 ? (
          <EmptyState icon="description" text={tr('noReportsYet')} />
        ) : (
          recent.map(r => (
            <View key={r.id} style={[s.card, s.reportRow]}>
              <View style={{flex: 1}}>
                <Text style={s.range}>{r.range}</Text>
                <Text style={s.metaText}>{r.scope}</Text>
                <Text style={s.metaText}>{r.when}</Text>
              </View>
              <View style={s.formatPill}>
                <Text style={s.formatPillText}>{r.format.toUpperCase()}</Text>
              </View>
              <TextButton label={downloadingId === r.id ? '…' : tr('download')} onPress={() => download(r)} />
            </View>
          ))
        )}
        <Text style={s.footerNote}>{tr('reportsFooterNote')}</Text>
      </ScrollView>

      <DatePickerSheet
        visible={!!dateTarget}
        value={dateTarget === 'to' ? toDate : fromDate}
        minDate={dateTarget === 'to' ? fromDate : undefined}
        onSelect={pickDate}
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
    backgroundColor: ac.white,
  },
  title: {fontSize: 17, fontWeight: '500', color: ac.textPrimary},
  body: {padding: 16, paddingBottom: 32},
  pillRow: {flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap'},
  dateRow: {flexDirection: 'row', gap: 8, marginBottom: 16},
  sectionLabel: {fontSize: 11.5, fontWeight: '600', color: ac.grey700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8},
  scopeNote: {fontSize: 11, color: ac.textSecondary, marginTop: 6, marginBottom: 16},
  formatNote: {fontSize: 11, color: ac.textSecondary, marginBottom: 16},
  card: {backgroundColor: ac.white, borderWidth: 1, borderColor: ac.border, borderRadius: ar.card, padding: 14},
  reportRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 10},
  range: {fontSize: 14.5, fontWeight: '500', color: ac.textPrimary},
  metaText: {fontSize: 11, color: ac.textSecondary},
  formatPill: {backgroundColor: ac.grey100, borderRadius: ar.pill, paddingHorizontal: 10, paddingVertical: 4, marginRight: 10},
  formatPillText: {fontSize: 10, fontWeight: '600', color: ac.grey700},
  footerNote: {fontSize: 11, color: ac.textSecondary, lineHeight: 17, marginTop: 8},
});
