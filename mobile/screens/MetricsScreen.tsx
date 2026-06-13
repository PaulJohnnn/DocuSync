import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '../constants/Colors';

const METRICS = [
  {
    name: 'Average Sync Latency',
    target: '< 50ms', actual: '1.51ms', passed: true,
    icon: '⏱️', color: Colors.acc,
    description: 'Mean time for a sync operation to complete.',
  },
  {
    name: 'Sync Throughput',
    target: '≥ 10 ops/s', actual: '1,010 ops/s', passed: true,
    icon: '⚡', color: Colors.grn,
    description: 'Maximum sustained sync operations per second.',
  },
  {
    name: 'Conflict Detection Rate',
    target: '100%', actual: '100%', passed: true,
    icon: '🛡️', color: Colors.amb,
    description: 'Percentage of concurrent conflicts correctly detected.',
  },
  {
    name: 'Data Loss Prevention',
    target: '0%', actual: '0%', passed: true,
    icon: '💾', color: Colors.pur,
    description: 'Percentage of content lost during sync operations.',
  },
  {
    name: 'Eventual Consistency',
    target: '100%', actual: '100%', passed: true,
    icon: '🔄', color: Colors.tel,
    description: 'Peers converging to identical state after resolution.',
  },
  {
    name: 'Delta Compression Ratio',
    target: '> 50%', actual: '73.2%', passed: true,
    icon: '📦', color: Colors.acc,
    description: 'Payload size reduction via Myers diff encoding.',
  },
];

export default function MetricsScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Metrics</Text>
        <Text style={styles.subtitle}>ISO/IEC 25010 — Phase 5 Results</Text>
      </View>

      {/* Summary banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerIcon}>✅</Text>
        <View>
          <Text style={styles.bannerTitle}>All 6 Metrics Passed</Text>
          <Text style={styles.bannerSubtext}>72/72 tests passing • Fully compliant</Text>
        </View>
      </View>

      {/* Metric cards */}
      {METRICS.map(m => (
        <View key={m.name} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBox, { backgroundColor: m.color + '15', borderColor: m.color + '40' }]}>
              <Text style={{ fontSize: 18 }}>{m.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.metricName}>{m.name}</Text>
              <Text style={styles.metricDesc}>{m.description}</Text>
            </View>
          </View>
          <View style={styles.resultRow}>
            <View>
              <Text style={styles.resultLabel}>TARGET</Text>
              <Text style={styles.resultTarget}>{m.target}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.resultLabel}>ACTUAL</Text>
              <Text style={[styles.resultActual, { color: m.passed ? Colors.grn : Colors.red }]}>
                {m.actual}
              </Text>
            </View>
            <Text style={{ fontSize: 20 }}>✅</Text>
          </View>
        </View>
      ))}

      {/* Thesis info */}
      <View style={[styles.card, { marginBottom: 30 }]}>
        <Text style={styles.thesisTitle}>📊 Thesis Reference</Text>
        <Text style={styles.thesisText}>
          Title: A Comparative Evaluation of Operational Transformation and Replicated Data Types to Hybrid Conflict Resolution Algorithm{'\n\n'}
          Institution: Pamantasan ng Cabuyao — College of Computing Studies{'\n'}
          Researcher: Paul John G. Palamara{'\n'}
          Methodology: Experimental Prototyping (ISO/IEC 25010:2023){'\n'}
          Test Suite: 72 tests (24 unit + 24 integration + 24 stress)
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.b1,
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.t1 },
  subtitle: { fontSize: 13, color: Colors.t3, marginTop: 2 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    margin: 16, padding: 14, borderRadius: 10,
    backgroundColor: Colors.grn + '10', borderWidth: 1, borderColor: Colors.grn + '30',
  },
  bannerIcon: { fontSize: 22 },
  bannerTitle: { fontSize: 15, fontWeight: '700', color: Colors.grn },
  bannerSubtext: { fontSize: 12, color: Colors.t2 },
  card: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.s1, borderWidth: 1, borderColor: Colors.b1,
    borderRadius: 10, padding: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  iconBox: {
    width: 40, height: 40, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  metricName: { fontSize: 14, fontWeight: '600', color: Colors.t1 },
  metricDesc: { fontSize: 12, color: Colors.t3, marginTop: 2, lineHeight: 16 },
  resultRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 10, backgroundColor: Colors.bg, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.b1,
  },
  resultLabel: { fontSize: 9, color: Colors.t3, letterSpacing: 0.5, marginBottom: 2 },
  resultTarget: { fontSize: 13, fontWeight: '600', color: Colors.t2, fontFamily: 'monospace' },
  resultActual: { fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  thesisTitle: { fontSize: 14, fontWeight: '600', color: Colors.t1, marginBottom: 8 },
  thesisText: { fontSize: 12, color: Colors.t2, lineHeight: 18 },
});
