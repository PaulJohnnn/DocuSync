'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { ArrowLeft, Save, RefreshCw, Clock, WifiOff, Wifi } from 'lucide-react';
import dynamic from 'next/dynamic';
import { uGet, uSet } from '@/lib/userStorage';
import { useWebSync } from '@/context/WebSyncContext';
const TipTapEditor = dynamic(() => import('@/components/TipTapEditor'), { ssr: false });

// ── Matchmaker URL ─────────────────────────────────────────────────────────
const MATCHMAKER_URL = process.env.NODE_ENV === 'development'
  ? '/api/lobby'
  : 'https://docusync-pnc.vercel.app/api/lobby';

interface FileRecord {
  id: string; name: string; type: string; size: number;
  content: string; status: string; createdAt: string; updatedAt: string;
}

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params.id as string;
  const [file, setFile] = useState<FileRecord | null>(null);
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatusMsg, setSyncStatusMsg] = useState('Ready');
  const [escalated, setEscalated] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState(false);
  
  const lastSave = useRef('');
  const lastSyncedAt = useRef(0);
  const channelRef = useRef<any>(null);
  const localNodeIdRef = useRef(`web-${Math.floor(Math.random()*10000)}`);
  const syncDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { peers } = useWebSync();
  const connectedPeersCount = peers.filter((p) => p.status === 'connected').length;

  // ── Online/Offline detection ──────────────────────────────────────────────
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      // If we had queued edits, push them now
      if (offlineQueue) {
        pushToRedis(content, true);
        setOfflineQueue(false);
      }
    };
    const goOffline = () => {
      setIsOnline(false);
      setSyncStatusMsg('Offline — edits saved locally');
    };
    setIsOnline(navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [offlineQueue, content]);

  // ── Load file from local storage ──────────────────────────────────────────
  useEffect(() => {
    const stored = uGet('files');
    if (!stored) return;
    const files: FileRecord[] = JSON.parse(stored);
    const found = files.find(f => f.id === fileId);
    if (found) {
      setFile(found);
      setContent(found.content);
      lastSave.current = found.content;
    }

    const savedNodeId = localStorage.getItem('docusync_node_id');
    if (savedNodeId) localNodeIdRef.current = savedNodeId;
  }, [fileId]);

  // ── Get room OTP ──────────────────────────────────────────────────────────
  const getRoomOtp = useCallback((): string | null => {
    try {
      const storedRoomStr = uGet('current_room');
      if (!storedRoomStr) return null;
      const room = JSON.parse(storedRoomStr);
      return room?.otp || room?.id || null;
    } catch { return null; }
  }, []);

  // ── Push content to Redis (Matchmaker /api/lobby/doc) ─────────────────────
  const pushToRedis = useCallback(async (contentToSave: string, explicit = false) => {
    const otp = getRoomOtp();
    if (!otp) return;

    if (!navigator.onLine) {
      setSyncStatusMsg('Offline — queued for sync');
      setOfflineQueue(true);
      return;
    }

    setSyncing(true);
    setSyncStatusMsg('Syncing...');

    try {
      const deltaSize = new Blob([contentToSave]).size;
      const now = Date.now();
      lastSyncedAt.current = now;

      const res = await fetch(`${MATCHMAKER_URL}/doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otp,
          fileId,
          authorNodeId: localNodeIdRef.current,
          authorName: localNodeIdRef.current.slice(0, 8),
          content: contentToSave,
          vectorClock: {},
          deltaSize,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.conflict) {
          setEscalated(true);
          setSyncStatusMsg('Conflict — sent to owner for review');
          setTimeout(() => setEscalated(false), 5000);
        } else {
          setSyncStatusMsg(`Synced ✓ (v${data.seq || '?'}) at ${new Date().toLocaleTimeString()}`);
          setOfflineQueue(false);
        }
      } else {
        setSyncStatusMsg('Sync failed — queued for retry');
        setOfflineQueue(true);
      }
    } catch (e) {
      console.error('[Web Sync] Push failed:', e);
      setSyncStatusMsg('Offline — queued for sync');
      setOfflineQueue(true);
    } finally {
      setSyncing(false);
    }
  }, [fileId, getRoomOtp]);

  // ── Poll Redis for remote updates ─────────────────────────────────────────
  useEffect(() => {
    const otp = getRoomOtp();
    if (!otp) return;

    const pollDoc = async () => {
      if (!navigator.onLine) return;
      try {
        const url = `${MATCHMAKER_URL}/doc?otp=${otp}&fileId=${fileId}&since=${lastSyncedAt.current}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();

        if (data.unchanged || !data.snapshot) {
          // No update — just refresh the timestamp display
          if (lastSyncedAt.current > 0) {
            setSyncStatusMsg(`Last synced ${new Date().toLocaleTimeString()}`);
          }
          return;
        }

        const snap = data.snapshot;
        // Only apply if it's genuinely newer AND not written by us
        if (snap.committedAt > lastSyncedAt.current && snap.authorNodeId !== localNodeIdRef.current) {
          lastSyncedAt.current = snap.committedAt;
          setContent(snap.content);
          lastSave.current = snap.content;
          setSaved(true);
          setSyncStatusMsg(`↓ Synced from ${snap.authorName || 'peer'} at ${new Date().toLocaleTimeString()}`);

          // Also update local storage so the file list shows latest content
          try {
            const stored = uGet('files');
            if (stored) {
              const files: FileRecord[] = JSON.parse(stored);
              const idx = files.findIndex(f => f.id === fileId);
              if (idx >= 0) {
                files[idx].content = snap.content;
                files[idx].updatedAt = new Date().toISOString();
                files[idx].size = new Blob([snap.content]).size;
                uSet('files', JSON.stringify(files));
              }
            }
          } catch {}
        }
      } catch {
        // Polling failure is silent — we'll retry next interval
      }
    };

    pollDoc();
    channelRef.current = setInterval(pollDoc, 3000);
    return () => { if (channelRef.current) clearInterval(channelRef.current); };
  }, [fileId, getRoomOtp]);

  // ── Save locally + push to Redis (debounced) ─────────────────────────────
  const saveFile = useCallback(async (contentToSave: string, forcePush = false) => {
    if (contentToSave === lastSave.current && !forcePush) return;

    // Step 1: Save locally
    const stored = uGet('files');
    if (!stored) return;
    const files: FileRecord[] = JSON.parse(stored);
    const idx = files.findIndex(f => f.id === fileId);
    if (idx >= 0) {
      files[idx].content = contentToSave;
      files[idx].updatedAt = new Date().toISOString();
      files[idx].size = new Blob([contentToSave]).size;
      uSet('files', JSON.stringify(files));
    }

    // Log to local event history
    const events = JSON.parse(localStorage.getItem(`docusync_events_${fileId}`) || '[]');
    events.push({
      id: events.length + 1,
      eventId: crypto.randomUUID(),
      fileId, nodeId: localNodeIdRef.current,
      eventType: 'edit',
      logicalTimestamp: events.length + 1,
      payload: contentToSave.slice(0, 200),
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem(`docusync_events_${fileId}`, JSON.stringify(events));

    lastSave.current = contentToSave;
    setSaved(true);

    // Step 2: Push to Redis (debounced — 2s after last edit, or immediate if forcePush)
    if (syncDebounce.current) clearTimeout(syncDebounce.current);
    if (forcePush) {
      await pushToRedis(contentToSave, true);
    } else {
      syncDebounce.current = setTimeout(() => {
        pushToRedis(contentToSave);
      }, 2000);
    }
  }, [fileId, pushToRedis]);

  // ── Auto-save on content change ───────────────────────────────────────────
  useEffect(() => {
    if (!file) return;
    const timer = setTimeout(() => { saveFile(content); }, 500);
    return () => clearTimeout(timer);
  }, [content, file, saveFile]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setSaved(false);
  }, []);

  // ── Explicit Sync Now ─────────────────────────────────────────────────────
  const handleSyncNow = useCallback(async () => {
    await saveFile(content, true);
  }, [content, saveFile]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!file) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--t3)' }}>
          <p>File not found. <button onClick={() => router.push('/app/files')} style={{ color: 'var(--acc)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Go back</button></p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {escalated && (
        <div style={{ background: 'var(--bg-warn)', color: '#d97706', padding: '10px 16px', borderRadius: 8, marginBottom: 16 }}>
          Change escalated to room owner for conflict resolution.
        </div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="ds-btn" onClick={async () => { await saveFile(content, true); router.push('/app/files'); }}>
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>{file.name}</h1>
            <p style={{ fontSize: 11, color: 'var(--t3)', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              {saved ? '✓ Saved' : '● Unsaved'} • 
              {isOnline
                ? <><Wifi size={10} style={{ color: 'var(--green, #22c55e)' }} /> {syncStatusMsg}</>
                : <><WifiOff size={10} style={{ color: '#ef4444' }} /> Offline — edits saved locally</>
              }
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ds-btn" onClick={() => saveFile(content, false)}>
            <Save size={14} /> Save
          </button>
          <button className="ds-btn ds-btn-primary" onClick={handleSyncNow} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? 'ds-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--b1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <TipTapEditor 
          content={content} 
          onChange={handleContentChange} 
          cursors={[]}
        />
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 12, padding: '8px 12px',
        background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 8,
        fontSize: 11, color: 'var(--t3)', fontFamily: 'monospace',
      }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <span><Clock size={10} style={{ marginRight: 4 }} />file: {file.name}</span>
          <span>Δ {new Blob([content]).size} B</span>
          {offlineQueue && <span style={{ color: '#ef4444' }}>⏳ Queued offline</span>}
        </div>
        <span>{connectedPeersCount} peers connected</span>
      </div>
    </PageShell>
  );
}
