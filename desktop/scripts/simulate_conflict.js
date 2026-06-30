const WebSocket = require('ws');
const crypto = require('crypto');
const readline = require('readline');

// Configuration
const HOST_URL = 'ws://127.0.0.1:9000';

// State
const mockNodeId = crypto.randomUUID();
const mockFileId = 1; // Default file ID for testing

// FNV-1a 32-bit checksum for payload validation
function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

console.log('====================================================');
console.log('     DocuSync P2P Conflict Simulation Script        ');
console.log('====================================================');
console.log(`Target: ${HOST_URL}`);
console.log(`Simulated Node ID: ${mockNodeId}`);
console.log('');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ws = new WebSocket(HOST_URL);

ws.on('open', () => {
  console.log('[+] Connected to Desktop Host WS Server.');

  // 1. Authenticate
  const helloMsg = {
    type: 'PEER_HELLO',
    nodeId: mockNodeId,
    displayName: 'Conflict Simulator Node',
    nodeCount: 3,
    nodeIndex: 2,
    timestamp: new Date().toISOString()
  };
  ws.send(JSON.stringify(helloMsg));
  console.log('[+] Sent PEER_HELLO.');

  console.log('\n----------------------------------------------------');
  console.log('INSTRUCTIONS TO TRIGGER CONFLICT UI:');
  console.log('1. Go to the Desktop App.');
  console.log('2. Type ANY character into the Editor (File ID: 1) so your local Vector Clock increments.');
  console.log('3. Come back here and PRESS ENTER to inject a concurrent change.');
  console.log('----------------------------------------------------\n');

  rl.question('Press ENTER when ready to inject conflict...', () => {
    const eventId = crypto.randomUUID();
    const payloadText = '\n\n[!!!] SIMULATED P2P CONFLICT INJECTION [!!!]\n\n';
    
    // Create valid Delta JSON payload
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
      logicalTimestamp: 1,
      // Provide a valid tree clock structure with 3 nodes.
      // Host is node 0, this simulator is node 2.
      // We set our leaf (index 2) to 1, and the host's leaf (index 0) to 0.
      // Because the Desktop has local edits, its clock > 0 for node 0,
      // and our clock > 0 for node 2, triggering an LWW conflict!
      vectorClockJson: { 
        nodeCount: 3, 
        nodeIndex: 2, 
        root: { 
          counter: 0, 
          children: [
            { counter: 0, children: [] }, // node 0 (Host)
            { counter: 0, children: [] }, // node 1 (Unused)
            { counter: 1, children: [] }  // node 2 (Simulator)
          ] 
        } 
      },
      timestamp: new Date().toISOString()
    };

    console.log('[*] Injecting divergent DELTA_PUSH payload...');
    ws.send(JSON.stringify(pushMsg));
    
    setTimeout(() => {
      console.log('[+] Conflict payload sent! Check the Desktop App for the amber Conflict Banner.');
      ws.close();
      process.exit(0);
    }, 500);
  });
});

ws.on('error', (err) => {
  console.error('[-] WebSocket Error:', err.message || err);
  console.log('[-] Ensure the Desktop App is running and the server is active on port 9000!');
  process.exit(1);
});
