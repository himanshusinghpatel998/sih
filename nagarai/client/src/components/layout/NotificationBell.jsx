import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Inbox } from 'lucide-react';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../../services/api';
import NotificationItem from './NotificationItem';

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const fetchNotifications = async () => {
    try {
      const res = await getNotifications();
      setNotifications(res.data);
      return res.data;
    } catch (err) {
      return [];
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = async () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      const fresh = await fetchNotifications();
      if (fresh.filter((n) => !n.isRead).length > 0) {
        try {
          await markAllNotificationsRead();
          setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        } catch {}
      }
    }
  };

  const handleMarkRead = async (notification) => {
    if (notification.isRead) return;
    try {
      await markNotificationRead(notification._id);
      setNotifications((prev) => prev.map((n) => (n._id === notification._id ? { ...n, isRead: true } : n)));
    } catch {}
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={handleToggle} aria-label="Notifications" className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 z-30 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          >
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                {unreadCount > 0 && <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-600 dark:text-brand-400">{unreadCount} new</span>}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">Stay updated with your latest activities</p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <Inbox className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">No notifications yet</p>
                  <p className="text-xs text-muted-foreground">Your alerts and updates will appear here.</p>
                </div>
              ) : (
                notifications.map((n) => <NotificationItem key={n._id} notification={n} onClick={handleMarkRead} />)
              )}
            </div>
            <div className="border-t border-border px-4 py-2">
              <button onClick={() => setIsOpen(false)} className="w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground">
                Close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
