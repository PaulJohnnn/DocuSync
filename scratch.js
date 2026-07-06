const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'desktop/src/engine/peer/peer-manager.ts');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove ws import
content = content.replace("import { WebSocketServer, WebSocket } from 'ws';", "");

// 2. Define MockSocket
const mockSocketDef = `
export const WEBSOCKET_OPEN = 1;

export interface MockSocket {
  id: string;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  terminate: () => void;
  ping: () => void;
  readyState: number;
}
`;
content = content.replace("interface ConnectedPeer {\n  /** The live WebSocket connection. */\n  socket: WebSocket;", mockSocketDef + "\ninterface ConnectedPeer {\n  /** The live WebSocket connection. */\n  socket: MockSocket;");

// 3. Map replacements and config additions
content = content.replace("private readonly peers: Map<WebSocket, ConnectedPeer> = new Map();", "private peers: Map<MockSocket, ConnectedPeer> = new Map();\n  private peersById: Map<string, MockSocket> = new Map();");
content = content.replace("private readonly rateLimiters: Map<WebSocket, RateLimiterEntry> = new Map();", "private rateLimiters: Map<MockSocket, RateLimiterEntry> = new Map();");
content = content.replace("private readonly config: PeerManagerConfig;", "private config: PeerManagerConfig;");
content = content.replace("private server: WebSocketServer | null = null;", "");
content = content.replace("onPeerListChanged?: () => void;", "onPeerListChanged?: () => void;\n  sendToRenderer?: (peerId: string, payload: string) => void;");

// 4. Global socket parameter replacements (avoiding string.replace string replacement limits by using RegExp with 'g')
content = content.replace(/socket: WebSocket/g, "socket: MockSocket");
content = content.replace(/_socket: WebSocket/g, "_socket: MockSocket");
content = content.replace(/existingSocket: WebSocket/g, "existingSocket: MockSocket");
content = content.replace(/WebSocket\.OPEN/g, "WEBSOCKET_OPEN");

// 5. Replace startServer
const startServerRegex = /public startServer\(port: number\): Promise<void> \{[\s\S]*?\}\n  \}/;
content = content.replace(startServerRegex, `public async startServer(port: number): Promise<void> {\n    console.log(\`[PeerManager] Using WebRTC + IPC bridging (skipping local WS server on port \${port})\`);\n    return Promise.resolve();\n  }`);

// 6. Replace connectToPeer
const connectToPeerRegex = /public connectToPeer\(address: string, port: number\): Promise<void> \{[\s\S]*?\}\n  \}/;
content = content.replace(connectToPeerRegex, `public async connectToPeer(address: string, port: number): Promise<void> {\n    console.log(\`[PeerManager] connectToPeer(\${address}:\${port}) skipped (using WebRTC mesh).\`);\n    return Promise.resolve();\n  }`);

// 7. broadcast Message
content = content.replace("public broadcast(message: PeerMessage): number {", "public broadcastMessage(message: PeerMessage): number {");
content = content.replace("this.broadcast(byeMessage);", "this.broadcastMessage(byeMessage);");

// 8. Replace sendTo
const sendToRegex = /public sendTo\(nodeId: string, message: PeerMessage\): boolean \{[\s\S]*?return false;\n  \}/;
const sendToReplacement = `public sendTo(nodeId: string, message: PeerMessage): boolean {
    const socket = this.peersById.get(nodeId);
    if (socket && socket.readyState === WEBSOCKET_OPEN) {
      try {
        socket.send(serialiseMessage(message));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }`;
content = content.replace(sendToRegex, sendToReplacement);

// 9. Replace getConnectedPeerIds
const getIdsRegex = /public getConnectedPeerIds\(\): string\[\] \{[\s\S]*?return ids;\n  \}/;
const getIdsReplacement = `public getConnectedPeerIds(): string[] {
    const ids: string[] = [];
    for (const [socket, peer] of this.peers) {
      if (peer.isAuthenticated && peer.nodeId && socket.readyState === WEBSOCKET_OPEN) {
        ids.push(peer.nodeId);
      }
    }
    return ids;
  }

  public handleMessageFromRenderer(peerId: string, msgStr: string) {
    let mock = this.peersById.get(peerId);
    if (!mock) {
      mock = {
        id: peerId,
        send: (data: string) => {
          if (this.config.sendToRenderer) {
            this.config.sendToRenderer(peerId, data);
          }
        },
        close: () => {},
        terminate: () => {},
        ping: () => {},
        readyState: WEBSOCKET_OPEN
      };
      this.peersById.set(peerId, mock);
      this.registerSocket(mock, 'webrtc', 0, 'inbound');
    }
    this.handleRawMessage(mock, msgStr);
  }`;
content = content.replace(getIdsRegex, getIdsReplacement);

// 10. Replace shutdown
const shutdownRegex = /public async shutdown\(\): Promise<void> \{[\s\S]*?console\.log\('\[PeerManager\] Shutdown complete\.'\);\n  \}/;
const shutdownReplacement = `public async shutdown(): Promise<void> {
    console.log('[PeerManager] Shutting down...');

    const byeMessage: PeerByeMessage = {
      type: 'PEER_BYE',
      nodeId: this.config.localNodeId,
      timestamp: new Date().toISOString(),
    };
    this.broadcastMessage(byeMessage);

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);

    for (const [socket] of this.peers) {
      try {
        socket.close(1000, 'Shutting down');
      } catch {}
    }
    this.peers.clear();
    this.peersById.clear();
    this.rateLimiters.clear();

    console.log('[PeerManager] Shutdown complete.');
  }`;
content = content.replace(shutdownRegex, shutdownReplacement);

// 11. Fix registerSocket
const registerSocketRegex = /private registerSocket\([\s\S]*?socket\.on\('pong', \(\) => \{\n      \(socket as unknown as Record<string, boolean>\)\['_isAlive'\] = true;\n    \}\);\n  \}/;
const registerSocketReplacement = `private registerSocket(
    socket: MockSocket,
    address: string,
    port: number,
    direction: 'inbound' | 'outbound'
  ): void {
    const peer: ConnectedPeer = {
      socket,
      nodeId: null,
      displayName: '',
      address,
      port,
      direction,
      isAuthenticated: false,
    };

    this.peers.set(socket, peer);
    this.rateLimiters.set(socket, { timestamps: [] });
  }`;
content = content.replace(registerSocketRegex, registerSocketReplacement);

// 12. Fix handleDisconnect to handlePeerDisconnect
content = content.replace(/this\.handleDisconnect\(/g, "this.handlePeerDisconnect(");
const handleDisconnectRegex = /private async handlePeerDisconnect\(socket: MockSocket\): Promise<void> \{[\s\S]*?this\.rateLimiters\.delete\(socket\);\n  \}/;
const handleDisconnectReplacement = `private handlePeerDisconnect(socket: MockSocket, reason?: string): void {
    const peer = this.peers.get(socket);
    if (!peer) return;

    if (peer.nodeId) {
      this.peersById.delete(peer.nodeId);
    }
    this.peers.delete(socket);
    this.rateLimiters.delete(socket);
  }`;
content = content.replace(handleDisconnectRegex, handleDisconnectReplacement);

// 13. Fix handlePeerHello
const handlePeerHelloRegex = /private async handlePeerHello\([\s\S]*?\[PeerManager\] PEER_HELLO from \$\{msg\.displayName\} \(\$\{msg\.nodeId\}\)\`\n    \);/;
const handlePeerHelloReplacement = `private async handlePeerHello(
    socket: MockSocket,
    msg: PeerHelloMessage
  ): Promise<void> {
    const peer = this.peers.get(socket);
    if (!peer) return;

    let existingSocket = this.peersById.get(msg.nodeId);

    if (existingSocket && existingSocket !== socket) {
      console.log(\`[PeerManager] Duplicate PEER_HELLO for \${msg.nodeId}. Requesting verification.\`);
      const verifyMsg: UserVerifyMessage = {
        type: 'USER_VERIFY',
        nodeId: msg.nodeId,
        timestamp: new Date().toISOString(),
      };
      existingSocket.send(serialiseMessage(verifyMsg));
      
      if (this.config.onUserVerifyRequest) {
        const allowed = await this.config.onUserVerifyRequest(msg.nodeId);
        
        if (!allowed) {
          console.log(\`[PeerManager] Connection from \${msg.nodeId} blocked by user.\`);
          socket.close(4001, 'Connection blocked by user');
          this.peers.delete(socket);
          this.rateLimiters.delete(socket);
          return;
        } else {
          console.log(\`[PeerManager] Connection from \${msg.nodeId} allowed. Terminating old socket.\`);
          existingSocket.close(4002, 'Replaced by new connection');
          this.handlePeerDisconnect(existingSocket, 'replaced');
        }
      }
    }

    peer.nodeId = msg.nodeId;
    peer.displayName = msg.displayName;
    peer.isAuthenticated = true;
    this.peersById.set(msg.nodeId, socket);

    console.log(
      \`[PeerManager] PEER_HELLO from \${msg.displayName} (\${msg.nodeId})\`
    );`;
content = content.replace(handlePeerHelloRegex, handlePeerHelloReplacement);

// 14. Fix DELTA_PUSH Missing fileId
const ackMissingRegex = /const ack: PeerMessage = \{\n        type: 'DELTA_ACK',\n        eventId: msg\.eventId,\n        nodeId: this\.config\.localNodeId,\n        timestamp: new Date\(\)\.toISOString\(\),\n      \};/;
const ackFixed = `const ack: PeerMessage = {
        type: 'DELTA_ACK',
        eventId: msg.eventId,
        nodeId: this.config.localNodeId,
        fileId: msg.fileId,
        timestamp: new Date().toISOString(),
      };`;
content = content.replace(ackMissingRegex, ackFixed);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done!');
