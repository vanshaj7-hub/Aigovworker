import React, {useMemo, useState} from 'react';
import {Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text} from 'react-native';
import {c, t} from '../theme';
import {useLang} from '../i18n';
import {
  AppBar,
  Banner,
  Divider,
  Field,
  FilledButton,
  PasswordChecklist,
  Screen,
} from '../ui';
import {checkPassword} from '../domain/password';
import {accountExists, resetPassword} from '../storage';

export default function ForgotPasswordScreen({onDone, onBack}) {
  const {t: tr} = useLang();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const check = useMemo(() => checkPassword(pw), [pw]);
  const labels = {len: tr('pwLen'), caseNum: tr('pwCaseNum'), special: tr('pwSpecial')};

  const submit = async () => {
    if (!id.trim()) {
      Alert.alert(tr('forgotTitle'), tr('idRequired'));
      return;
    }
    setBusy(true);
    try {
      if (!(await accountExists(id))) {
        Alert.alert(tr('forgotTitle'), tr('noAccountFound'));
        return;
      }
      if (!check.valid) {
        Alert.alert(tr('forgotTitle'), tr('pwWeak'));
        return;
      }
      if (pw !== confirm) {
        Alert.alert(tr('forgotTitle'), tr('pwMismatch'));
        return;
      }
      const res = await resetPassword(id, pw);
      if (res.ok) {
        Alert.alert(tr('forgotTitle'), tr('resetDone'));
        onDone();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bg={c.surface}>
      <AppBar title={tr('forgotTitle')} onBack={onBack} />
      <Divider />
      <KeyboardAvoidingView behavior="height" style={{flex: 1}}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Text style={s.sub}>{tr('forgotSub')}</Text>

          <Field
            label={tr('supervisorId')}
            value={id}
            onChangeText={setId}
            icon="badge"
            placeholder="SUP-042"
            autoCapitalize="characters"
          />
          <Field label={tr('newPassword')} value={pw} onChangeText={setPw} secure />
          <PasswordChecklist results={check.results} labels={labels} />
          <Field label={tr('confirmPassword')} value={confirm} onChangeText={setConfirm} secure />

          <FilledButton
            label={tr('resetAction')}
            onPress={submit}
            busy={busy}
            disabled={!check.valid || !id.trim() || pw !== confirm}
          />

          <Banner
            tone="info"
            icon="info-outline"
            body={tr('forgotHelp')}
            style={{marginTop: 22}}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: {paddingHorizontal: 24, paddingTop: 22, paddingBottom: 30},
  sub: {...t.bodyMuted, marginBottom: 22, lineHeight: 20},
});
