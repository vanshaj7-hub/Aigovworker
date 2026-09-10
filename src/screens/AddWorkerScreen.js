import React, {useState} from 'react';
import {Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {c, r, t} from '../theme';
import {useLang} from '../i18n';
import {AppBar, BottomBar, Divider, Field, FilledButton, Icon, Screen, TextButton} from '../ui';
import {addWorker} from '../storage';
import {extractFaceEmbedding, faceErrorMessage} from '../face';

// Canonical values sent to the backend, regardless of the interface language.
const GENDER_KEYS = ['Male', 'Female', 'Other'];

/** "DD/MM/YYYY" → "YYYY-MM-DD" if it is a real, sensible date, else null. */
function dobToIso(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) {
    return null;
  }
  const day = +m[1];
  const mon = +m[2];
  const year = +m[3];
  const d = new Date(year, mon - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== mon - 1 || d.getDate() !== day) {
    return null; // e.g. 31/02/2000
  }
  if (year < 1900 || d > new Date()) {
    return null; // absurd year or a date in the future
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export default function AddWorkerScreen({worker, onSaved, onUpdate, onBack, openCamera}) {
  const {t: tr} = useLang();
  const editing = !!worker;
  const designations = tr('designations');
  const [name, setName] = useState(worker?.name || '');
  const [father, setFather] = useState(worker?.fatherName || '');
  const [mobile, setMobile] = useState(worker?.mobile || '');
  const [gender, setGender] = useState(worker?.gender || 'Male');
  const [dob, setDob] = useState(''); // DD/MM/YYYY — not returned by the API, so blank
  const [designation, setDesignation] = useState(worker?.designation || designations[0]);
  const [picker, setPicker] = useState(null); // null | 'gender' | 'designation'
  // In edit mode the existing reference photo (an https URL) is shown; capturing
  // a new one replaces it. `embedding` is only set when a NEW photo is taken.
  const [photo, setPhoto] = useState(worker?.photoUri || worker?.referenceUrl || null);
  const [embedding, setEmbedding] = useState(null);
  const [busy, setBusy] = useState(false);

  const genderLabel = key => tr('gender_' + key.toLowerCase());

  // Auto-insert the slashes as the supervisor types the date of birth.
  const onDobChange = v => {
    const digits = v.replace(/\D/g, '').slice(0, 8);
    let out = digits;
    if (digits.length > 4) {
      out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    } else if (digits.length > 2) {
      out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    setDob(out);
  };

  const captureReference = async getUri => {
    const uri = await getUri();
    if (!uri) {
      return;
    }
    setBusy(true);
    try {
      // Detect the face (for the embedding) but keep the FULL captured photo for
      // upload/display — the reference image must not be cropped to the face.
      const {embedding: emb} = await extractFaceEmbedding(uri);
      setEmbedding(emb);
      setPhoto(uri);
    } catch (err) {
      Alert.alert(tr('referencePhotograph'), faceErrorMessage(err, tr));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (editing) {
      // Edit mode only saves the reference photo (that is all /edit-worker
      // accepts). A photo is required — an existing one, or a freshly captured.
      if (!photo) {
        Alert.alert(tr('editWorker'), tr('needReferencePhoto'));
        return;
      }
      setBusy(true);
      try {
        await onUpdate({
          workerId: worker.workerId != null ? worker.workerId : worker.id,
          fullName: worker.name,
          photoUri: photo, // https (unchanged) or file:// (newly captured)
          referenceUrl: worker.referenceUrl || null,
        });
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!name.trim()) {
      Alert.alert(tr('addWorker'), tr('nameRequired'));
      return;
    }
    // Add mode: a reference photo and a valid date of birth are required.
    if (!embedding) {
      Alert.alert(tr('addWorker'), tr('needNameAndPhoto'));
      return;
    }
    const iso = dobToIso(dob);
    if (!iso) {
      Alert.alert(tr('addWorker'), tr('dobInvalid'));
      return;
    }
    setBusy(true);
    try {
      const {workers, worker: created} = await addWorker({
        name: name.trim(),
        fatherName: father.trim(),
        mobile: mobile.trim(),
        gender,
        dateOfBirth: iso,
        designation,
        photoUri: photo,
        embedding,
      });
      // Awaited so the button stays busy until the worker is actually saved to
      // the backend (upload + POST), not just written on the device.
      await onSaved(workers, created);
    } finally {
      setBusy(false);
    }
  };

  const options = picker === 'gender' ? GENDER_KEYS : designations;
  const selected = picker === 'gender' ? gender : designation;
  const choose = value => {
    if (picker === 'gender') {
      setGender(value);
    } else {
      setDesignation(value);
    }
    setPicker(null);
  };

  return (
    <Screen bg={c.surface}>
      <AppBar title={tr(editing ? 'editWorker' : 'addWorker')} onBack={onBack} />
      <Divider />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => captureReference(openCamera)} style={s.refCard}>
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

        {editing ? (
          // The reference photo is the only field a supervisor can change; the
          // rest is read-only context managed by the IT admin.
          <View style={s.readOnly}>
            <Text style={s.roName}>{worker.name}</Text>
            <Text style={t.small}>
              {designation}
              {worker.code ? ` · ${worker.code}` : ''}
            </Text>
          </View>
        ) : (
          <>
            <Field label={tr('workerName')} value={name} onChangeText={setName} />
            <Field label={tr('fathersName')} value={father} onChangeText={setFather} />
            <Field
              label={tr('mobileNumber')}
              value={mobile}
              onChangeText={v => setMobile(v.replace(/\D/g, '').slice(0, 10))}
              icon="call"
              keyboardType="phone-pad"
            />
            <Field
              label={tr('gender')}
              value={genderLabel(gender)}
              onPress={() => setPicker('gender')}
              right={<Icon name="expand-more" size={22} />}
            />
            <Field
              label={tr('dateOfBirth')}
              value={dob}
              onChangeText={onDobChange}
              placeholder={tr('dobHint')}
              icon="cake"
              keyboardType="number-pad"
            />
            <Field
              label={tr('designation')}
              value={designation}
              onPress={() => setPicker('designation')}
              right={<Icon name="expand-more" size={22} />}
            />
          </>
        )}

        <View style={s.noteRow}>
          <Icon name="info-outline" size={19} style={{marginRight: 12, marginTop: 1}} />
          <Text style={[t.bodyMuted, {flex: 1, lineHeight: 20, fontSize: 13.5}]}>
            {tr(editing ? 'onboardingNote' : 'oneTimeNote')}
          </Text>
        </View>
      </ScrollView>

      <BottomBar style={s.bottom}>
        <TextButton label={tr('cancel')} onPress={onBack} />
        <FilledButton
          label={tr(editing ? 'saveChanges' : 'saveWorker')}
          onPress={save}
          busy={busy}
          style={{minWidth: 160}}
        />
      </BottomBar>

      <Modal visible={!!picker} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={s.modalBg} onPress={() => setPicker(null)}>
          <View style={s.sheet}>
            <Text style={[t.label, {marginBottom: 8}]}>
              {picker === 'gender' ? tr('gender') : tr('designation')}
            </Text>
            {options.map(opt => (
              <Pressable key={opt} onPress={() => choose(opt)} style={s.sheetRow}>
                <Text style={[t.body, {flex: 1, fontSize: 16}]}>
                  {picker === 'gender' ? genderLabel(opt) : opt}
                </Text>
                {selected === opt ? <Icon name="check" size={20} color={c.primary} /> : null}
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

  readOnly: {
    backgroundColor: c.bg,
    borderRadius: r.card,
    borderWidth: 1,
    borderColor: c.outlineSoft,
    padding: 16,
    marginBottom: 6,
  },
  roName: {fontSize: 17, fontWeight: '600', color: c.text, marginBottom: 3},
  noteRow: {flexDirection: 'row', marginTop: 6},
  bottom: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},

  modalBg: {flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end'},
  sheet: {backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20},
  sheetRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 15},
});
