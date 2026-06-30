const WebSocket = require('ws');
const crypto = require('crypto');

// Configuration
const HOST_URL = 'ws://127.0.0.1:9000';
const DURATION_SECONDS = 10;
const EVENTS_PER_SECOND = 10;
const INTERVAL_MS = 1000 / EVENTS_PER_SECOND;
const TOTAL_EVENTS = DURATION_SECONDS * EVENTS_PER_SECOND;

// State
const mockNodeId = crypto.randomUUID();
const mockFileId = 1; // Default open file ID
let sentCount = 0;
let receivedCount = 0;
const latencies = [];

// Latency tracking maps (EventID -> SendTime)
const sentTimestamps = new Map();

// FNV-1a 32-bit checksum for payload validation
function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

console.log(`[Benchmark] Starting 10Hz Synchronization Test`);
console.log(`[Benchmark] Target: ${HOST_URL}`);
console.log(`[Benchmark] Node ID: ${mockNodeId}`);
console.log(`[Benchmark] Test Duration: ${DURATION_SECONDS}s (${TOTAL_EVENTS} events)`);
console.log('----------------------------------------------------');

// Connect
const ws = new WebSocket(HOST_URL);

ws.on('open', () => {
  console.log('[Benchmark] Connected to Host WS Server.');

  // 1. Authenticate
  const helloMsg = {
    type: 'PEER_HELLO',
    nodeId: mockNodeId,
    displayName: 'Benchmark Client',
    nodeCount: 3,
    nodeIndex: 2,
    timestamp: new Date().toISOString()
  };
  ws.send(JSON.stringify(helloMsg));
  console.log('[Benchmark] Sent PEER_HELLO.');

  // Start 10Hz Blast
  console.log('[Benchmark] Commencing 10 Hz load stream...');
  
  const blastInterval = setInterval(() => {
    if (sentCount >= TOTAL_EVENTS) {
      clearInterval(blastInterval);
      console.log('[Benchmark] Finished sending all events. Waiting for final ACKs...');
      setTimeout(generateReport, 2000); // Wait 2s for late ACKs
      return;
    }

    const eventId = crypto.randomUUID();
    const payloadText = `mock_delta_${sentCount}`;
    const deltaObj = {
      version: 1,
      ops: [{ type: 'insert', text: payloadText }],
      checksum: fnv1a32(payloadText)
    };
    
    const pushMsg = {
      type: 'DELTA_PUSH',
      eventId: eventId,
      nodeId: mockNodeId,
      fileId: mockFileId,
      deltaBase64: Buffer.from(JSON.stringify(deltaObj)).toString('base64'),
      logicalTimestamp: sentCount + 1,
      vectorClockJson: { nodeCount: 3, nodeIndex: 2, root: { children: [] } },
      timestamp: new Date().toISOString()
    };

    sentTimestamps.set(eventId, process.hrtime.bigint());
    ws.send(JSON.stringify(pushMsg));
    sentCount++;
    
    // Minimal console output during blast to not skew latency
    if (sentCount % 10 === 0) {
      process.stdout.write(`.`);
    }

  }, INTERVAL_MS);
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data);
    
    if (msg.type === 'DELTA_ACK' && sentTimestamps.has(msg.eventId)) {
      const receiveTime = process.hrtime.bigint();
      const sendTime = sentTimestamps.get(msg.eventId);
      
      // Calculate true RTT in milliseconds
      const rttNs = Number(receiveTime - sendTime);
      const rttMs = rttNs / 1e6;
      
      latencies.push(rttMs);
      sentTimestamps.delete(msg.eventId);
      receivedCount++;
    }
  } catch (err) {
    // Ignore non-JSON or unrelated
  }
});

ws.on('error', (err) => {
  console.error('[Benchmark] WebSocket Error:', err.message || err);
  console.log('[Benchmark] Ensure your Desktop App is currently running and the server is active on port 9000!');
  process.exit(1);
});

ws.on('close', () => {
  console.log('\n[Benchmark] WebSocket connection closed.');
});

function generateReport() {
  console.log('\n');
  console.log('====================================================');
  console.log('      ISO/IEC 25010 PERFORMANCE BENCHMARK REPORT    ');
  console.log('====================================================');
  
  const packetLoss = ((TOTAL_EVENTS - receivedCount) / TOTAL_EVENTS) * 100;
  
  let avgLatency = 0;
  let minLatency = 0;
  let maxLatency = 0;
  
  if (latencies.length > 0) {
    avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    minLatency = Math.min(...latencies);
    maxLatency = Math.max(...latencies);
  }

  const actualDurationSec = DURATION_SECONDS; // nominal
  const throughput = receivedCount / actualDurationSec;

  console.table({
    "Total Events Sent": TOTAL_EVENTS,
    "Total ACKs Received": receivedCount,
    "Packet Loss (%)": `${packetLoss.toFixed(2)}%`,
    "Min Latency (ms)": minLatency.toFixed(3),
    "Max Latency (ms)": maxLatency.toFixed(3),
    "Average Latency (ms)": avgLatency.toFixed(3),
    "Throughput (Events/sec)": throughput.toFixed(2)
  });

  console.log('====================================================');
  console.log('Benchmark complete. Safe to close.');
  process.exit(0);
}
