import React, {useState} from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {c, r, t} from './theme';

// Drop-in replacement for React Native's Alert.alert, themed to match the
// rest of the app instead of the platform's default system dialog. Same
// call signature as Alert.alert(title, message, buttons, options) so every
// existing call site works unchanged — only the import changes.
//
// AlertHost renders the actual dialog and must be mounted once near the
// root (see App.js); alert() below just hands it a new request. Any alert()
// call made before AlertHost has mounted is silently dropped rather than
// crashing — cannot happen in practice since AlertHost mounts on the very
// first render, before any user action could trigger an alert.
let showRequest = null;

export function alert(title, message, buttons, options) {
  if (!showRequest) {
    return;
  }
  showRequest({title, message, buttons, options});
}

const styleTone = style =>
  style === 'destructive' ? c.error : style === 'cancel' ? c.textMuted : c.primaryDark;

export function AlertHost() {
  const [request, setRequest] = useState(null);
  showRequest = setRequest;

  if (!request) {
    return null;
  }

  const buttons =
    request.buttons && request.buttons.length ? request.buttons : [{text: 'OK'}];
  const cancelable = !(request.options && request.options.cancelable === false);

  const dismiss = () => {
    setRequest(null);
    if (request.options && typeof request.options.onDismiss === 'function') {
      request.options.onDismiss();
    }
  };

  const press = btn => {
    setRequest(null);
    if (typeof btn.onPress === 'function') {
      btn.onPress();
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancelable ? dismiss : () => {}}>
      <Pressable style={s.scrim} onPress={cancelable ? dismiss : undefined}>
        <Pressable style={s.card} onPress={() => {}}>
          {request.title ? <Text style={s.title}>{request.title}</Text> : null}
          {request.message ? <Text style={s.message}>{request.message}</Text> : null}
          <View style={s.buttonRow}>
            {buttons.map((btn, i) => (
              <Pressable
                key={i}
                onPress={() => press(btn)}
                style={({pressed}) => [s.button, pressed && s.buttonPressed]}
                hitSlop={6}>
                <Text style={[s.buttonText, {color: styleTone(btn.style)}]}>{btn.text || 'OK'}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: c.surface,
    borderRadius: r.card,
    paddingTop: 22,
    paddingHorizontal: 22,
    paddingBottom: 8,
  },
  title: {...t.cardTitle, marginBottom: 8},
  message: {...t.body, color: c.textMuted, lineHeight: 20, marginBottom: 18},
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  button: {paddingHorizontal: 12, paddingVertical: 12, borderRadius: r.chip},
  buttonPressed: {backgroundColor: c.fill},
  buttonText: {fontSize: 14.5, fontWeight: '600'},
});
