'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

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

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                throw error;
            }

            router.push('/');
            router.refresh(); // Refresh to update middleware state
        } catch (err: any) {
            console.error('Login error:', err);
            setError(err.message || 'Failed to login');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab)',
            backgroundSize: '400% 400%',
            animation: 'gradient 15s ease infinite',
            padding: '2rem'
        }}>
            <style jsx global>{`
                @keyframes gradient {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
            `}</style>
            <div style={{
                display: 'flex',
                maxWidth: '1000px',
                width: '100%',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '4rem'
            }}>
                {/* Left Side - Branding */}
                <div style={{ flex: '1 1 400px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div style={{
                            background: 'white',
                            padding: '16px',
                            borderRadius: '20px',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                            display: 'flex'
                        }}>
                            <img
                                src="/logo.png"
                                alt="Arjun Glass House Logo"
                                style={{ width: '64px', height: '64px' }}
                            />
                        </div>
                        <h1 style={{
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
                    <p style={{
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
                    <div style={{
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

                            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                                <a href="#" style={{ color: '#1877f2', fontSize: '0.9rem', textDecoration: 'none' }}>
                                    Forgot Password?
                                </a>
                            </div>

                            <div style={{ borderTop: '1px solid #dadde1', margin: '1.5rem 0' }}></div>

                            <div style={{ textAlign: 'center' }}>
                                <button type="button" style={{
                                    background: '#42b72a',
                                    color: 'white',
                                    border: 'none',
                                    padding: '0.75rem 1.5rem',
                                    fontSize: '1.1rem',
                                    fontWeight: 600,
                                    borderRadius: '8px',
                                    cursor: 'pointer'
                                }}>
                                    Create New Account
                                </button>
                            </div>
                        </form>
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: '#606770' }}>
                        <strong>Create a Page</strong> for a celebrity, brand or business.
                    </div>
                </div>
            </div>
        </div>
    );
}
