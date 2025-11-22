'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    maxWidth?: string;
}

export default function Modal({ isOpen, onClose, title, children, maxWidth = '500px' }: ModalProps) {
    // ...
    // ...
    <div style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        width: '100%',
        maxWidth: maxWidth,
        boxShadow: 'var(--shadow-lg)',
        maxHeight: '90vh',
        overflowY: 'auto',
        margin: '1rem'
    }}>
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.25rem',
            borderBottom: '1px solid var(--color-border)'
        }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>{title}</h3>
            <button
                onClick={onClose}
                style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-muted)'
                }}
            >
                <X size={20} />
            </button>
        </div>
        <div style={{ padding: '1.5rem' }}>
            {children}
        </div>
    </div>
        </div >
    );
}
