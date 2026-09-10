import React from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {c, r, t} from '../theme';
import {useLang} from '../i18n';
import {AppBar, Avatar, BottomBar, Divider, EmptyState, FilledButton, Icon, Screen, SkeletonList, StatusPill} from '../ui';
import {localizeDesignation, localizeWorkerName} from '../localize';

/**
 * The worker-management list: tap a worker to edit their details, or use the
 * button at the bottom to add a new worker.
 */
export default function WorkerListScreen({workers, onEdit, onAdd, onBack, loading}) {
  const {t: tr, lang} = useLang();
  return (
    <Screen bg={c.surface}>
      <AppBar title={tr('manageWorkers')} onBack={onBack} />
      <Divider />
      <Text style={s.count}>{tr('workersInWard', {n: loading ? '…' : workers.length})}</Text>
      {loading ? (
        <SkeletonList n={6} />
      ) : (
      <FlatList
        data={workers}
        keyExtractor={w => String(w.id != null ? w.id : w.workerId)}
        ListEmptyComponent={<EmptyState icon="groups" text={tr('noWorkersYet')} />}
        ItemSeparatorComponent={Divider}
        contentContainerStyle={{paddingBottom: 12}}
        renderItem={({item: w}) => (
          <Pressable
            onPress={() => onEdit(w)}
            android_ripple={{color: '#00000010'}}
            style={s.row}>
            <Avatar name={localizeWorkerName(w.name, tr, lang)} uri={w.photoUri} size={44} />
            <View style={{flex: 1, marginLeft: 14}}>
              <Text style={s.name}>{localizeWorkerName(w.name, tr, lang)}</Text>
              <Text style={t.small}>
                {localizeDesignation(w.designation, tr)}
                {w.code ? ` · ${w.code}` : ''}
              </Text>
            </View>
            {w.onboardingCompleted === false ? (
              <StatusPill label={tr('addPhoto')} tone="warning" style={{marginRight: 8}} />
            ) : null}
            <Icon name="edit" size={20} color={c.textMuted} />
          </Pressable>
        )}
      />
      )}
      <BottomBar>
        <FilledButton label={tr('addWorker')} icon="person-add-alt" onPress={onAdd} />
      </BottomBar>
    </Screen>
  );
}

const s = StyleSheet.create({
  count: {...t.small, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6},
  row: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14},
  name: {fontSize: 16, fontWeight: '600', color: c.text},
});
