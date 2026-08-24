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
import {Badge, Button, Card, EmptyState, Header, Screen} from '../components';
import {colors} from '../theme';
import {capturePhoto, getLocation} from '../device';
import {
  MATCH_THRESHOLD,
  cosineSimilarity,
  extractFaceEmbedding,
  faceErrorMessage,
} from '../face';
import {addAttendance, dateKey} from '../storage';

export default function AttendanceScreen({
  session,
  workers,
  records,
  setRecords,
  navigate,
  isOnline,
}) {
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // {ok, similarity, record?}

  const todayKey = dateKey(new Date());
  const markedToday = new Set(
    records.filter(r => r.dateKey === todayKey).map(r => r.workerId),
  );

  const verifyAndRecord = async worker => {
    setBusy(true);
    setResult(null);
    try {
      const asset = await capturePhoto(false);
      if (!asset) {
        return;
      }
      const {embedding} = await extractFaceEmbedding(asset.uri);
      const similarity = cosineSimilarity(embedding, worker.embedding);
      if (similarity < MATCH_THRESHOLD) {
        setResult({ok: false, similarity, workerName: worker.name});
        return;
      }
      const location = await getLocation();
      const now = new Date();
      const record = {
        id: `a_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
        workerId: worker.id,
        workerName: worker.name,
        department: worker.department || '',
        area: worker.area || '',
        timestamp: now.toISOString(),
        dateKey: dateKey(now),
        location,
        supervisor: session.name,
        supervisorUsername: session.username,
        similarity: Math.round(similarity * 100) / 100,
        status: 'present',
        synced: false,
      };
      setRecords(await addAttendance(record));
      setResult({ok: true, similarity, record});
    } catch (err) {
      Alert.alert('Verification', faceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const pct = Math.round(result.similarity * 100);
    return (
      <Screen>
        <Header title="Attendance Result" onBack={() => setResult(null)} />
        <View style={{padding: 18}}>
          <Card style={{alignItems: 'center', paddingVertical: 30}}>
            <Text style={{fontSize: 52}}>{result.ok ? '✅' : '❌'}</Text>
            <Text style={styles.resultTitle}>
              {result.ok ? 'Attendance Recorded' : 'Face Did Not Match'}
            </Text>
            <Text style={styles.resultName}>
              {result.ok ? result.record.workerName : result.workerName}
            </Text>
            <Badge
              text={`Face match: ${pct}%`}
              color={result.ok ? colors.success : colors.danger}
            />
            {result.ok ? (
              <View style={{marginTop: 16, alignItems: 'center', gap: 4}}>
                <Text style={styles.resultMeta}>
                  {new Date(result.record.timestamp).toLocaleString()}
                </Text>
                <Text style={styles.resultMeta}>
                  {result.record.location
                    ? `GPS: ${result.record.location.lat.toFixed(5)}, ${result.record.location.lng.toFixed(5)}`
                    : 'GPS: unavailable (recorded without location)'}
                </Text>
                <Text style={styles.resultMeta}>
                  Supervisor: {result.record.supervisor}
                </Text>
                <Badge
                  text={isOnline ? 'Synced' : 'Saved offline — will sync when online'}
                  color={isOnline ? colors.success : colors.warning}
                />
              </View>
            ) : (
              <Text style={[styles.resultMeta, {marginTop: 12, textAlign: 'center'}]}>
                The captured face does not match the enrolled photo. Retake in
                better light, or re-enroll the worker if their appearance has
                changed.
              </Text>
            )}
            <Button
              title={result.ok ? 'Done' : 'Try Again'}
              onPress={() => {
                setResult(null);
                if (result.ok) {
                  setSelected(null);
                }
              }}
              style={{marginTop: 22, alignSelf: 'stretch'}}
            />
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title="Mark Attendance"
        subtitle="Select worker, then capture their photo"
        onBack={() => navigate('home')}
      />
      <FlatList
        data={workers}
        keyExtractor={w => w.id}
        contentContainerStyle={{padding: 18, gap: 10}}
        ListEmptyComponent={
          <EmptyState text="No workers enrolled. Enroll workers first from the Workers screen." />
        }
        renderItem={({item}) => {
          const done = markedToday.has(item.id);
          const isSel = selected && selected.id === item.id;
          return (
            <TouchableOpacity
              onPress={() => setSelected(isSel ? null : item)}
              style={[styles.row, isSel && styles.rowSelected]}>
              {item.faceUri ? (
                <Image source={{uri: item.faceUri}} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, {alignItems: 'center', justifyContent: 'center'}]}>
                  <Text>👷</Text>
                </View>
              )}
              <View style={{flex: 1}}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>{item.department || 'General'}</Text>
              </View>
              {done ? <Badge text="Present today" color={colors.success} /> : null}
            </TouchableOpacity>
          );
        }}
      />
      <View style={{padding: 18}}>
        <Button
          title={
            selected
              ? `📸 Capture & Verify ${selected.name}`
              : 'Select a worker above'
          }
          disabled={!selected}
          busy={busy}
          onPress={() => verifyAndRecord(selected)}
        />
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
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  rowSelected: {borderColor: colors.primary, backgroundColor: '#eaf3ec'},
  avatar: {width: 44, height: 44, borderRadius: 22, backgroundColor: colors.border},
  name: {fontSize: 15, fontWeight: '700', color: colors.text},
  meta: {fontSize: 12, color: colors.textMuted},
  resultTitle: {fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 10},
  resultName: {fontSize: 15, color: colors.textMuted, marginVertical: 8},
  resultMeta: {fontSize: 13, color: colors.textMuted},
});
