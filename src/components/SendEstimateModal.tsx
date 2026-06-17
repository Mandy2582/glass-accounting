'use client';

import { useState } from 'react';
import { X, Mail, Send, Loader2 } from 'lucide-react';
import { CustomDesign } from '@/types';
import { getAuthHeaders } from '@/lib/auth';

interface SendEstimateModalProps {
    design: CustomDesign;
    pdfBase64?: string;
    generatePdfBase64?: () => Promise<string>;
    onClose: () => void;
}

export default function SendEstimateModal({ design, pdfBase64, generatePdfBase64, onClose }: SendEstimateModalProps) {
    const [email, setEmail] = useState(design.customerName || '');
    const [name, setName] = useState(design.customerName || '');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');

    const handleSend = async () => {
        // Validation
        if (!email.trim() || !name.trim()) {
            setError('Please fill in all required fields');
            return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setError('Please enter a valid email address');
            return;
        }

        setError('');
        setSending(true);

        try {
            let finalBase64 = pdfBase64;
            if (!finalBase64 && generatePdfBase64) {
                finalBase64 = await generatePdfBase64();
            }
            const authHeaders = await getAuthHeaders();

            const response = await fetch('/api/send-estimate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({
                    designId: design.id,
                    recipientEmail: email,
                    recipientName: name,
                    message: message,
                    ...(finalBase64 ? { pdfBase64: finalBase64 } : {})
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send email');
            }

            alert('Estimate sent successfully!');
            onClose();
        } catch (error: any) {
            console.error('Error sending estimate:', error);
            setError(error.message || 'Failed to send estimate. Please try again.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div
            className="modal-overlay"
            onClick={onClose}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
            }}
        >
            <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '2rem',
                    maxWidth: '500px',
                    width: '90%',
                    maxHeight: '90vh',
                    overflow: 'auto',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Mail size={24} style={{ color: 'var(--color-primary)' }} />
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Send Estimate</h2>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.5rem',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        disabled={sending}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Design Info */}
                <div style={{
                    background: 'var(--color-bg-secondary)',
                    padding: '1rem',
                    borderRadius: '8px',
                    marginBottom: '1.5rem'
                }}>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
                        Design
                    </div>
                    <div style={{ fontWeight: 600 }}>{design.name}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                        Estimated Cost: <span style={{ color: '#10b981', fontWeight: 600 }}>₹{design.estimatedCost.toFixed(2)}</span>
                    </div>
                </div>

                {/* Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem' }}>
                            Recipient Name <span style={{ color: 'red' }}>*</span>
                        </label>
                        <input
                            type="text"
                            className="form-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter recipient name"
                            disabled={sending}
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem' }}>
                            Email Address <span style={{ color: 'red' }}>*</span>
                        </label>
                        <input
                            type="email"
                            className="form-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="recipient@example.com"
                            disabled={sending}
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem' }}>
                            Custom Message (Optional)
                        </label>
                        <textarea
                            className="form-input"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Add a personal message to include in the email..."
                            rows={4}
                            disabled={sending}
                            style={{ width: '100%', resize: 'vertical' }}
                        />
                    </div>

                    {error && (
                        <div style={{
                            background: '#fee2e2',
                            border: '1px solid #fecaca',
                            color: '#991b1b',
                            padding: '0.75rem',
                            borderRadius: '6px',
                            fontSize: '0.875rem'
                        }}>
                            {error}
                        </div>
                    )}

                    {/* Info */}
                    <div style={{
                        background: '#f0f9ff',
                        border: '1px solid #bae6fd',
                        padding: '0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        color: '#0c4a6e'
                    }}>
                        <strong>Note:</strong> The estimate will be sent as a PDF attachment with your custom message.
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={onClose}
                            disabled={sending}
                            style={{ flex: 1 }}
                        >
                            Cancel
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleSend}
                            disabled={sending}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                        >
                            {sending ? (
                                <>
                                    <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <Send size={18} />
                                    Send Estimate
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
