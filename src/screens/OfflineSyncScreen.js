import React, {useState} from 'react';
import {ScrollView, Share, StyleSheet, Text, View} from 'react-native';
import {c, r, t} from '../theme';
import {useLang} from '../i18n';
import {
  AppBar,
  Banner,
  BottomBar,
  Divider,
  EmptyState,
  FilledButton,
  Icon,
  InfoBlock,
  Screen,
  SectionLabel,
  StatusPill,
  TextButton,
} from '../ui';
import {clockTime, shiftLabel, timeOfDay} from '../domain/shifts';
import {flushQueue, getMatchLog, matchLogCsv} from '../storage';

export default function OfflineSyncScreen({records, lastSync, isOnline, onBack, onSynced}) {
  const {t: tr} = useLang();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const queued = records.filter(r2 => !r2.synced);

  const retry = async () => {
    setBusy(true);
    try {
      const res = await flushQueue(isOnline);
      onSynced(res.records);
      setNote(
        !res.online
          ? tr('offlineCannotSync')
          : res.synced > 0
          ? tr('syncedNow', {n: res.synced})
          : tr('nothingQueued'),
      );
    } finally {
      setBusy(false);
    }
  };

  // Shares the raw face-match attempt log (real cosine scores, matched or not)
  // as text — the data MATCH_THRESHOLD should eventually be tuned from instead
  // of guessed. Text share needs no file-provider setup, unlike sharing a file.
  const exportLog = async () => {
    const log = await getMatchLog();
    if (!log.length) {
      setNote(tr('matchLogEmpty'));
      return;
    }
    try {
      await Share.share({message: await matchLogCsv(), title: tr('exportMatchLog')});
    } catch (e) {
      // share sheet dismissed/failed — nothing to recover
    }
  };

  return (
    <Screen bg={c.surface}>
      {!isOnline ? (
        <View style={s.offlineBar}>
          <Icon name="cloud-off" size={24} color={c.warningStrong} style={{marginRight: 14}} />
          <View style={{flex: 1}}>
            <Text style={s.offlineTitle}>{tr('youAreOffline')}</Text>
            <Text style={s.offlineSub}>{tr('waitingToSync', {n: queued.length})}</Text>
          </View>
        </View>
      ) : null}

      <AppBar title={tr('markAttendance')} onBack={onBack} />
      <Divider />

      <ScrollView contentContainerStyle={{padding: 16, paddingBottom: 20}}>
        <InfoBlock icon="save-alt">{tr('offlineExplain')}</InfoBlock>

        <SectionLabel style={{paddingHorizontal: 0}}>{tr('queuedOnDevice')}</SectionLabel>

        {queued.length === 0 ? (
          <EmptyState icon="cloud-done" text={tr('nothingQueued')} />
        ) : (
          <View style={s.queueCard}>
            {queued.map((rec, i) => (
              <View key={rec.id}>
                {i > 0 ? <Divider /> : null}
                <View style={s.queueRow}>
                  <Icon name="schedule" size={22} color={c.warningStrong} style={{marginRight: 14}} />
                  <View style={{flex: 1}}>
                    <Text style={s.queueName}>{rec.workerName}</Text>
                    <Text style={t.small}>
                      {shiftLabel(tr, rec.shift)} · {timeOfDay(rec.capturedAt)} ·{' '}
                      {tr('insideGeofenceTitle')}
                    </Text>
                  </View>
                  <StatusPill label={tr('queued')} tone="pending" />
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={s.metaRow}>
          <Text style={t.small}>
            {lastSync ? tr('lastSynced', {time: clockTime(lastSync)}) : tr('neverSynced')}
          </Text>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Icon
              name={isOnline ? 'signal-cellular-alt' : 'signal-cellular-off'}
              size={17}
              color={isOnline ? c.success : c.textMuted}
            />
          </View>
        </View>

        {note ? <Banner tone="info" icon="info-outline" body={note} style={{marginTop: 14}} /> : null}

        <TextButton label={tr('exportMatchLog')} onPress={exportLog} style={{marginTop: 18}} />
      </ScrollView>

      <BottomBar>
        <FilledButton label={tr('retrySyncNow')} icon="sync" onPress={retry} busy={busy} />
        <Text style={s.keep}>{tr('keepInstalled')}</Text>
      </BottomBar>
    </Screen>
  );
}

const s = StyleSheet.create({
  offlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.warningContainer,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  offlineTitle: {fontSize: 15.5, fontWeight: '600', color: c.text},
  offlineSub: {fontSize: 13, color: c.textMuted, marginTop: 1},

  queueCard: {borderWidth: 1, borderColor: c.outlineSoft, borderRadius: r.card, overflow: 'hidden'},
  queueRow: {flexDirection: 'row', alignItems: 'center', padding: 14},
  queueName: {fontSize: 15.5, fontWeight: '600', color: c.text},

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  keep: {...t.small, textAlign: 'center', marginTop: 12},
});
