// Top-level screen tree for a signed-in admin (Department Head / CSI /
// Sanitary Inspector) — the admin counterpart to Shell in App.js. Mounted
// only once AppRoot has confirmed there is no supervisor session to show
// instead, so it never runs alongside (or interferes with) Shell.
import React, {useCallback, useEffect, useState} from 'react';
import {adminSignOut, fetchAdminDashboard} from './adminSession';
import AdminChangePasswordScreen from './screens/AdminChangePasswordScreen';
import AdminDashboardScreen from './screens/AdminDashboardScreen';

export default function AdminShell({user: initialUser, onSignedOut}) {
  const [user, setUser] = useState(initialUser);
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminDashboard(user);
      setRaw(data);
    } catch (err) {
      setError((err && err.message) || 'Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user.mustChangePassword) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.mustChangePassword]);

  if (user.mustChangePassword) {
    return <AdminChangePasswordScreen user={user} onDone={setUser} />;
  }

  return (
    <AdminDashboardScreen
      user={user}
      raw={raw}
      loading={loading}
      error={error}
      onRefresh={load}
      onSignOut={async () => {
        await adminSignOut();
        onSignedOut();
      }}
    />
  );
}
