import React, {useState} from 'react';
import {KeyboardAvoidingView, ScrollView, StyleSheet, Text, View} from 'react-native';
import {alert} from '../alert';
import {c, t} from '../theme';
import {useLang} from '../i18n';
import {AppLogoMark, Field, FilledButton, Icon, LanguageToggle, RoleToggle, Screen} from '../ui';
import {isEmail} from '../storage';
import {authenticate} from '../session';
import {adminAuthenticate} from '../adminSession';

export default function SignInScreen({onSignedIn, onAdminSignedIn}) {
  const {t: tr} = useLang();
  const [role, setRole] = useState('sup');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdmin = role === 'adm';

  const submit = async () => {
    if (!email.trim()) {
      alert(tr('signInFailed'), tr('emailRequired'));
      return;
    }
    if (!isEmail(email)) {
      alert(tr('signInFailed'), tr('emailInvalid'));
      return;
    }
    setBusy(true);
    try {
      if (isAdmin) {
        const res = await adminAuthenticate(email, pw);
        if (res.ok) {
          onAdminSignedIn(res.user);
        } else if (res.reason === 'network') {
          alert(tr('signInFailed'), res.message || tr('uploadNetwork'));
        } else {
          alert(
            tr('signInFailed'),
            res.reason === 'unrecognizedRole' ? tr('adminUnrecognizedRole') : tr('adminSignInFailedBody'),
          );
        }
        return;
      }
      const res = await authenticate(email, pw);
      if (res.ok) {
        onSignedIn(res.session);
      } else if (res.reason === 'network') {
        alert(tr('signInFailed'), res.message || tr('uploadNetwork'));
      } else {
        alert(
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
            <AppLogoMark size={44} />
          </View>
          <Text style={s.title}>{tr(isAdmin ? 'adminSignInTitle' : 'signInTitle')}</Text>
          <Text style={s.sub}>{tr(isAdmin ? 'adminSignInSub' : 'signInSub')}</Text>

          <View style={{height: 24}} />
          <RoleToggle
            value={role}
            onChange={setRole}
            supLabel={tr('loginAsSupervisor')}
            admLabel={tr('loginAsAdmin')}
            style={{marginBottom: 20}}
          />
          <Field
            label={tr(isAdmin ? 'adminEmailAddress' : 'emailAddress')}
            value={email}
            onChangeText={setEmail}
            icon="alternate-email"
            placeholder="name@nndehradun.gov.in"
            keyboardType="email-address"
          />
          <Field label={tr('password')} value={pw} onChangeText={setPw} secure />
          <FilledButton label={tr('signIn')} onPress={submit} busy={busy} />

          {/* Accounts are issued by the IT team; there is no self-service reset. */}
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
  body: {paddingHorizontal: 24, paddingTop: 30, paddingBottom: 24},
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
  demo: {...t.small, textAlign: 'center', marginTop: 30, fontSize: 12},
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 22,
    paddingTop: 8,
  },
  footerText: {...t.small, marginLeft: 8, fontSize: 12.5},
});
