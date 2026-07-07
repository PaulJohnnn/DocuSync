'use client';
import React, { useState, useRef, useEffect } from 'react';
import PageShell from '@/components/PageShell';
import { VectorClock } from '@/lib/vector-clock';
import { encode } from '@/lib/delta-encoder';
import { decode } from '@/lib/delta-decoder';
import { SplitSquareHorizontal, ArrowRightLeft, Clock } from 'lucide-react';

export default function DemoPage() {
  const [textA, setTextA] = useState("DocuSync Defense Demo\nType here...");
  const [textB, setTextB] = useState("DocuSync Defense Demo\nType here...");
  
  const vcA = useRef<VectorClock | null>(null);
  const vcB = useRef<VectorClock | null>(null);
  
  const lastA = useRef("DocuSync Defense Demo\nType here...");
  const lastB = useRef("DocuSync Defense Demo\nType here...");

  const [logs, setLogs] = useState<string[]>([]);
  const log = (msg: string) => setLogs(prev => [...prev, msg].slice(-10));

  useEffect(() => {
    vcA.current = new VectorClock(2, 0);
    vcB.current = new VectorClock(2, 1);
  }, []);

  const handleEditA = (newText: string) => {
    if (!vcA.current) return;
    setTextA(newText);
    vcA.current.increment();
    const result = encode(lastA.current, newText, 'doc');
    lastA.current = newText;
    
    log(`[Peer A] Edited locally. VC: [${vcA.current.counters.join(', ')}]`);
    
    // Simulate network delay
    setTimeout(() => {
      receiveAtB(result.deltaBase64 || '', vcA.current!.toJSON());
    }, 800);
  };

  const handleEditB = (newText: string) => {
    if (!vcB.current) return;
    setTextB(newText);
    vcB.current.increment();
    const result = encode(lastB.current, newText, 'doc');
    lastB.current = newText;
    
    log(`[Peer B] Edited locally. VC: [${vcB.current.counters.join(', ')}]`);
    
    // Simulate network delay
    setTimeout(() => {
      receiveAtA(result.deltaBase64 || '', vcB.current!.toJSON());
    }, 800);
  };

  const receiveAtA = (delta: string, vcJson: any) => {
    if (!vcA.current) return;
    const incVc = VectorClock.fromJSON(vcJson);
    const rel = vcA.current.compare(incVc);
    if (rel === 'dominated') {
       try {
         const res = decode(lastA.current, delta);
         setTextA(res.content);
         lastA.current = res.content;
         vcA.current.merge(incVc);
         log(`[Peer A] Clean Merge from B. VC: [${vcA.current.counters.join(', ')}]`);
       } catch(e) {}
    } else if (rel === 'concurrent') {
       log(`[Peer A] CONFLICT DETECTED! Clocks are concurrent. Escalated to LWW.`);
       vcA.current.merge(incVc);
       // A ignores B's edit for conflict simulation
    }
  };

  const receiveAtB = (delta: string, vcJson: any) => {
    if (!vcB.current) return;
    const incVc = VectorClock.fromJSON(vcJson);
    const rel = vcB.current.compare(incVc);
    if (rel === 'dominated') {
       try {
         const res = decode(lastB.current, delta);
         setTextB(res.content);
         lastB.current = res.content;
         vcB.current.merge(incVc);
         log(`[Peer B] Clean Merge from A. VC: [${vcB.current.counters.join(', ')}]`);
       } catch(e) {}
    } else if (rel === 'concurrent') {
       log(`[Peer B] CONFLICT DETECTED! Clocks are concurrent. Escalated to LWW.`);
       vcB.current.merge(incVc);
       // B ignores A's edit for conflict simulation
    }
  };

  return (
    <PageShell title="Visual Defense Demo">
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '2rem' }}>
          <SplitSquareHorizontal size={24} style={{ color: 'var(--brand)' }} />
          <h1 style={{ fontSize: 24, fontWeight: 'bold' }}>Same-Machine P2P Simulation</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* PEER A */}
          <div style={{ background: 'var(--bg2)', padding: 16, borderRadius: 12, border: '1px solid var(--b1)' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 'bold', marginBottom: 16, color: 'var(--brand)' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--brand)' }} />
              Simulated Peer A
            </h2>
            <textarea 
              value={textA}
              onChange={(e) => handleEditA(e.target.value)}
              style={{ width: '100%', height: 200, padding: 12, borderRadius: 8, border: '1px solid var(--b2)', background: 'var(--bg)', color: 'var(--t1)', resize: 'none' }}
            />
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={14} /> Vector Clock A: [{vcA.current ? vcA.current.counters.join(', ') : '0, 0'}]
            </div>
          </div>

          {/* PEER B */}
          <div style={{ background: 'var(--bg2)', padding: 16, borderRadius: 12, border: '1px solid var(--b1)' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 'bold', marginBottom: 16, color: '#e07e52' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#e07e52' }} />
              Simulated Peer B
            </h2>
            <textarea 
              value={textB}
              onChange={(e) => handleEditB(e.target.value)}
              style={{ width: '100%', height: 200, padding: 12, borderRadius: 8, border: '1px solid var(--b2)', background: 'var(--bg)', color: 'var(--t1)', resize: 'none' }}
            />
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={14} /> Vector Clock B: [{vcB.current ? vcB.current.counters.join(', ') : '0, 0'}]
            </div>
          </div>
        </div>

        {/* LOGS */}
        <div style={{ marginTop: 32, background: '#111', padding: 16, borderRadius: 12, border: '1px solid #333' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#aaa', fontSize: 14, marginBottom: 12, textTransform: 'uppercase' }}>
            <ArrowRightLeft size={16} /> Virtual Network Bus (500ms latency)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'monospace', fontSize: 12 }}>
            {logs.length === 0 ? <div style={{ color: '#555' }}>Waiting for edits...</div> : logs.map((l, i) => (
              <div key={i} style={{ color: l.includes('CONFLICT') ? '#ff6b6b' : '#4dabf7' }}>{l}</div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
