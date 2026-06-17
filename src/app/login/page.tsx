'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';

export default function LoginPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        
        const { error: loginError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (loginError) {
            setError(loginError.message);
            setLoading(false);
            return;
        }

        router.replace('/');
        router.refresh();
    };

    return (
        <div className="login-shell" style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem'
        }}>
            <div className="login-layout" style={{
                display: 'flex',
                maxWidth: '1000px',
                width: '100%',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '4rem'
            }}>
                {/* Left Side - Branding */}
                <div className="login-branding" style={{ flex: '1 1 400px' }}>
                    <div className="login-brand-row" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div className="login-logo-tile" style={{
                            background: 'white',
                            padding: '16px',
                            borderRadius: '20px',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                            display: 'flex'
                        }}>
                            <Image
                                src="/logo.svg"
                                alt="Arjun Glass House Logo"
                                width={64}
                                height={64}
                                unoptimized
                                style={{ width: '64px', height: '64px', objectFit: 'contain' }}
                            />
                        </div>
                        <h1 className="login-brand-title" style={{
                            fontFamily: 'var(--font-cinzel)',
                            fontSize: '4rem',
                            fontWeight: 800,
                            color: 'white',
                            letterSpacing: '2px',
                            lineHeight: 1.1,
                            textShadow: '0 4px 12px rgba(0,0,0,0.2)'
                        }}>
                            ARJUN<br />GLASS HOUSE
                        </h1>
                    </div>
                    <p className="login-brand-copy" style={{
                        fontSize: '1.75rem',
                        lineHeight: '1.4',
                        color: '#1c1e21',
                        fontWeight: 400
                    }}>
                        Premium glass solutions for modern architectural needs.
                    </p>
                </div>

                {/* Right Side - Login Form */}
                <div style={{ flex: '1 1 350px', maxWidth: '400px' }}>
                    <div className="login-form-card" style={{
                        background: 'white',
                        padding: '2rem',
                        borderRadius: '12px',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.5)'
                    }}>
                        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {error && (
                                <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#ef4444', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
                                    {error}
                                </div>
                            )}
                            <input
                                type="email"
                                placeholder="Email"
                                className="input"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                style={{
                                    padding: '1rem',
                                    fontSize: '1.1rem',
                                    border: '1px solid #dddfe2',
                                    borderRadius: '8px'
                                }}
                                required
                            />
                            <input
                                type="password"
                                placeholder="Password"
                                className="input"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{
                                    padding: '1rem',
                                    fontSize: '1.1rem',
                                    border: '1px solid #dddfe2',
                                    borderRadius: '8px'
                                }}
                                required
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className="login-submit"
                                style={{
                                    background: '#1877f2',
                                    color: 'white',
                                    border: 'none',
                                    padding: '1rem',
                                    fontSize: '1.25rem',
                                    fontWeight: 700,
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s',
                                    marginTop: '0.5rem',
                                    opacity: loading ? 0.7 : 1
                                }}
                            >
                                {loading ? 'Logging in...' : 'Log In'}
                            </button>

                            <p style={{ textAlign: 'center', color: '#606770', fontSize: '0.85rem', lineHeight: 1.5, marginTop: '0.5rem' }}>
                                Use your Arjun Glass House account to access the workspace.
                            </p>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
