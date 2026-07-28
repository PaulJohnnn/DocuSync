import React, { useState, useEffect, useRef } from 'react';
import { useElectronSync } from '@/context/ElectronSyncContext';

const WebRTCDemoPage: React.FC = () => {
  const { localNodeId, isAdmin } = useElectronSync();
  const [otp, setOtp] = useState('ROOM-01');
  const [targetNodeId, setTargetNodeId] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [status, setStatus] = useState('Disconnected');
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const _base = import.meta.env.VITE_WEB_URL || 'https://docusync-pnc.vercel.app';
        const res = await fetch(`${_base}/api/lobby/signal?otp=${otp}&nodeId=${localNodeId}`);
        const json = await res.json();
        
        for (const signal of (json.signals || [])) {
          if (signal.type === 'offer') {
            await handleOffer(signal);
          } else if (signal.type === 'answer') {
            await handleAnswer(signal);
          } else if (signal.type === 'candidate') {
            await handleCandidate(signal);
          }
        }
      } catch (err) {
        console.error('Failed to poll signals:', err);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [localNodeId]);

  const initPC = (targetId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await sendSignal(targetId, 'candidate', event.candidate);
      }
    };

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      setupChannel(channel);
    };

    peerConnection.current = pc;
    return pc;
  };

  const setupChannel = (channel: RTCDataChannel) => {
    channel.onopen = () => setStatus('Connected via WebRTC');
    channel.onclose = () => setStatus('Disconnected');
    channel.onmessage = (e) => {
      setMessages(prev => [...prev, `Remote: ${e.data}`]);
    };
    dataChannel.current = channel;
  };

  const sendSignal = async (toNodeId: string, type: string, data: any) => {
    const _base = import.meta.env.VITE_WEB_URL || 'https://docusync-pnc.vercel.app';
    await fetch(`${_base}/api/lobby/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        otp,
        targetNodeId: toNodeId,
        senderNodeId: localNodeId,
        type,
        data
      })
    });
  };

  const connect = async () => {
    if (!targetNodeId) return;
    setStatus('Connecting...');
    const pc = initPC(targetNodeId);
    
    const dc = pc.createDataChannel('demo-channel');
    setupChannel(dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    await sendSignal(targetNodeId, 'offer', offer);
  };

  const handleOffer = async (signal: any) => {
    setStatus('Receiving connection...');
    setTargetNodeId(signal.senderNodeId);
    const pc = initPC(signal.senderNodeId);
    
    await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await sendSignal(signal.senderNodeId, 'answer', answer);
  };

  const handleAnswer = async (signal: any) => {
    if (peerConnection.current) {
      await peerConnection.current.setRemoteDescription(
        new RTCSessionDescription(signal.data)
      );
    }
  };

  const handleCandidate = async (signal: any) => {
    if (peerConnection.current) {
      await peerConnection.current.addIceCandidate(new RTCIceCandidate(signal.data));
    }
  };

  const sendMessage = () => {
    if (dataChannel.current && dataChannel.current.readyState === 'open') {
      const msg = `Hello from Node ${localNodeId.substring(0, 4)}!`;
      dataChannel.current.send(msg);
      setMessages(prev => [...prev, `Local: ${msg}`]);
    } else {
      console.warn('Channel not open');
    }
  };

  return (
    <div style={{
      padding: '32px 40px', background: '#0f172a', minHeight: '100vh', color: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{
          background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '24px 28px',
          marginBottom: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#ffffff' }}>
              Direct WebRTC P2P Protocol Diagnostics Channel
            </h1>
            <span style={{
              fontSize: 11, background: 'rgba(99,102,241,0.15)', color: '#818cf8',
              padding: '4px 10px', borderRadius: 20, fontWeight: 700, border: '1px solid rgba(99,102,241,0.3)'
            }}>WEBRTC VERIFICATION</span>
          </div>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
            Local Node ID: <strong style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{localNodeId}</strong>
          </p>
        </div>
      
        <div style={{
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
          padding: '20px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap'
        }}>
          <input 
            placeholder="Room Code" 
            value={otp}
            onChange={e => setOtp(e.target.value)}
            style={{
              padding: '10px 14px', width: 120, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
              background: '#0f172a', color: '#fff', fontSize: 13, fontWeight: 600
            }}
          />
          <input 
            placeholder="Target Node ID" 
            value={targetNodeId}
            onChange={e => setTargetNodeId(e.target.value)}
            style={{
              padding: '10px 14px', flex: 1, minWidth: 240, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
              background: '#0f172a', color: '#fff', fontSize: 13, fontFamily: 'monospace'
            }}
          />
          <button
            onClick={connect}
            disabled={!targetNodeId}
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: targetNodeId ? 'pointer' : 'not-allowed', opacity: targetNodeId ? 1 : 0.5
            }}
          >
            Initiate P2P Link
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 14 }}>
            <strong>Protocol Status:</strong>{' '}
            <span style={{
              color: status.includes('Connected') ? '#34d399' : '#f87171',
              fontWeight: 700
            }}>{status}</span>
          </div>
          <button
            onClick={sendMessage}
            disabled={status !== 'Connected via WebRTC'}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(56,189,248,0.3)',
              background: 'rgba(56,189,248,0.15)', color: '#38bdf8', fontSize: 12, fontWeight: 600,
              cursor: status === 'Connected via WebRTC' ? 'pointer' : 'not-allowed'
            }}
          >
            Transmit Diagnostics Packet
          </button>
        </div>

        <div style={{
          background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
          padding: '16px', height: '320px', overflowY: 'auto'
        }}>
          {messages.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 120 }}>
              No transmission packets logged. Initiate a peer connection to begin stream.
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} style={{ marginBottom: '8px', fontFamily: 'monospace', fontSize: 13, color: '#e2e8f0' }}>{m}</div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default WebRTCDemoPage;
