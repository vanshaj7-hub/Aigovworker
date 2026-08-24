import React, {useState} from 'react';
import {Alert, Image, ScrollView, StyleSheet, Text, View} from 'react-native';
import RNFS from 'react-native-fs';
import {Button, Card, Field, Header, Screen} from '../components';
import {colors} from '../theme';
import {capturePhoto} from '../device';
import {extractFaceEmbedding, faceErrorMessage} from '../face';
import {saveWorker} from '../storage';

const FACES_DIR = `${RNFS.DocumentDirectoryPath}/faces`;

export default function EnrollScreen({setWorkers, navigate}) {
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [department, setDepartment] = useState('');
  const [capture, setCapture] = useState(null); // {embedding, faceUri}
  const [busy, setBusy] = useState(false);

  const takePhoto = async () => {
    setBusy(true);
    try {
      const asset = await capturePhoto(false);
      if (!asset) {
        return;
      }
      const result = await extractFaceEmbedding(asset.uri);
      setCapture(result);
    } catch (err) {
      Alert.alert('Face capture', faceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Enter the worker name.');
      return;
    }
    if (!capture) {
      Alert.alert('Missing face photo', 'Capture the worker face photo first.');
      return;
    }
    setBusy(true);
    try {
      const id = `w_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      await RNFS.mkdir(FACES_DIR);
      const storedFace = `${FACES_DIR}/${id}.jpg`;
      await RNFS.copyFile(
        capture.faceUri.replace('file://', ''),
        storedFace,
      );
      const worker = {
        id,
        shortId: String(Date.now()).slice(-6),
        name: name.trim(),
        area: area.trim(),
        department: department.trim(),
        embedding: capture.embedding,
        faceUri: `file://${storedFace}`,
        enrolledAt: new Date().toISOString(),
      };
      setWorkers(await saveWorker(worker));
      Alert.alert('Enrolled', `${worker.name} is enrolled for face attendance.`);
      navigate('workers');
    } catch (err) {
      Alert.alert('Enrollment failed', String(err && err.message ? err.message : err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="Enroll Worker" onBack={() => navigate('workers')} />
      <ScrollView contentContainerStyle={{padding: 18}}>
        <Card>
          <Field label="Worker Name" value={name} onChangeText={setName} placeholder="e.g. Ramesh Kumar" />
          <Field
            label="Area / Region"
            value={area}
            onChangeText={setArea}
            placeholder="e.g. Ward 1 – Clock Tower"
          />
          <Field
            label="Department (optional)"
            value={department}
            onChangeText={setDepartment}
            placeholder="e.g. Sanitation"
          />
          <View style={styles.faceRow}>
            {capture ? (
              <Image source={{uri: capture.faceUri}} style={styles.facePreview} />
            ) : (
              <View style={[styles.facePreview, styles.faceEmpty]}>
                <Text style={{fontSize: 30}}>🙂</Text>
              </View>
            )}
            <View style={{flex: 1}}>
              <Text style={styles.faceHint}>
                {capture
                  ? 'Face captured and verified. Retake if the preview is unclear.'
                  : 'Capture a clear, front-facing photo of the worker in good light.'}
              </Text>
              <Button
                title={capture ? 'Retake Face Photo' : 'Capture Face Photo'}
                variant="secondary"
                onPress={takePhoto}
                busy={busy}
                style={{marginTop: 10}}
              />
            </View>
          </View>
        </Card>
        <Button title="Save Worker" onPress={save} busy={busy} style={{marginTop: 18}} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  faceRow: {flexDirection: 'row', gap: 14, alignItems: 'center'},
  facePreview: {width: 92, height: 92, borderRadius: 12, backgroundColor: colors.border},
  faceEmpty: {alignItems: 'center', justifyContent: 'center'},
  faceHint: {fontSize: 13, color: colors.textMuted, lineHeight: 18},
});
