import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import {WebView} from 'react-native-webview';
import {c, r} from './theme';

/**
 * Ward boundary + worker capture-point map for the admin Worker Detail
 * screen. Renders Leaflet (OpenStreetMap tiles) inside a WebView — the same
 * rendering engine/tiles as the web admin dashboard, and free of the Google
 * Maps SDK's billing-enabled API key that react-native-maps would otherwise
 * require on Android even just to host a custom tile layer.
 *
 * `boundary` is an ordered polygon `[{lat, lng}, ...]`; `point` is the
 * worker's captured location, `{lat, lng, accuracy, inside}` — `inside`
 * picks the pin color (green inside the boundary, red outside).
 */
export default function WardMapView({boundary, point, height = 180, style}) {
  const html = useMemo(() => buildHtml(boundary, point), [boundary, point]);
  return (
    <View style={[s.wrap, {height}, style]}>
      <WebView
        originWhitelist={['*']}
        source={{html}}
        style={s.webview}
        // Leaflet handles pan/pinch-zoom itself inside the page; the WebView
        // must stay scrollable (not scrollEnabled={false}) for Android to
        // deliver those touch gestures to it at all.
        scrollEnabled
        overScrollMode="never"
        nestedScrollEnabled
        javaScriptEnabled
      />
    </View>
  );
}

function buildHtml(boundary, point) {
  const polygon = JSON.stringify((boundary || []).map(p => [p.lat, p.lng]));
  const pin = point ? JSON.stringify([point.lat, point.lng]) : null;
  const pinColor = point && point.inside ? '#34A853' : '#EA4335';
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: #E8EAED; }
  .leaflet-control-zoom a { width: 32px; height: 32px; line-height: 32px; font-size: 18px; }
  .leaflet-control-attribution { font-size: 9px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var boundary = ${polygon};
  var pin = ${pin};
  var map = L.map('map', {
    zoomControl: false,
    zoomAnimation: true,
    markerZoomAnimation: true,
    bounceAtZoomLimits: true,
  });
  L.control.zoom({position: 'topright'}).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  var bounds = [];
  if (boundary.length) {
    L.polygon(boundary, {color: '#4285F4', weight: 2, fillColor: '#4285F4', fillOpacity: 0.12}).addTo(map);
    bounds = bounds.concat(boundary);
  }
  if (pin) {
    var icon = L.divIcon({
      className: '',
      html: '<div style="width:16px;height:16px;border-radius:50%;background:${pinColor};border:2px solid #fff;box-shadow:0 0 2px rgba(0,0,0,0.5)"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    L.marker(pin, {icon: icon}).addTo(map);
    bounds.push(pin);
  }
  if (bounds.length) {
    map.fitBounds(bounds, {padding: [24, 24]});
  } else {
    map.setView([0, 0], 2);
  }
</script>
</body>
</html>`;
}

const s = StyleSheet.create({
  wrap: {borderRadius: r.card, overflow: 'hidden', backgroundColor: c.fill},
  webview: {backgroundColor: 'transparent'},
});
