import os

file_path = "desktop/src/engine/peer/peer-manager.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports
content = content.replace("import { WebSocketServer, WebSocket } from 'ws';", "")

# 2. MockSocket definition
mock_socket_def = """
export const WEBSOCKET_OPEN = 1;

export interface MockSocket {
  id: string;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  terminate: () => void;
  ping: () => void;
  readyState: number;
}
"""
content = content.replace("interface ConnectedPeer {\n  /** The live WebSocket connection. */\n  socket: WebSocket;", mock_socket_def + "\ninterface ConnectedPeer {\n  /** The live WebSocket connection. */\n  socket: MockSocket;")

# 3. Maps and config
content = content.replace("private readonly peers: Map<WebSocket, ConnectedPeer> = new Map();", "private peers: Map<MockSocket, ConnectedPeer> = new Map();\n  private peersById: Map<string, MockSocket> = new Map();")
content = content.replace("private readonly rateLimiters: Map<WebSocket, RateLimiterEntry> = new Map();", "private rateLimiters: Map<MockSocket, RateLimiterEntry> = new Map();")
content = content.replace("private readonly config: PeerManagerConfig;", "private config: PeerManagerConfig;")
content = content.replace("private server: WebSocketServer | null = null;", "")
content = content.replace("onPeerListChanged?: () => void;", "onPeerListChanged?: () => void;\n  sendToRenderer?: (peerId: string, payload: string) => void;")

# 4. Global WebSocket -> MockSocket replacements for method arguments
content = content.replace("socket: WebSocket", "socket: MockSocket")
content = content.replace("_socket: WebSocket", "_socket: MockSocket")
content = content.replace("existingSocket: WebSocket", "existingSocket: MockSocket")
content = content.replace("WebSocket.OPEN", "WEBSOCKET_OPEN")

# 5. Method implementations
# startServer
import re

start_server_pattern = re.compile(r"public startServer\(port: number\): Promise<void> \{.*?\}\n  \}", re.DOTALL)
content = start_server_pattern.sub("public async startServer(port: number): Promise<void> {\n    console.log(`[PeerManager] Using WebRTC + IPC bridging (skipping local WS server on port ${port})`);\n    return Promise.resolve();\n  }", content)

# connectToPeer
connect_to_peer_pattern = re.compile(r"public connectToPeer\(address: string, port: number\): Promise<void> \{.*?\}\n  \}", re.DOTALL)
content = connect_to_peer_pattern.sub("public async connectToPeer(address: string, port: number): Promise<void> {\n    console.log(`[PeerManager] connectToPeer(${address}:${port}) skipped (using WebRTC mesh).`);\n    return Promise.resolve();\n  }", content)

# broadcast
content = content.replace("public broadcast(message: PeerMessage): number {", "public broadcastMessage(message: PeerMessage): number {")
content = content.replace("this.broadcast(byeMessage);", "this.broadcastMessage(byeMessage);")

# sendTo
send_to_pattern = re.compile(r"public sendTo\(nodeId: string, message: PeerMessage\): boolean \{.*?return false;\n  \}", re.DOTALL)
send_to_replacement = """public sendTo(nodeId: string, message: PeerMessage): boolean {
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
  }"""
content = send_to_pattern.sub(send_to_replacement, content)

# getConnectedPeerIds
get_ids_pattern = re.compile(r"public getConnectedPeerIds\(\): string\[\] \{.*?return ids;\n  \}", re.DOTALL)
get_ids_replacement = """public getConnectedPeerIds(): string[] {
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
  }"""
content = get_ids_pattern.sub(get_ids_replacement, content)

# shutdown
shutdown_pattern = re.compile(r"public async shutdown\(\): Promise<void> \{.*?console\.log\('\[PeerManager\] Shutdown complete\.'\);\n  \}", re.DOTALL)
shutdown_replacement = """public async shutdown(): Promise<void> {
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
  }"""
content = shutdown_pattern.sub(shutdown_replacement, content)

# registerSocket
register_socket_pattern = re.compile(r"private registerSocket\([\s\S]*?socket\.on\('pong', \(\) => \{\n      \(socket as unknown as Record<string, boolean>\)\['_isAlive'\] = true;\n    \}\);\n  \}")
register_socket_replacement = """private registerSocket(
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
  }"""
content = register_socket_pattern.sub(register_socket_replacement, content)

# handleDisconnect -> handlePeerDisconnect
content = content.replace("this.handleDisconnect(", "this.handlePeerDisconnect(")
handle_disconnect_pattern = re.compile(r"private async handleDisconnect\(socket: MockSocket\): Promise<void> \{.*?this\.rateLimiters\.delete\(socket\);\n  \}", re.DOTALL)
handle_disconnect_replacement = """private handlePeerDisconnect(socket: MockSocket, reason?: string): void {
    const peer = this.peers.get(socket);
    if (!peer) return;

    if (peer.nodeId) {
      this.peersById.delete(peer.nodeId);
    }
    this.peers.delete(socket);
    this.rateLimiters.delete(socket);
  }"""
content = handle_disconnect_pattern.sub(handle_disconnect_replacement, content)

# handlePeerHello
handle_peer_hello_pattern = re.compile(r"private async handlePeerHello\([\s\S]*?\[PeerManager\] PEER_HELLO from \$\{msg\.displayName\} \(\$\{msg\.nodeId\}\)\`\n    \);")
handle_peer_hello_replacement = """private async handlePeerHello(
    socket: MockSocket,
    msg: PeerHelloMessage
  ): Promise<void> {
    const peer = this.peers.get(socket);
    if (!peer) return;

    let existingSocket = this.peersById.get(msg.nodeId);

    if (existingSocket && existingSocket !== socket) {
      console.log(`[PeerManager] Duplicate PEER_HELLO for ${msg.nodeId}. Requesting verification.`);
      const verifyMsg: UserVerifyMessage = {
        type: 'USER_VERIFY',
        nodeId: msg.nodeId,
        timestamp: new Date().toISOString(),
      };
      existingSocket.send(serialiseMessage(verifyMsg));
      
      if (this.config.onUserVerifyRequest) {
        const allowed = await this.config.onUserVerifyRequest(msg.nodeId);
        if (!allowed) {
          console.log(`[PeerManager] Connection from ${msg.nodeId} blocked by user.`);
          socket.close(4001, 'Connection blocked by user');
          this.peers.delete(socket);
          this.rateLimiters.delete(socket);
          return;
        } else {
          console.log(`[PeerManager] Connection from ${msg.nodeId} allowed. Terminating old socket.`);
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
      `[PeerManager] PEER_HELLO from ${msg.displayName} (${msg.nodeId})`
    );"""
content = handle_peer_hello_pattern.sub(handle_peer_hello_replacement, content)

# DELTA_PUSH fileId error Fix (this might be caused by missing fileId in DELTA_ACK in earlier code, I'll restore it just in case)
content = content.replace("""const ack: PeerMessage = {
        type: 'DELTA_ACK',
        eventId: msg.eventId,
        nodeId: this.config.localNodeId,
        timestamp: new Date().toISOString(),
      };""", """const ack: PeerMessage = {
        type: 'DELTA_ACK',
        eventId: msg.eventId,
        nodeId: this.config.localNodeId,
        fileId: msg.fileId,
        timestamp: new Date().toISOString(),
      };""")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Done!")
