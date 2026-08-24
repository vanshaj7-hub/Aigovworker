import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {Badge, Card, Header, Screen} from '../components';
import {colors} from '../theme';

function Tile({title, desc, icon, onPress}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.tile}>
      <Text style={styles.tileIcon}>{icon}</Text>
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileDesc}>{desc}</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen({
  session,
  navigate,
  onLogout,
  stats,
  isOnline,
}) {
  return (
    <Screen>
      <Header
        title="Workforce Attendance"
        subtitle={`Signed in as ${session.name}`}
        right={
          <TouchableOpacity onPress={onLogout}>
            <Text style={styles.logout}>Logout</Text>
          </TouchableOpacity>
        }
      />
      <View style={styles.body}>
        <Card style={styles.statsCard}>
          <View style={{flex: 1}}>
            <Text style={styles.statsBig}>
              {stats.presentToday}/{stats.totalWorkers}
            </Text>
            <Text style={styles.statsLabel}>workers present today</Text>
          </View>
          <View style={{alignItems: 'flex-end', gap: 6}}>
            <Badge
              text={isOnline ? 'ONLINE' : 'OFFLINE'}
              color={isOnline ? colors.success : colors.warning}
            />
            {stats.pendingSync > 0 ? (
              <Badge text={`${stats.pendingSync} pending sync`} color={colors.warning} />
            ) : (
              <Badge text="All synced" color={colors.success} />
            )}
          </View>
        </Card>

        <View style={styles.grid}>
          <Tile
            icon="📸"
            title="Mark Attendance"
            desc="Verify a worker's face and record attendance"
            onPress={() => navigate('attendance')}
          />
          <Tile
            icon="👷"
            title="Workers"
            desc="Enroll and manage field workers"
            onPress={() => navigate('workers')}
          />
          <Tile
            icon="🗒️"
            title="History"
            desc="Attendance records and audit trail"
            onPress={() => navigate('history')}
          />
        </View>
        <Text style={styles.footer}>
          Attendance is stored on-device and synced automatically when online.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logout: {color: '#ffd9a0', fontWeight: '700', fontSize: 13},
  body: {padding: 18, flex: 1},
  statsCard: {flexDirection: 'row', alignItems: 'center', marginBottom: 18},
  statsBig: {fontSize: 32, fontWeight: '800', color: colors.primary},
  statsLabel: {color: colors.textMuted, fontSize: 13},
  grid: {gap: 14},
  tile: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  tileIcon: {fontSize: 26, marginBottom: 8},
  tileTitle: {fontSize: 17, fontWeight: '800', color: colors.text},
  tileDesc: {fontSize: 13, color: colors.textMuted, marginTop: 3},
  footer: {
    marginTop: 'auto',
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12,
  },
});
