/**
 * WebRTC P2P Mesh Manager
 * Handles signaling via Matchmaker and establishes direct RTCDataChannels.
 */

export type SignalMessage = {
  senderNodeId: string;
  type: 'offer' | 'answer' | 'candidate';
  data: any;
  ts: number;
};

export type PeerMessage = {
  type: 'hello' | 'bye' | 'delta' | 'cursor' | 'request_doc' | 'doc_snapshot';
  payload: any;
};

export class WebRTCManager {
  private peers: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  
  private signalingUrl: string;
  private otp: string;
  public localNodeId: string;
  
  public onMessage?: (senderId: string, msg: PeerMessage) => void;
  public onPeerConnect?: (peerId: string) => void;
  public onPeerDisconnect?: (peerId: string) => void;

  private pollInterval?: ReturnType<typeof setInterval>;

  constructor(signalingUrl: string, otp: string, localNodeId: string) {
    this.signalingUrl = signalingUrl;
    this.otp = otp;
    this.localNodeId = localNodeId;
  }

  public startSignaling() {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(this.pollSignals.bind(this), 2000);
    console.log(`[WebRTC] Started signaling for node ${this.localNodeId} in room ${this.otp}`);
  }

  public stopSignaling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }

  public disconnectAll() {
    this.stopSignaling();
    for (const [peerId, pc] of this.peers.entries()) {
      pc.close();
      this.onPeerDisconnect?.(peerId);
    }
    this.peers.clear();
    this.dataChannels.clear();
  }

  public getConnectedPeers(): string[] {
    return Array.from(this.dataChannels.keys());
  }

  public broadcast(msg: PeerMessage) {
    const data = JSON.stringify(msg);
    for (const channel of this.dataChannels.values()) {
      if (channel.readyState === 'open') {
        channel.send(data);
      }
    }
  }

  public sendTo(peerId: string, msg: PeerMessage) {
    const channel = this.dataChannels.get(peerId);
    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify(msg));
    }
  }

  private async pollSignals() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.signalingUrl}?otp=${this.otp}&nodeId=${this.localNodeId}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) return;
      const data = await res.json();
      
      const signals: SignalMessage[] = (data.signals || []).map((s: any) => typeof s === 'string' ? JSON.parse(s) : s);
      for (const signal of signals) {
        await this.handleSignal(signal);
      }
    } catch (err) {
      // Ignore abort/network errors during offline mode
    }
  }

  private async sendSignal(targetNodeId: string, type: string, data: any) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      await fetch(this.signalingUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          otp: this.otp,
          targetNodeId,
          senderNodeId: this.localNodeId,
          type,
          data
        })
      });
      clearTimeout(timeoutId);
    } catch (err) {
      // Ignore abort/network errors during offline mode
    }
  }

  private async handleSignal(signal: SignalMessage) {
    const { senderNodeId, type, data } = signal;
    
    // Ignore stale signals (> 60s)
    if (Date.now() - signal.ts > 60000) return;

    let pc = this.peers.get(senderNodeId);
    if (!pc) {
      // Only create a new connection if it's an offer.
      // If we got an answer or candidate for a missing connection, ignore.
      if (type !== 'offer') return;
      
      pc = this.createPeerConnection(senderNodeId);
    }

    try {
      if (type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await this.sendSignal(senderNodeId, 'answer', answer);
      } else if (type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
      } else if (type === 'candidate') {
        await pc.addIceCandidate(new RTCIceCandidate(data));
      }
    } catch (err) {
      console.error(`[WebRTC] Error handling signal ${type} from ${senderNodeId}`, err);
    }
  }

  public async connectToPeer(targetNodeId: string) {
    if (this.peers.has(targetNodeId)) return;
    
    const pc = this.createPeerConnection(targetNodeId);
    const channel = pc.createDataChannel('docusync-data');
    this.setupDataChannel(targetNodeId, channel);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.sendSignal(targetNodeId, 'offer', offer);
    } catch (err) {
      console.error('[WebRTC] Failed to create offer', err);
    }
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(peerId, 'candidate', event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection with ${peerId} state: ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.peers.delete(peerId);
        this.dataChannels.delete(peerId);
        this.onPeerDisconnect?.(peerId);
      }
    };

    pc.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel);
    };

    this.peers.set(peerId, pc);
    return pc;
  }

  private setupDataChannel(peerId: string, channel: RTCDataChannel) {
    channel.onopen = () => {
      console.log(`[WebRTC] Data channel open with ${peerId}`);
      this.dataChannels.set(peerId, channel);
      this.onPeerConnect?.(peerId);
      
      // Send Hello
      this.sendTo(peerId, { type: 'hello', payload: { nodeId: this.localNodeId } });
    };

    channel.onclose = () => {
      console.log(`[WebRTC] Data channel closed with ${peerId}`);
      this.dataChannels.delete(peerId);
      this.onPeerDisconnect?.(peerId);
    };

    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as PeerMessage;
        this.onMessage?.(peerId, msg);
      } catch (err) {
        console.warn(`[WebRTC] Failed to parse message from ${peerId}`, err);
      }
    };
  }
}
