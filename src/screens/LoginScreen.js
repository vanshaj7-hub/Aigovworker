import React, {useState} from 'react';
import {Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View} from 'react-native';
import {c, t} from '../theme';
import {useLang} from '../i18n';
import {Field, FilledButton, Icon, LanguageToggle, Screen} from '../ui';
import {signIn} from '../storage';

export default function LoginScreen({onSignedIn}) {
  const {t: tr} = useLang();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const session = await signIn(id, pw);
      if (session) {
        onSignedIn(session);
      } else {
        Alert.alert(tr('signInFailed'), tr('signInFailedBody'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bg={c.surface}>
      <View style={s.top}>
        <LanguageToggle />
      </View>
      <KeyboardAvoidingView behavior="height" style={{flex: 1}}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={s.logo}>
            <Icon name="location-city" size={34} color={c.primaryDeep} />
          </View>
          <Text style={s.title}>{tr('signInTitle')}</Text>
          <Text style={s.sub}>{tr('signInSub')}</Text>

          <View style={{height: 28}} />
          <Field
            label={tr('supervisorId')}
            value={id}
            onChangeText={setId}
            icon="badge"
            placeholder="SUP-042"
          />
          <Field label={tr('password')} value={pw} onChangeText={setPw} secure />
          <FilledButton label={tr('signIn')} onPress={submit} busy={busy} />
          <Text style={s.forgot}>{tr('forgot')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={s.footer}>
        <Icon name="gpp-good" size={17} color={c.textMuted} />
        <Text style={s.footerText}>{tr('encrypted')}</Text>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  top: {alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 14},
  body: {paddingHorizontal: 24, paddingTop: 34, paddingBottom: 24},
  logo: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: c.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 22,
  },
  title: {...t.display, textAlign: 'center', fontWeight: '400'},
  sub: {...t.bodyMuted, textAlign: 'center', marginTop: 6, fontSize: 14.5},
  forgot: {...t.bodyMuted, textAlign: 'center', marginTop: 20, fontSize: 13.5, lineHeight: 19},
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 22,
    paddingTop: 8,
  },
  footerText: {...t.small, marginLeft: 8, fontSize: 12.5},
});
