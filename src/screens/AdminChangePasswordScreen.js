import React, {useMemo, useState} from 'react';
import {KeyboardAvoidingView, ScrollView, StyleSheet, Text, View} from 'react-native';
import {alert} from '../alert';
import {c, t} from '../theme';
import {useLang} from '../i18n';
import {
  AppBar,
  Divider,
  Field,
  FilledButton,
  Icon,
  PasswordChecklist,
  Screen,
  StatusPill,
} from '../ui';
import {checkPassword} from '../domain/password';
import {adminChangePassword} from '../adminSession';

/**
 * Mandatory first-sign-in password change for the admin flow (Dept Head / CSI
 * / Sanitary Inspector) — same "no skip" rule as the supervisor's forced
 * change (ChangePasswordScreen), kept as a separate screen/component so
 * nothing here can affect that flow.
 */
export default function AdminChangePasswordScreen({user, onDone}) {
  const {t: tr} = useLang();
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const check = useMemo(() => checkPassword(pw), [pw]);
  const labels = {len: tr('pwLen'), caseNum: tr('pwCaseNum'), special: tr('pwSpecial')};
  const ready = check.valid && !!current && pw === confirm;

  const submit = async () => {
    if (!current) {
      alert(tr('changePasswordTitle'), tr('currentPasswordHint'));
      return;
    }
    if (!check.valid) {
      alert(tr('changePasswordTitle'), tr('pwWeak'));
      return;
    }
    if (pw !== confirm) {
      alert(tr('changePasswordTitle'), tr('pwMismatch'));
      return;
    }
    if (current === pw) {
      alert(tr('changePasswordTitle'), tr('pwSameAsCurrent'));
      return;
    }
    setBusy(true);
    try {
      const res = await adminChangePassword({user, oldPassword: current, newPassword: pw});
      if (!res.ok) {
        const msg =
          res.reason === 'badOldPassword'
            ? tr('currentPasswordWrong')
            : res.reason === 'network'
            ? res.message || tr('connectionProblem')
            : tr('adminSignInFailedBody');
        alert(tr('changePasswordTitle'), msg);
        return;
      }
      alert(tr('changePasswordTitle'), tr('passwordChanged'));
      onDone(res.user);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bg={c.surface}>
      <AppBar title={tr('changePasswordTitle')} right={<StatusPill label={tr('tempPasswordChip')} tone="warning" />} />
      <Divider />
      <KeyboardAvoidingView behavior="height" style={{flex: 1}}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Text style={s.sub}>{tr('changePasswordForced')}</Text>

          <Field label={tr('currentPassword')} value={current} onChangeText={setCurrent} secure />
          <View style={s.hintRow}>
            <Icon name="info-outline" size={16} style={{marginRight: 8, marginTop: 1}} />
            <Text style={s.hint}>{tr('currentPasswordHint')}</Text>
          </View>

          <Field label={tr('newPassword')} value={pw} onChangeText={setPw} secure />
          <PasswordChecklist results={check.results} labels={labels} />
          <Field label={tr('confirmPassword')} value={confirm} onChangeText={setConfirm} secure />

          <FilledButton label={tr('changePassword')} onPress={submit} busy={busy} disabled={!ready} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: {paddingHorizontal: 24, paddingTop: 22, paddingBottom: 30},
  sub: {...t.bodyMuted, marginBottom: 22, lineHeight: 20},
  hintRow: {flexDirection: 'row', marginTop: -8, marginBottom: 18},
  hint: {...t.small, flex: 1, lineHeight: 16},
});
