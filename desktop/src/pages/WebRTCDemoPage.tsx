import React, { useState, useEffect, useRef } from 'react';
import { useElectronSync } from '@/context/ElectronSyncContext';

const WebRTCDemoPage: React.FC = () => {
  const { localNodeId, isAdmin } = useElectronSync();
  const [otp, setOtp] = useState('DEMO123');
  const [targetNodeId, setTargetNodeId] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [status, setStatus] = useState('Disconnected');
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/lobby/signal?otp=${otp}&nodeId=${localNodeId}`);
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
    await fetch('http://localhost:3000/api/lobby/signal', {
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
    <div style={{ padding: '2rem' }}>
      <h1>Isolated WebRTC DataChannel Demo</h1>
      <p>My Node ID: <strong>{localNodeId}</strong></p>
      
      <div style={{ margin: '1rem 0', display: 'flex', gap: '0.5rem' }}>
        <input 
          placeholder="Room OTP" 
          value={otp}
          onChange={e => setOtp(e.target.value)}
          style={{ padding: '0.5rem', width: '100px' }}
        />
        <input 
          placeholder="Target Node ID" 
          value={targetNodeId}
          onChange={e => setTargetNodeId(e.target.value)}
          style={{ padding: '0.5rem', width: '300px' }}
        />
        <button onClick={connect} disabled={!targetNodeId}>Connect</button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <strong>Status:</strong> <span style={{ color: status.includes('Connected') ? '#4caf50' : '#f44336' }}>{status}</span>
      </div>

      <button onClick={sendMessage} disabled={status !== 'Connected via WebRTC'}>
        Send Test Message
      </button>

      <div style={{ marginTop: '2rem', background: '#1e1e1e', padding: '1rem', height: '300px', overflowY: 'auto' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: '0.5rem', fontFamily: 'monospace' }}>{m}</div>
        ))}
      </div>
    </div>
  );
};

export default WebRTCDemoPage;
