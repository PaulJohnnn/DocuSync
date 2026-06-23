'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { ArrowLeft, Save, RefreshCw, Clock } from 'lucide-react';
import dynamic from 'next/dynamic';

const TipTapEditor = dynamic(() => import('@/components/TipTapEditor'), { ssr: false });

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
  const [vcState, setVcState] = useState<number[]>([0, 0, 0]);
  const [deltaSize, setDeltaSize] = useState(0);
  const lastSave = useRef('');

  useEffect(() => {
    const stored = localStorage.getItem('docusync_files');
    if (!stored) return;
    const files: FileRecord[] = JSON.parse(stored);
    const found = files.find(f => f.id === fileId);
    if (found) {
      setFile(found);
      setContent(found.content);
      lastSave.current = found.content;
    }
  }, [fileId]);

  // Auto-save every 500ms
  useEffect(() => {
    if (!file) return;
    const iv = setInterval(() => {
      if (content !== lastSave.current) {
        const stored = localStorage.getItem('docusync_files');
        if (!stored) return;
        const files: FileRecord[] = JSON.parse(stored);
        const idx = files.findIndex(f => f.id === fileId);
        if (idx >= 0) {
          files[idx].content = content;
          files[idx].updatedAt = new Date().toISOString();
          files[idx].size = new Blob([content]).size;
          localStorage.setItem('docusync_files', JSON.stringify(files));

          // Simulate delta
          const delta = Math.abs(content.length - lastSave.current.length);
          setDeltaSize(delta);
          setVcState(v => {
            const n = [...v];
            n[0] = n[0] + 1;
            return n;
          });

          // Log event
          const events = JSON.parse(localStorage.getItem(`docusync_events_${fileId}`) || '[]');
          events.push({
            id: events.length + 1,
            eventId: crypto.randomUUID(),
            fileId, nodeId: localStorage.getItem('docusync_node_id') || 'web',
            eventType: 'edit',
            logicalTimestamp: events.length + 1,
            payload: content.slice(0, 200),
            createdAt: new Date().toISOString(),
          });
          localStorage.setItem(`docusync_events_${fileId}`, JSON.stringify(events));

          lastSave.current = content;
          setSaved(true);
        }
      }
    }, 500);
    return () => clearInterval(iv);
  }, [content, file, fileId]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setSaved(false);
  }, []);

  if (!file) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--t3)' }}>
          <p>File not found. <button onClick={() => router.push('/')} style={{ color: 'var(--acc)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Go back</button></p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="ds-btn" onClick={() => router.push('/')}>
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>{file.name}</h1>
            <p style={{ fontSize: 11, color: 'var(--t3)', margin: '2px 0 0' }}>
              {saved ? '✓ Saved' : '● Unsaved'} • Last: {new Date(file.updatedAt).toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ds-btn" onClick={() => setSaved(true)}>
            <Save size={14} /> Save
          </button>
          <button className="ds-btn ds-btn-primary">
            <RefreshCw size={14} /> Sync Now
          </button>
        </div>
      </div>

      {/* Editor */}
      <div style={{
        background: 'var(--s1)', border: '1px solid var(--b1)',
        borderRadius: 10, overflow: 'hidden', flex: 1,
      }}>
        <TipTapEditor content={content} onChange={handleContentChange} />
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 12, padding: '8px 12px',
        background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 8,
        fontSize: 11, color: 'var(--t3)', fontFamily: 'monospace',
      }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <span><Clock size={10} style={{ marginRight: 4 }} />vc [{vcState.join(', ')}]</span>
          <span>Δ {deltaSize} B</span>
        </div>
        <span>0 peers connected</span>
      </div>
    </PageShell>
  );
}
