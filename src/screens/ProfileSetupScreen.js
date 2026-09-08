import React, {useMemo, useState} from 'react';
import {Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {c, r, t} from '../theme';
import {useLang} from '../i18n';
import {
  AppBar,
  Banner,
  BottomBar,
  Field,
  FilledButton,
  Icon,
  Screen,
  StatusPill,
  TextButton,
} from '../ui';
import {profileGaps, saveProfile} from '../storage';

export default function ProfileSetupScreen({session, ward, profile, onDone, openCamera, onSkip}) {
  const {t: tr} = useLang();
  const designations = tr('designations');
  // Pre-fill from what the backend already knows (login/supervisor-home return
  // the full name). Phone is not returned by any endpoint, so it starts blank.
  const [name, setName] = useState(profile?.name || session?.fullName || '');
  const [mobile, setMobile] = useState(profile?.mobile || session?.phone || '');
  const [designation, setDesignation] = useState(profile?.designation || designations[3]);
  const [photo, setPhoto] = useState(profile?.photoUri || null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Re-entering because an earlier profile was left incomplete.
  const returning = !!profile;
  const gaps = useMemo(
    () => profileGaps({name, mobile, designation, photoUri: photo}),
    [name, mobile, designation, photo],
  );
  const gapWords = gaps
    .map(g => tr('gap' + g.charAt(0).toUpperCase() + g.slice(1)))
    .join(', ');

  const setPhotoFrom = async fn => {
    const uri = await fn();
    if (uri) {
      setPhoto(uri);
    }
  };

  const save = async () => {
    if (gaps.includes('name')) {
      Alert.alert(tr('completeProfile'), tr('nameRequired'));
      return;
    }
    if (gaps.includes('mobile')) {
      Alert.alert(tr('completeProfile'), tr('mobileInvalid'));
      return;
    }
    if (gaps.includes('photo')) {
      Alert.alert(tr('completeProfile'), tr('photoRequired'));
      return;
    }
    setBusy(true);
    try {
      const saved = await saveProfile({
        supervisorId: session.supervisorId,
        name: name.trim(),
        mobile: String(mobile).replace(/\D/g, ''),
        designation,
        photoUri: photo,
        wardCode: ward.code,
      });
      onDone(saved);
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
        {returning && gaps.length ? (
          <Banner
            tone="warning"
            icon="error-outline"
            title={tr('profileIncomplete')}
            body={tr('profileIncompleteBody', {gaps: gapWords})}
            style={{marginBottom: 22}}
          />
        ) : null}

        <Pressable onPress={() => setPhotoFrom(openCamera)} style={s.avatarWrap}>
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
          onChangeText={v => setMobile(v.replace(/\D/g, '').slice(0, 10))}
          icon="call"
          keyboardType="phone-pad"
        />
        <Field
          label={tr('designation')}
          value={designation}
          onPress={() => setPickerOpen(true)}
          right={<Icon name="expand-more" size={22} />}
        />

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
        <FilledButton
          label={tr('saveContinue')}
          onPress={save}
          busy={busy}
          disabled={gaps.length > 0}
        />
        {onSkip ? (
          <>
            <TextButton label={tr('skipForNow')} onPress={onSkip} style={{marginTop: 4}} />
            <Text style={s.skipNote}>{tr('skipProfileNote')}</Text>
          </>
        ) : null}
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
  step: {color: c.primaryDark, fontSize: 14, fontWeight: '600'},
  progressTrack: {height: 4, backgroundColor: c.outlineSoft},
  progressFill: {width: '50%', height: 4, backgroundColor: c.primary},
  body: {padding: 20, paddingTop: 24},
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
  skipNote: {...t.small, textAlign: 'center', marginTop: 8, lineHeight: 16},
  modalBg: {flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end'},
  sheet: {backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20},
  sheetRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 15},
});
