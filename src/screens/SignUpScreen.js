import React, {useMemo, useState} from 'react';
import {Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {c, t} from '../theme';
import {useLang} from '../i18n';
import {
  AppBar,
  Divider,
  Field,
  FilledButton,
  PasswordChecklist,
  Screen,
} from '../ui';
import {checkPassword} from '../domain/password';
import {signUp} from '../storage';

export default function SignUpScreen({onSignedUp, onBack}) {
  const {t: tr} = useLang();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const check = useMemo(() => checkPassword(pw), [pw]);
  const labels = {
    len: tr('pwLen'),
    caseNum: tr('pwCaseNum'),
    special: tr('pwSpecial'),
  };

  const submit = async () => {
    if (!id.trim()) {
      Alert.alert(tr('createAccount'), tr('idRequired'));
      return;
    }
    if (!check.valid) {
      Alert.alert(tr('createAccount'), tr('pwWeak'));
      return;
    }
    if (pw !== confirm) {
      Alert.alert(tr('createAccount'), tr('pwMismatch'));
      return;
    }
    setBusy(true);
    try {
      const res = await signUp(id, pw);
      if (res.ok) {
        onSignedUp(res.session);
      } else {
        Alert.alert(tr('createAccount'), tr('idTaken'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bg={c.surface}>
      <AppBar title={tr('createAccount')} onBack={onBack} />
      <Divider />
      <KeyboardAvoidingView behavior="height" style={{flex: 1}}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Text style={s.sub}>{tr('createAccountSub')}</Text>

          <Field
            label={tr('supervisorId')}
            value={id}
            onChangeText={setId}
            icon="badge"
            placeholder="SUP-043"
            autoCapitalize="characters"
          />
          <Field label={tr('password')} value={pw} onChangeText={setPw} secure />
          <PasswordChecklist results={check.results} labels={labels} />
          <Field label={tr('confirmPassword')} value={confirm} onChangeText={setConfirm} secure />

          <FilledButton
            label={tr('signUpAction')}
            onPress={submit}
            busy={busy}
            disabled={!check.valid || !id.trim() || pw !== confirm}
          />

          <View style={s.footRow}>
            <Text style={t.small}>{tr('haveAccountQ')} </Text>
            <Pressable onPress={onBack} hitSlop={8}>
              <Text style={s.link}>{tr('signInInstead')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: {paddingHorizontal: 24, paddingTop: 22, paddingBottom: 30},
  sub: {...t.bodyMuted, marginBottom: 22, lineHeight: 20},
  link: {color: c.primaryDark, fontSize: 13, fontWeight: '700'},
  footRow: {flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 22},
});
