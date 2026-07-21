'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppNotification } from '@/types';
import { evaluateNotifications } from '@/lib/notificationEngine';
import { supabase } from '@/lib/supabase';

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

// order_approval alerts represent a WhatsApp/email order still waiting on a
// staff decision -- marking one "read" must not hide it, or a real pending
// order could get silently lost from the queue. It only stops appearing once
// the order is actually approved or rejected, which removes it from the
// underlying data the notification is computed from. Every other type is a
// point-in-time nudge (low stock, an aging order, an overdue invoice) that's
// fine to dismiss for good once acknowledged.
function isDismissible(type: AppNotification['type']): boolean {
    return type !== 'order_approval';
}

function loadReadIds(): string[] {
    if (typeof window === 'undefined') return [];

    const stored = localStorage.getItem('agh_read_notifications');
    if (!stored) return [];

    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('Error parsing read notifications:', error);
        return [];
    }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [toasts, setToasts] = useState<AppNotification[]>([]);
    const [readIds, setReadIds] = useState<string[]>(() => loadReadIds());
    const refreshInFlightRef = useRef(false);
    const pendingRefreshRef = useRef(false);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const refreshNotifications = useCallback(async () => {
        if (refreshInFlightRef.current) {
            pendingRefreshRef.current = true;
            return;
        }

        refreshInFlightRef.current = true;

        try {
            const rawAlerts = await evaluateNotifications();

            // Reload from storage to stay in sync across tabs/sessions.
            const currentReadIds = loadReadIds();

            // A dismissed notification is hidden from the panel entirely rather
            // than left behind grayed-out -- except order_approval alerts, which
            // always show while the order is still pending a decision (see
            // isDismissible above).
            const processed = rawAlerts.filter(alert => !isDismissible(alert.type) || !currentReadIds.includes(alert.id));

            // Determine new alerts that should trigger toast notifications
            // We only toast alerts that are warnings or errors and haven't been shown in the current session
            const prevSessionToasts = sessionStorage.getItem('agh_shown_toasts');
            let shownToasts: string[] = [];
            if (prevSessionToasts) {
                try {
                    shownToasts = JSON.parse(prevSessionToasts);
                } catch {}
            }

            const newToasts: AppNotification[] = [];
            processed.forEach(alert => {
                if (!shownToasts.includes(alert.id) && (alert.severity === 'error' || alert.severity === 'warning')) {
                    if (newToasts.length < 3) newToasts.push(alert);
                    shownToasts.push(alert.id);
                }
            });

            if (newToasts.length > 0) {
                sessionStorage.setItem('agh_shown_toasts', JSON.stringify(shownToasts));
                setToasts(prev => [...prev, ...newToasts]);
                
                // Automatically clear toasts after 10 seconds
                newToasts.forEach(t => {
                    setTimeout(() => {
                        removeToast(t.id);
                    }, 10000);
                });
            }

            setNotifications(processed);
        } catch (error) {
            console.error('Failed to refresh notifications:', error);
        } finally {
            refreshInFlightRef.current = false;
            if (pendingRefreshRef.current) {
                pendingRefreshRef.current = false;
                window.setTimeout(() => {
                    void refreshNotifications();
                }, 0);
            }
        }
    }, [removeToast]);

    useEffect(() => {
        // Initial load
        queueMicrotask(() => {
            void refreshNotifications();
        });

        // Check frequently enough for server-created WhatsApp/email orders to
        // appear without a manual refresh. Realtime below is faster when
        // enabled; this is the dependable fallback.
        const interval = setInterval(refreshNotifications, 15000);
        const refreshFromEvent = () => {
            void refreshNotifications();
        };
        const refreshOnVisible = () => {
            if (!document.hidden) void refreshNotifications();
        };

        window.addEventListener('agh_notifications_refresh', refreshFromEvent);
        window.addEventListener('focus', refreshFromEvent);
        document.addEventListener('visibilitychange', refreshOnVisible);

        const ordersChannel = supabase
            .channel('agh-notifications-orders')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => {
                    void refreshNotifications();
                },
            )
            .subscribe();

        return () => {
            clearInterval(interval);
            window.removeEventListener('agh_notifications_refresh', refreshFromEvent);
            window.removeEventListener('focus', refreshFromEvent);
            document.removeEventListener('visibilitychange', refreshOnVisible);
            void supabase.removeChannel(ordersChannel);
        };
    }, [refreshNotifications]);

    const markAsRead = (id: string) => {
        const target = notifications.find(n => n.id === id);
        if (target && !isDismissible(target.type)) return;

        if (!readIds.includes(id)) {
            const updated = [...readIds, id];
            setReadIds(updated);
            localStorage.setItem('agh_read_notifications', JSON.stringify(updated));
        }

        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const markAllAsRead = () => {
        const dismissibleIds = notifications.filter(n => isDismissible(n.type)).map(n => n.id);
        const updated = Array.from(new Set([...readIds, ...dismissibleIds]));
        setReadIds(updated);
        localStorage.setItem('agh_read_notifications', JSON.stringify(updated));
        setNotifications(prev => prev.filter(n => !isDismissible(n.type)));
    };

    const unreadCount = notifications.length;

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
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-primary)', alignSelf: 'flex-end', marginTop: '4px', fontWeight: 700 }}>
                            {toast.actionLabel || 'Review'}
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
