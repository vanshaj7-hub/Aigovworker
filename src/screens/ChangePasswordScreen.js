import React, {useMemo, useState} from 'react';
import {Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
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
import {changePassword} from '../storage';

/**
 * Reached two ways: automatically after signing in with the temporary password
 * the IT team issued, where it can be skipped; or on demand from Home, where it
 * cannot be skipped but can be backed out of.
 */
export default function ChangePasswordScreen({email, forced, onDone, onSkip, onBack}) {
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
      Alert.alert(tr('changePasswordTitle'), tr('currentPasswordHint'));
      return;
    }
    if (!check.valid) {
      Alert.alert(tr('changePasswordTitle'), tr('pwWeak'));
      return;
    }
    if (pw !== confirm) {
      Alert.alert(tr('changePasswordTitle'), tr('pwMismatch'));
      return;
    }
    setBusy(true);
    try {
      const res = await changePassword(email, current, pw);
      if (!res.ok) {
        Alert.alert(
          tr('changePasswordTitle'),
          res.reason === 'badOldPassword' ? tr('signInFailedBody') : tr('noAccountFound'),
        );
        return;
      }
      Alert.alert(tr('changePasswordTitle'), tr('passwordChanged'));
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bg={c.surface}>
      <AppBar
        title={tr('changePasswordTitle')}
        onBack={forced ? undefined : onBack}
        right={forced ? <StatusPill label={tr('tempPasswordChip')} tone="warning" /> : undefined}
      />
      <Divider />
      <KeyboardAvoidingView behavior="height" style={{flex: 1}}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Text style={s.sub}>
            {forced ? tr('changePasswordForced') : tr('changePasswordVoluntary')}
          </Text>

          <Field
            label={tr('currentPassword')}
            value={current}
            onChangeText={setCurrent}
            secure
          />
          <View style={s.hintRow}>
            <Icon name="info-outline" size={16} style={{marginRight: 8, marginTop: 1}} />
            <Text style={s.hint}>{tr('currentPasswordHint')}</Text>
          </View>

          <Field label={tr('newPassword')} value={pw} onChangeText={setPw} secure />
          <PasswordChecklist results={check.results} labels={labels} />
          <Field label={tr('confirmPassword')} value={confirm} onChangeText={setConfirm} secure />

          <FilledButton
            label={tr('changePassword')}
            onPress={submit}
            busy={busy}
            disabled={!ready}
          />

          {forced ? (
            <Pressable onPress={onSkip} hitSlop={8} style={s.skip}>
              <Text style={s.skipText}>{tr('keepTempPassword')}</Text>
            </Pressable>
          ) : null}
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
  skip: {alignItems: 'center', paddingVertical: 18},
  skipText: {color: c.primaryDark, fontSize: 14.5, fontWeight: '600'},
});
