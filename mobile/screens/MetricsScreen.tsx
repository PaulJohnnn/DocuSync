/**
 * @module MetricsScreen
 * ISO/IEC 25010 evaluation dashboard — tab "Metrics".
 * Static display only — no logic changes needed.
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { Colors } from '../constants/Colors';

// ── Data (unchanged from original) ───────────────────────────────────────────

const METRICS = [
  { name: 'Average Sync Latency',     target: '< 50ms',     actual: '1.51ms',     passed: true  },
  { name: 'p95 Latency',              target: '< 50ms',     actual: '3.01ms',     passed: true  },
  { name: 'Max Latency',              target: '< 50ms',     actual: '4.55ms',     passed: true  },
  { name: 'Sync Throughput',          target: '≥ 10 ops/s', actual: '1,010 ops/s',passed: true  },
  { name: 'Conflict Detection Rate',  target: '> 95%',      actual: '100%',        passed: true  },
  { name: 'Data Loss Rate',           target: '0%',         actual: '0%',          passed: true  },
  { name: 'Eventual Consistency',     target: '≥ 95%',      actual: '100%',        passed: true  },
  { name: 'Concurrent Nodes',         target: '15 nodes',   actual: '15 nodes',    passed: true  },
  { name: 'Manual Tests',             target: '20/20',      actual: '100%',        passed: true  },
  { name: 'Automated Tests',          target: '72/72',      actual: '100%',        passed: true  },
];

const HERO_CHIPS = [
  { label: '1.51ms', desc: 'Latency'    },
  { label: '1010/s', desc: 'Throughput' },
  { label: '100%',   desc: 'Consistency'},
  { label: '0%',     desc: 'Data Loss'  },
];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MetricsScreen() {
  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Metrics</Text>
        <Text style={styles.subtitle}>ISO/IEC 25010 Results</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Card ── */}
        <View style={styles.heroCard}>
          {/* Big pass number */}
          <Text style={styles.heroNumber}>72 / 72</Text>
          <Text style={styles.heroLabel}>Tests Passed</Text>
          <Text style={styles.heroSub}>100% Pass Rate · All metrics within target</Text>

          {/* Chip row */}
          <View style={styles.chipRow}>
            {HERO_CHIPS.map(c => (
              <View key={c.label} style={styles.chip}>
                <Text style={styles.chipValue}>{c.label}</Text>
                <Text style={styles.chipDesc}>{c.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Section label ── */}
        <Text style={styles.sectionLabel}>Test Results</Text>

        {/* ── Metric rows ── */}
        {METRICS.map(m => (
          <View key={m.name} style={styles.metricCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.metricName}>{m.name}</Text>
              <Text style={styles.metricTarget}>Target: {m.target}</Text>
            </View>
            <Text style={styles.metricActual}>{m.actual}</Text>
            <Text style={styles.checkmark}>✓</Text>
          </View>
        ))}

        {/* ── Thesis info card ── */}
        <Text style={styles.sectionLabel}>Thesis Reference</Text>
        <View style={[styles.metricCard, { flexDirection: 'column', gap: 6 }]}>
          {[
            ['Project',     'DocuSync'],
            ['Thesis',      'A Comparative Evaluation of OT and RDTs to Hybrid Conflict Resolution'],
            ['Institution', 'Pamantasan ng Cabuyao — College of Computing Studies'],
            ['Researcher',  'Paul John G. Palamara'],
            ['Methodology', 'Experimental Prototyping (ISO/IEC 25010:2023)'],
            ['Test Suite',  '72 tests — 24 unit + 24 integration + 24 stress'],
          ].map(([label, value]) => (
            <View key={label} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={styles.thesisLabel}>{label}</Text>
              <Text style={styles.thesisValue} numberOfLines={2}>{value}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgBase },

  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgBase,
  },
  title:    { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  // Hero card
  heroCard: {
    margin: 16,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderAccent,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  heroNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.accent,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  heroLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  heroSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: 14,
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  chip: {
    backgroundColor: Colors.accentLight,
    borderWidth: 1,
    borderColor: Colors.borderAccent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 60,
  },
  chipValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accent,
    fontVariant: ['tabular-nums'],
  },
  chipDesc: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 2,
  },

  // Section label
  sectionLabel: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.textMuted,
  },

  // Metric card (row layout)
  metricCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    paddingHorizontal: 16,
  },
  metricName: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  metricTarget: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  metricActual: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.green,
    fontVariant: ['tabular-nums'],
    fontFamily: 'monospace',
  },
  checkmark: {
    fontSize: 14,
    color: Colors.green,
    marginLeft: 4,
  },

  // Thesis info
  thesisLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    width: 90,
    flexShrink: 0,
  },
  thesisValue: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
