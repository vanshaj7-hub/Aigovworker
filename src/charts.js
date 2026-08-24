import React, {useState} from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import Svg, {Circle, G, Line, Path, Rect, Text as SvgText} from 'react-native-svg';

// Dataviz reference palette (validated for CVD safety on white, in this order).
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
export const SERIES_OTHER = '#898781';
export const INK = '#0b0b0b';
export const INK_MUTED = '#898781';
export const GRID = '#e1e0d9';
export const BASELINE = '#c3c2b7';

function niceMax(v) {
  if (v <= 5) {
    return 5;
  }
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (v <= m * pow) {
      return m * pow;
    }
  }
  return v;
}

/**
 * Single-series bar chart. Tap a bar to see its value; the latest bar is
 * direct-labeled by default.
 */
export function BarChart({data, width, height = 170, color = SERIES[0]}) {
  const [selected, setSelected] = useState(null);
  const padL = 30;
  const padR = 6;
  const padT = 20;
  const padB = 24;
  const w = width;
  const plotW = w - padL - padR;
  const plotH = height - padT - padB;
  const max = niceMax(Math.max(1, ...data.map(d => d.value)));
  const n = data.length;
  const slot = plotW / Math.max(1, n);
  const barW = Math.min(26, slot * 0.55);
  const labelIdx = selected !== null ? selected : n - 1;

  return (
    <View>
      <Svg width={w} height={height}>
        {[0.5, 1].map(f => {
          const y = padT + plotH - plotH * f;
          return (
            <G key={f}>
              <Line x1={padL} y1={y} x2={w - padR} y2={y} stroke={GRID} strokeWidth={1} />
              <SvgText x={padL - 5} y={y + 4} fontSize={10} fill={INK_MUTED} textAnchor="end">
                {Math.round(max * f)}
              </SvgText>
            </G>
          );
        })}
        <Line
          x1={padL}
          y1={padT + plotH}
          x2={w - padR}
          y2={padT + plotH}
          stroke={BASELINE}
          strokeWidth={1}
        />
        {data.map((d, i) => {
          const h = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * plotH);
          const x = padL + i * slot + (slot - barW) / 2;
          const y = padT + plotH - h;
          const r = Math.min(4, barW / 2, h);
          return (
            <G key={i}>
              {/* rounded top, square base anchored to the baseline */}
              <Path
                d={`M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${y + h} Z`}
                fill={color}
                opacity={selected === null || selected === i ? 1 : 0.45}
              />
              {i === labelIdx && d.value > 0 ? (
                <SvgText
                  x={x + barW / 2}
                  y={y - 6}
                  fontSize={11}
                  fontWeight="700"
                  fill={INK}
                  textAnchor="middle">
                  {d.value}
                </SvgText>
              ) : null}
              <SvgText
                x={x + barW / 2}
                y={padT + plotH + 15}
                fontSize={9}
                fill={INK_MUTED}
                textAnchor="middle">
                {d.label}
              </SvgText>
              {/* hit target wider than the mark */}
              <Rect
                x={padL + i * slot}
                y={padT}
                width={slot}
                height={plotH}
                fill="transparent"
                onPress={() => setSelected(selected === i ? null : i)}
              />
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

function polar(cx, cy, r, angle) {
  const a = ((angle - 90) * Math.PI) / 180;
  return {x: cx + r * Math.cos(a), y: cy + r * Math.sin(a)};
}

function donutSlice(cx, cy, rOuter, rInner, start, end) {
  const large = end - start > 180 ? 1 : 0;
  const so = polar(cx, cy, rOuter, start);
  const eo = polar(cx, cy, rOuter, end);
  const si = polar(cx, cy, rInner, end);
  const ei = polar(cx, cy, rInner, start);
  return [
    `M${so.x},${so.y}`,
    `A${rOuter},${rOuter} 0 ${large} 1 ${eo.x},${eo.y}`,
    `L${si.x},${si.y}`,
    `A${rInner},${rInner} 0 ${large} 0 ${ei.x},${ei.y}`,
    'Z',
  ].join(' ');
}

/**
 * Donut chart with a legend carrying name, value, and share — identity is
 * never color-alone.
 */
export function DonutChart({data, size = 150, centerLabel}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const rO = size / 2 - 4;
  const rI = rO - 26;
  let angle = 0;

  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 16}}>
      <Svg width={size} height={size}>
        {total === 0 ? (
          <Circle cx={cx} cy={cy} r={(rO + rI) / 2} stroke={GRID} strokeWidth={rO - rI} fill="none" />
        ) : (
          data.map((d, i) => {
            const sweep = (d.value / total) * 360;
            const path = donutSlice(cx, cy, rO, rI, angle, Math.min(angle + sweep, 359.999));
            angle += sweep;
            return (
              <Path
                key={i}
                d={path}
                fill={d.color}
                stroke="#ffffff"
                strokeWidth={2} // 2px surface gap between fills
              />
            );
          })
        )}
        <SvgText x={cx} y={cy - 2} fontSize={17} fontWeight="800" fill={INK} textAnchor="middle">
          {total}
        </SvgText>
        {centerLabel ? (
          <SvgText x={cx} y={cy + 13} fontSize={9} fill={INK_MUTED} textAnchor="middle">
            {centerLabel}
          </SvgText>
        ) : null}
      </Svg>
      <View style={{flex: 1, gap: 7}}>
        {data.map((d, i) => (
          <View key={i} style={{flexDirection: 'row', alignItems: 'center', gap: 7}}>
            <View style={{width: 10, height: 10, borderRadius: 3, backgroundColor: d.color}} />
            <Text style={{flex: 1, fontSize: 12, color: INK}} numberOfLines={1}>
              {d.label}
            </Text>
            <Text style={{fontSize: 12, fontWeight: '700', color: INK}}>
              {d.value}
            </Text>
            <Text style={{fontSize: 11, color: INK_MUTED, width: 34, textAlign: 'right'}}>
              {total ? Math.round((d.value / total) * 100) : 0}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
