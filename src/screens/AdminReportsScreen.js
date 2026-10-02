import React, {useState} from 'react';
import {ActivityIndicator, ScrollView, StyleSheet, Text, View} from 'react-native';
import {alert} from '../alert';
import {c, t} from '../theme';
import {useLang} from '../i18n';
import {
  Banner,
  Card,
  Divider,
  EmptyState,
  Field,
  FilledButton,
  FilterChip,
  LanguageToggle,
  PickerField,
  Screen,
  StatusPill,
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
      alert(tr('reportGenerated'), tr('reportGeneratedBody'));
      onRefresh();
    } finally {
      setGenerating(false);
    }
  };

  const download = async report => {
    setDownloadingId(report.id);
    try {
      const name = filenameFromUrl(report.fileUrl);
      await downloadReportFile(report.fileUrl, name);
      alert(tr('downloaded'), tr('downloadedBody', {name}));
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
      <Divider />

      <ScrollView contentContainerStyle={s.body}>
        {error ? <Banner tone="error" icon="error-outline" body={error} /> : null}

        <View style={s.pillRow}>
          {PRESETS.map(key => (
            <FilterChip key={key} label={tr(PRESET_KEY[key])} selected={preset === key} onPress={() => pickPreset(key)} />
          ))}
        </View>
        <View style={s.dateRow}>
          <Field label={tr('fromDate')} value={fromDate} onPress={() => setDateTarget('from')} style={{flex: 1, marginRight: 8}} />
          <Field label={tr('toDate')} value={toDate} onPress={() => setDateTarget('to')} style={{flex: 1}} />
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
            <Text style={[t.small, {marginTop: -10, marginBottom: 16}]}>{tr('scopeNote')}</Text>
          </>
        ) : null}

        <Text style={[t.label, {marginBottom: 8}]}>{tr('generateReport')}</Text>
        <View style={s.pillRow}>
          <FilterChip label={tr('formatCsv')} selected={format === 'csv'} onPress={() => setFormat('csv')} />
          <FilterChip label={tr('formatPdf')} selected={format === 'pdf'} onPress={() => setFormat('pdf')} />
        </View>
        <Text style={[t.small, {marginBottom: 16}]}>{format === 'csv' ? tr('formatCsvNote') : tr('formatPdfNote')}</Text>

        <FilledButton label={tr('generateReport')} onPress={submit} busy={generating} style={{marginBottom: 24}} />

        <Text style={[t.label, {marginBottom: 10}]}>{tr('recentExports')}</Text>
        {loading && !recent ? (
          <ActivityIndicator color={c.primary} />
        ) : !recent || recent.length === 0 ? (
          <EmptyState icon="description" text={tr('noReportsYet')} />
        ) : (
          recent.map(r => (
            <Card key={r.id} style={s.reportRow}>
              <View style={{flex: 1}}>
                <Text style={s.range}>{r.range}</Text>
                <Text style={t.small}>{r.scope}</Text>
                <Text style={t.small}>{r.when}</Text>
              </View>
              <StatusPill label={r.format.toUpperCase()} tone="neutral" style={{marginRight: 10}} />
              <TextButton
                label={downloadingId === r.id ? '…' : tr('download')}
                onPress={() => download(r)}
              />
            </Card>
          ))
        )}
        <Text style={[t.small, s.footerNote]}>{tr('reportsFooterNote')}</Text>
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
    backgroundColor: c.surface,
  },
  title: {fontSize: 17, fontWeight: '600', color: c.text},
  body: {padding: 16, paddingBottom: 32},
  pillRow: {flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap'},
  dateRow: {flexDirection: 'row', marginBottom: 16},
  reportRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 10},
  range: {fontSize: 14.5, fontWeight: '600', color: c.text},
  footerNote: {lineHeight: 17, marginTop: 8},
});
