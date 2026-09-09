import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = true
}: ConfirmModalProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isOpen) setShow(true);
    else setTimeout(() => setShow(false), 250); // wait for animation
  }, [isOpen]);

  if (!isOpen && !show) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100000,
        background: isOpen ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0)',
        backdropFilter: isOpen ? 'blur(12px)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.25s ease',
        opacity: isOpen ? 1 : 0,
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--ds-card, #0f172a)', border: '1px solid var(--ds-border, rgba(255,255,255,0.08))',
          borderRadius: 24, padding: '32px', maxWidth: 440, width: '90%',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)',
          transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
          transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'
        }}
      >
        <div style={{
          width: 64, height: 64, borderRadius: '50%', marginBottom: 20,
          background: isDestructive ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          {isDestructive ? <AlertTriangle size={32} color="#ef4444" /> : <AlertTriangle size={32} color="#3b82f6" />}
        </div>
        
        <h3 style={{ margin: '0 0 12px 0', fontSize: 22, fontWeight: 800, color: 'var(--ds-text, #f8fafc)' }}>
          {title}
        </h3>
        
        <p style={{ margin: '0 0 32px 0', fontSize: 15, color: 'var(--ds-text3, #94a3b8)', lineHeight: 1.6 }}>
          {message}
        </p>

        <div style={{ display: 'flex', gap: 12, width: '100%' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px', borderRadius: 12, border: '1px solid var(--ds-border, rgba(255,255,255,0.1))',
              background: 'rgba(255,255,255,0.03)', color: 'var(--ds-text, #f8fafc)', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background 0.2s'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
          >
            <X size={16} />
            {cancelText}
          </button>
          
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: '12px', borderRadius: 12, border: 'none',
              background: isDestructive ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: isDestructive ? '0 4px 14px rgba(239, 68, 68, 0.4)' : '0 4px 14px rgba(59, 130, 246, 0.4)',
              transition: 'transform 0.1s, filter 0.2s'
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.1)'}
            onMouseOut={e => e.currentTarget.style.filter = 'brightness(1)'}
          >
            <Check size={16} strokeWidth={3} />
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}