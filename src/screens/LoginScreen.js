import React, {useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Button, Field, Screen} from '../components';
import {colors} from '../theme';
import {getAccounts} from '../storage';

export default function LoginScreen({onLogin}) {
  const [role, setRole] = useState('supervisor');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const accounts = await getAccounts();
      const account = accounts.find(
        a =>
          a.role === role &&
          a.username === username.trim().toLowerCase() &&
          a.password === password,
      );
      if (account) {
        onLogin({role: account.role, username: account.username, name: account.name});
      } else {
        Alert.alert('Login failed', 'Invalid username or password for this login type.');
      }
    } finally {
      setBusy(false);
    }
  };

  const isAdmin = role === 'admin';

  return (
    <Screen style={styles.center}>
      <KeyboardAvoidingView behavior="padding">
        <View style={styles.logo}>
          <Text style={styles.logoTxt}>NN</Text>
        </View>
        <Text style={styles.title}>Workforce Attendance</Text>
        <Text style={styles.sub}>Nagar Nigam Dehradun</Text>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, !isAdmin && styles.tabActive]}
            onPress={() => setRole('supervisor')}>
            <Text style={[styles.tabTxt, !isAdmin && styles.tabTxtActive]}>
              Supervisor Login
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, isAdmin && styles.tabActive]}
            onPress={() => setRole('admin')}>
            <Text style={[styles.tabTxt, isAdmin && styles.tabTxtActive]}>
              Admin Login
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.roleHint}>
          {isAdmin
            ? 'Regional managers: attendance KPIs and analytics across all areas.'
            : 'Field supervisors: enroll workers and mark verified attendance.'}
        </Text>

        <Field
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          placeholder={isAdmin ? 'admin' : 'supervisor'}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          onSubmitEditing={submit}
        />
        <Button
          title={isAdmin ? 'Sign In as Admin' : 'Sign In'}
          onPress={submit}
          busy={busy}
        />
        <Text style={styles.hint}>
          {isAdmin
            ? 'Default credentials: admin / admin123'
            : 'Default credentials: supervisor / nagar123'}
        </Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {justifyContent: 'center', padding: 24},
  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  logoTxt: {color: '#fff', fontSize: 26, fontWeight: '800'},
  title: {fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center'},
  sub: {fontSize: 13, color: colors.textMuted, textAlign: 'center', marginBottom: 20, marginTop: 4},
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#e6ebe7',
    borderRadius: 12,
    padding: 4,
    marginBottom: 10,
  },
  tab: {flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center'},
  tabActive: {backgroundColor: colors.primary},
  tabTxt: {fontSize: 13, fontWeight: '700', color: colors.textMuted},
  tabTxtActive: {color: '#fff'},
  roleHint: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 17,
  },
  hint: {marginTop: 18, textAlign: 'center', color: colors.textMuted, fontSize: 12},
});
