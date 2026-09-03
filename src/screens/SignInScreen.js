import React, {useState} from 'react';
import {Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {c, t} from '../theme';
import {useLang} from '../i18n';
import {Field, FilledButton, Icon, LanguageToggle, Screen} from '../ui';
import {DEMO_CREDENTIALS, signIn} from '../storage';

export default function SignInScreen({onSignedIn, onSignUp, onForgot}) {
  const {t: tr} = useLang();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!id.trim()) {
      Alert.alert(tr('signInFailed'), tr('idRequired'));
      return;
    }
    setBusy(true);
    try {
      const res = await signIn(id, pw);
      if (res.ok) {
        onSignedIn(res.session);
      } else {
        Alert.alert(
          tr('signInFailed'),
          res.reason === 'noAccount' ? tr('noAccountFound') : tr('signInFailedBody'),
        );
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

          <View style={{height: 26}} />
          <Field
            label={tr('supervisorId')}
            value={id}
            onChangeText={setId}
            icon="badge"
            placeholder={DEMO_CREDENTIALS.id}
            autoCapitalize="characters"
          />
          <Field label={tr('password')} value={pw} onChangeText={setPw} secure />
          <FilledButton label={tr('signIn')} onPress={submit} busy={busy} />

          <Pressable onPress={onForgot} style={s.linkRow} hitSlop={8}>
            <Text style={s.link}>{tr('forgotTitle')}</Text>
          </Pressable>

          <View style={s.sep}>
            <View style={s.sepLine} />
            <Text style={s.sepText}>{tr('noAccountQ')}</Text>
            <View style={s.sepLine} />
          </View>
          <Pressable onPress={onSignUp} hitSlop={8}>
            <Text style={[s.link, {fontSize: 15}]}>{tr('createOne')}</Text>
          </Pressable>

          <Text style={s.demo}>
            {tr('demoCredentials', {id: DEMO_CREDENTIALS.id, pw: DEMO_CREDENTIALS.password})}
          </Text>
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
  body: {paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24},
  logo: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: c.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {...t.display, textAlign: 'center', fontWeight: '400'},
  sub: {...t.bodyMuted, textAlign: 'center', marginTop: 6, fontSize: 14.5},
  linkRow: {alignItems: 'center', marginTop: 18},
  link: {color: c.primaryDark, fontSize: 14.5, fontWeight: '600', textAlign: 'center'},
  sep: {flexDirection: 'row', alignItems: 'center', marginTop: 26, marginBottom: 14},
  sepLine: {flex: 1, height: 1, backgroundColor: c.outlineSoft},
  sepText: {...t.small, marginHorizontal: 12},
  demo: {...t.small, textAlign: 'center', marginTop: 26, fontSize: 12},
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 20,
    paddingTop: 8,
  },
  footerText: {...t.small, marginLeft: 8, fontSize: 12.5},
});
