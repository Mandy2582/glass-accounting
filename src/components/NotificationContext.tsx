'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppNotification } from '@/types';
import { evaluateNotifications } from '@/lib/notificationEngine';

interface NotificationContextType {
    notifications: AppNotification[];
    unreadCount: number;
    toasts: AppNotification[];
    removeToast: (id: string) => void;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [toasts, setToasts] = useState<AppNotification[]>([]);
    const [readIds, setReadIds] = useState<string[]>(() => {
        if (typeof window === 'undefined') return [];

        const stored = localStorage.getItem('agh_read_notifications');
        if (!stored) return [];

        try {
            return JSON.parse(stored);
        } catch (error) {
            console.error('Error parsing stored read notifications:', error);
            return [];
        }
    });

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const refreshNotifications = useCallback(async () => {
        const rawAlerts = await evaluateNotifications();
        
        // Load read IDs again to stay in sync
        const stored = localStorage.getItem('agh_read_notifications');
        let currentReadIds: string[] = [];
        if (stored) {
            try {
                currentReadIds = JSON.parse(stored);
            } catch {}
        }

        // Apply read status from stored IDs
        const processed = rawAlerts.map(alert => ({
            ...alert,
            read: currentReadIds.includes(alert.id)
        }));

        // Determine new alerts that should trigger toast notifications
        // We only toast unread alerts that are warnings or errors and haven't been shown in the current session
        const prevSessionToasts = sessionStorage.getItem('agh_shown_toasts');
        let shownToasts: string[] = [];
        if (prevSessionToasts) {
            try {
                shownToasts = JSON.parse(prevSessionToasts);
            } catch {}
        }

        const newToasts: AppNotification[] = [];
        processed.forEach(alert => {
            if (!alert.read && !shownToasts.includes(alert.id) && (alert.severity === 'error' || alert.severity === 'warning')) {
                if (newToasts.length < 3) newToasts.push(alert);
                shownToasts.push(alert.id);
            }
        });

        if (newToasts.length > 0) {
            sessionStorage.setItem('agh_shown_toasts', JSON.stringify(shownToasts));
            setToasts(prev => [...prev, ...newToasts]);
            
            // Automatically clear toasts after 6 seconds
            newToasts.forEach(t => {
                setTimeout(() => {
                    removeToast(t.id);
                }, 6000);
            });
        }

        setNotifications(processed);
    }, [removeToast]);

    useEffect(() => {
        // Initial load
        queueMicrotask(() => {
            void refreshNotifications();
        });

        // Check every 60 seconds
        const interval = setInterval(refreshNotifications, 60000);
        return () => clearInterval(interval);
    }, [refreshNotifications]);

    const markAsRead = (id: string) => {
        const updatedRead = [...readIds];
        if (!updatedRead.includes(id)) {
            updatedRead.push(id);
            setReadIds(updatedRead);
            localStorage.setItem('agh_read_notifications', JSON.stringify(updatedRead));
        }

        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    };

    const markAllAsRead = () => {
        const allIds = notifications.map(n => n.id);
        setReadIds(allIds);
        localStorage.setItem('agh_read_notifications', JSON.stringify(allIds));
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            toasts,
            removeToast,
            markAsRead,
            markAllAsRead,
            refresh: refreshNotifications
        }}>
            {children}
            
            {/* Screen Toasts / Popups rendering */}
            <div style={{
                position: 'fixed',
                top: '20px',
                right: '20px',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                pointerEvents: 'none'
            }}>
                {toasts.map(toast => (
                    <div 
                        key={toast.id} 
                        style={{
                            pointerEvents: 'auto',
                            width: '320px',
                            padding: '1rem',
                            borderRadius: '12px',
                            background: 'var(--color-surface)',
                            backdropFilter: 'blur(25px) saturate(180%)',
                            border: toast.severity === 'error' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(234, 179, 8, 0.4)',
                            borderLeft: toast.severity === 'error' ? '6px solid #ef4444' : '6px solid #eab308',
                            boxShadow: 'var(--shadow-lg)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.25rem',
                            animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
                            cursor: 'pointer'
                        }}
                        onClick={() => {
                            markAsRead(toast.id);
                            removeToast(toast.id);
                            if (toast.link) {
                                window.location.href = toast.link;
                            }
                        }}
                    >
                        <style dangerouslySetInnerHTML={{ __html: `
                            @keyframes slideIn {
                                from {
                                    opacity: 0;
                                    transform: translateX(100%) scale(0.9);
                                }
                                to {
                                    opacity: 1;
                                    transform: translateX(0) scale(1);
                                }
                            }
                        `}} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <span style={{ 
                                fontWeight: 700, 
                                fontSize: '0.85rem',
                                color: toast.severity === 'error' ? '#ef4444' : '#eab308'
                            }}>
                                {toast.title}
                            </span>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeToast(toast.id);
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--color-text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    padding: '0 2px'
                                }}
                            >
                                ✕
                            </button>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-main)', margin: 0, lineHeight: 1.4 }}>
                            {toast.message}
                        </p>
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', alignSelf: 'flex-end', marginTop: '4px' }}>
                            Click to review
                        </span>
                    </div>
                ))}
            </div>
        </NotificationContext.Provider>
    );
}

export function useNotifications() {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
}
