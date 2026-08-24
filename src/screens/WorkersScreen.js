import React, {useState} from 'react';
import {
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Button, EmptyState, Header, Screen} from '../components';
import {colors} from '../theme';
import {deleteWorker} from '../storage';

export default function WorkersScreen({workers, setWorkers, navigate}) {
  const [busy, setBusy] = useState(false);

  const confirmDelete = worker => {
    Alert.alert(
      'Remove worker',
      `Remove ${worker.name} and their enrolled face data? Past attendance records are kept.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              setWorkers(await deleteWorker(worker.id));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Header
        title="Workers"
        subtitle={`${workers.length} enrolled`}
        onBack={() => navigate('home')}
      />
      <FlatList
        data={workers}
        keyExtractor={w => w.id}
        contentContainerStyle={{padding: 18, gap: 10}}
        ListEmptyComponent={
          <EmptyState text="No workers enrolled yet. Enroll a worker with a clear face photo to begin marking attendance." />
        }
        renderItem={({item}) => (
          <View style={styles.row}>
            {item.faceUri ? (
              <Image source={{uri: item.faceUri}} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={{fontSize: 20}}>👷</Text>
              </View>
            )}
            <View style={{flex: 1}}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {item.area ? `${item.area} · ` : ''}
                {item.department || 'General'} · ID {item.shortId}
              </Text>
            </View>
            <TouchableOpacity onPress={() => confirmDelete(item)} disabled={busy}>
              <Text style={styles.delete}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      />
      <View style={{padding: 18}}>
        <Button title="+ Enroll New Worker" onPress={() => navigate('enroll')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  avatar: {width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border},
  avatarFallback: {alignItems: 'center', justifyContent: 'center'},
  name: {fontSize: 15, fontWeight: '700', color: colors.text},
  meta: {fontSize: 12, color: colors.textMuted, marginTop: 2},
  delete: {color: colors.danger, fontWeight: '700', fontSize: 13},
});
