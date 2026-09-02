import React, {useState} from 'react';
import {Alert, Image, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {c, r, t} from '../theme';
import {useLang} from '../i18n';
import {
  AppBar,
  BottomBar,
  Divider,
  Field,
  FilledButton,
  Icon,
  Screen,
  StatusPill,
} from '../ui';
import {saveProfile} from '../storage';
import {pickFromGallery} from '../device';

export default function ProfileSetupScreen({session, ward, onDone}) {
  const {t: tr} = useLang();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [designation, setDesignation] = useState(tr('designations')[3]);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      Alert.alert(tr('completeProfile'), tr('nameRequired'));
      return;
    }
    setBusy(true);
    try {
      const profile = await saveProfile({
        supervisorId: session.supervisorId,
        name: name.trim(),
        mobile: mobile.trim(),
        designation,
        photoUri: photo,
        wardCode: ward.code,
      });
      onDone(profile);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bg={c.surface}>
      <AppBar
        title={tr('completeProfile')}
        right={<Text style={s.step}>{tr('stepOf', {a: 1, b: 2})}</Text>}
      />
      <View style={s.progressTrack}>
        <View style={s.progressFill} />
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Pressable onPress={async () => setPhoto((await pickFromGallery()) || photo)} style={s.avatarWrap}>
          {photo ? (
            <Image source={{uri: photo}} style={s.avatarImg} />
          ) : (
            <View style={s.avatarPlaceholder}>
              <Icon name="add-a-photo" size={30} color={c.textMuted} />
            </View>
          )}
        </Pressable>
        <Text style={s.addPhoto}>{tr('addYourPhoto')}</Text>

        <Field label={tr('fullName')} value={name} onChangeText={setName} />
        <Field
          label={tr('mobileNumber')}
          value={mobile}
          onChangeText={setMobile}
          icon="call"
          keyboardType="phone-pad"
        />
        <Field label={tr('designation')} value={designation} onChangeText={setDesignation} />

        <View style={s.wardCard}>
          <Icon name="gpp-good" size={24} color={c.success} style={{marginRight: 14}} />
          <View style={{flex: 1}}>
            <Text style={t.small}>{tr('assignedWard')}</Text>
            <Text style={s.wardName}>{ward.name}</Text>
          </View>
          <StatusPill label={tr('verified')} tone="success" />
        </View>
        <Text style={s.note}>{tr('wardLocked')}</Text>
      </ScrollView>

      <BottomBar>
        <FilledButton label={tr('saveContinue')} onPress={save} busy={busy} />
      </BottomBar>
    </Screen>
  );
}

const s = StyleSheet.create({
  step: {color: c.primaryDark, fontSize: 14, fontWeight: '600'},
  progressTrack: {height: 4, backgroundColor: c.outlineSoft},
  progressFill: {width: '50%', height: 4, backgroundColor: c.primary},
  body: {padding: 20, paddingTop: 26},
  avatarWrap: {alignSelf: 'center'},
  avatarImg: {width: 104, height: 104, borderRadius: 52},
  avatarPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1.5,
    borderColor: c.outline,
    borderStyle: 'dashed',
    backgroundColor: c.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhoto: {...t.bodyMuted, textAlign: 'center', marginTop: 10, marginBottom: 22, fontSize: 13.5},
  wardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.bg,
    borderRadius: r.card,
    borderWidth: 1,
    borderColor: c.outlineSoft,
    padding: 14,
    marginTop: 4,
  },
  wardName: {fontSize: 16, fontWeight: '600', color: c.text, marginTop: 2},
  note: {...t.bodyMuted, fontSize: 13, lineHeight: 19, marginTop: 14},
});
