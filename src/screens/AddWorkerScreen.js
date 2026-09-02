import React, {useState} from 'react';
import {Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {c, r, t} from '../theme';
import {useLang} from '../i18n';
import {AppBar, BottomBar, Divider, Field, FilledButton, Icon, Screen, TextButton} from '../ui';
import {addWorker} from '../storage';
import {extractFaceEmbedding, faceErrorMessage} from '../face';

export default function AddWorkerScreen({onSaved, onBack, openCamera}) {
  const {t: tr} = useLang();
  const designations = tr('designations');
  const [name, setName] = useState('');
  const [father, setFather] = useState('');
  const [mobile, setMobile] = useState('');
  const [designation, setDesignation] = useState(designations[0]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [embedding, setEmbedding] = useState(null);
  const [busy, setBusy] = useState(false);

  const captureReference = async () => {
    const uri = await openCamera();
    if (!uri) {
      return;
    }
    setBusy(true);
    try {
      const {embedding: emb, faceUri} = await extractFaceEmbedding(uri);
      setEmbedding(emb);
      setPhoto(faceUri);
    } catch (err) {
      Alert.alert(tr('referencePhotograph'), faceErrorMessage(err, tr));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!name.trim() || !embedding) {
      Alert.alert(tr('addWorker'), tr('needNameAndPhoto'));
      return;
    }
    setBusy(true);
    try {
      const {workers, worker} = await addWorker({
        name: name.trim(),
        fatherName: father.trim(),
        mobile: mobile.trim(),
        designation,
        photoUri: photo,
        embedding,
      });
      onSaved(workers, worker);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bg={c.surface}>
      <AppBar title={tr('addWorker')} onBack={onBack} />
      <Divider />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Pressable onPress={captureReference} style={s.refCard}>
          <View style={s.refThumb}>
            {photo ? (
              <Image source={{uri: photo}} style={s.refImg} />
            ) : (
              <Icon name="add-a-photo" size={28} color={c.textMuted} />
            )}
          </View>
          <View style={{flex: 1, marginLeft: 16}}>
            <Text style={s.refTitle}>{tr('referencePhotograph')}</Text>
            <Text style={s.refHelp}>{tr('referenceHelp')}</Text>
          </View>
        </Pressable>

        <Field label={tr('workerName')} value={name} onChangeText={setName} />
        <Field label={tr('fathersName')} value={father} onChangeText={setFather} />
        <Field
          label={tr('mobileNumber')}
          value={mobile}
          onChangeText={setMobile}
          icon="call"
          keyboardType="phone-pad"
        />
        <Field
          label={tr('designation')}
          value={designation}
          onPress={() => setPickerOpen(true)}
          right={<Icon name="expand-more" size={22} />}
        />

        <View style={s.noteRow}>
          <Icon name="info-outline" size={19} style={{marginRight: 12, marginTop: 1}} />
          <Text style={[t.bodyMuted, {flex: 1, lineHeight: 20, fontSize: 13.5}]}>
            {tr('oneTimeNote')}
          </Text>
        </View>
      </ScrollView>

      <BottomBar style={s.bottom}>
        <TextButton label={tr('cancel')} onPress={onBack} />
        <FilledButton label={tr('saveWorker')} onPress={save} busy={busy} style={{minWidth: 160}} />
      </BottomBar>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={s.modalBg} onPress={() => setPickerOpen(false)}>
          <View style={s.sheet}>
            <Text style={[t.label, {marginBottom: 8}]}>{tr('designation')}</Text>
            {designations.map(d => (
              <Pressable
                key={d}
                onPress={() => {
                  setDesignation(d);
                  setPickerOpen(false);
                }}
                style={s.sheetRow}>
                <Text style={[t.body, {flex: 1, fontSize: 16}]}>{d}</Text>
                {designation === d ? <Icon name="check" size={20} color={c.primary} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: {padding: 20},
  refCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.bg,
    borderRadius: r.card,
    borderWidth: 1,
    borderColor: c.outlineSoft,
    padding: 16,
    marginBottom: 22,
  },
  refThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: c.outline,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: c.surface,
  },
  refImg: {width: '100%', height: '100%'},
  refTitle: {fontSize: 15.5, fontWeight: '600', color: c.text},
  refHelp: {...t.bodyMuted, fontSize: 13, lineHeight: 19, marginTop: 4},

  noteRow: {flexDirection: 'row', marginTop: 6},
  bottom: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},

  modalBg: {flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end'},
  sheet: {backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20},
  sheetRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 15},
});
