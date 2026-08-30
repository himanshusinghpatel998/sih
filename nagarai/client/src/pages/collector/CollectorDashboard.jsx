import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Radio, MapPin, Link2, CheckCircle2, Trash2, Star, Printer, ShieldCheck,
  Handshake, ThumbsUp, Gift, Truck, ShoppingCart, Globe2, HeartPulse, BarChart3,
  ShieldAlert, RefreshCw, Trophy, LayoutDashboard, Package, Leaf, User, Clock,
  Building2, Siren, Award, KeyRound, HardHat, Lock, Recycle, ClipboardList,
  Settings, ChevronDown, ChevronUp, GripVertical,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Sidebar from '../../components/layout/Sidebar';
import Topbar from '../../components/layout/Topbar';
import StatusBadge from '../../components/ui/StatusBadge';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import TabTransition from '../../components/ui/TabTransition';
import { cn } from '../../lib/utils';
import { fmtDate, getInitials } from '../../utils/helpers';
import {
  getComplaints, updateComplaintStatus, getDashboardStats, changePassword, getUserById,
  getRewards, getStoreItems, redeemStoreItem, getOrders, getOrderById, updateOrderStatus,
  assignOrderApi, updateUser, completeComplaintApi, getIotBinData,
} from '../../services/api';

// Trimmed to the collector's actual field-work tabs. My Redemptions / History /
// Account Settings moved behind the top-right profile menu instead of eating
// sidebar space — they're still full pages, just reached differently.
const NAV_ITEMS = [
  { id: 'sec-dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'sec-iot', label: 'IoT Bins', icon: <Radio className="h-4 w-4" /> },
  { id: 'sec-store-orders', label: 'Manage Orders', icon: <Package className="h-4 w-4" /> },
  { id: 'sec-store', label: 'Eco Store', icon: <ShoppingCart className="h-4 w-4" /> },
];

// Topbar title needs labels for every section, including the ones reached
// via the profile menu rather than the sidebar.
const SECTION_LABELS = {
  'sec-dashboard': 'Dashboard',
  'sec-iot': 'IoT Bins',
  'sec-store-orders': 'Manage Orders',
  'sec-store': 'Eco Store',
  'sec-history': 'Resolved History',
  'sec-my-orders': 'My Redemptions',
  'sec-profile': 'Account Settings',
};

// Hoisted out of the JSX so the relocated AwarenessWidget can reuse it —
// content unchanged from the original inline array.
const AWARENESS_CARDS = [
  { Icon: Globe2, title: 'Environmental impact', text: 'Proper waste collection prevents soil and water contamination.' },
  { Icon: HeartPulse, title: 'Public health protection', text: 'Unmanaged waste attracts pests and spreads diseases.' },
  { Icon: BarChart3, title: 'SDG contribution', text: 'Your work directly contributes to UN Sustainable Development Goals.' },
  { Icon: ShieldAlert, title: 'Safety first', text: 'Always wear protective gloves and masks when handling waste.' },
  { Icon: RefreshCw, title: 'Segregation matters', text: 'Separate wet, dry, and hazardous waste at the point of collection.' },
  { Icon: Trophy, title: 'Your impact matters', text: 'Every complaint you resolve is a cleaner, safer campus.' },
];

const FIELD = 'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none ring-brand-400 focus:ring-2';
const LABEL = 'mb-1 block text-xs font-medium text-muted-foreground';
function Field({ label, required, children }) { return <div><label className={LABEL}>{label} {required && <span className="text-danger-500">*</span>}</label>{children}</div>; }
function Th({ children }) { return <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</th>; }
function Td({ children, className }) { return <td className={`px-3 py-2 text-sm ${className || ''}`}>{children}</td>; }
function EmptyState({ icon: Icon, title, desc }) {
  return <div className="flex flex-col items-center gap-2 py-12 text-center"><Icon className="h-10 w-10 text-muted-foreground" /><p className="text-sm font-medium text-foreground">{title}</p><p className="text-xs text-muted-foreground">{desc}</p></div>;
}
const ORDER_STEPS = ['pending', 'approved', 'ready_for_pickup', 'delivered'];

// Top-right profile icon — clicking it reveals My Redemptions / History /
// Account Settings instead of those living as permanent sidebar tabs.
function ProfileMenu({ name, email, points, onNavigate }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const go = (section) => { onNavigate(section); setIsOpen(false); };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((o) => !o)}
        aria-label="Profile menu"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/15 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-500/25 dark:text-brand-300"
      >
        {getInitials(name)}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 z-30 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                {getInitials(name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{name}</p>
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              </div>
            </div>
            <div className="px-4 py-2.5">
              <Badge variant="warning"><Star className="h-3 w-3" /> {points} pts</Badge>
            </div>
            <div className="space-y-0.5 p-2 pt-0">
              <button onClick={() => go('sec-my-orders')} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted">
                <Gift className="h-4 w-4 text-muted-foreground" /> My Redemptions
              </button>
              <button onClick={() => go('sec-history')} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> History
              </button>
              <button onClick={() => go('sec-profile')} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted">
                <Settings className="h-4 w-4 text-muted-foreground" /> Account Settings
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Compact "back to the main flow" link for the pages reached via the profile
// menu (My Redemptions / History / Account Settings no longer sit in the sidebar).
function BackToDashboard({ onNavigate }) {
  return (
    <button onClick={() => onNavigate('sec-dashboard')} className="mb-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
      <ChevronDown className="h-4 w-4 rotate-90" /> Back to Dashboard
    </button>
  );
}

// Awareness cards, relocated from their own tab to a small movable widget
// anchored at the end of the Eco Store page — drag it out of the way, or
// collapse it. Same cards, same content — just a different home.
function AwarenessWidget({ collapsed, onToggleCollapsed }) {
  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0.08}
      className="mx-auto mt-8 w-full max-w-4xl cursor-default rounded-xl border border-border bg-card shadow-sm"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
        <Leaf className="h-4 w-4 shrink-0 text-brand-500" />
        <p className="flex-1 text-sm font-semibold text-foreground">Waste management importance</p>
        <button onClick={onToggleCollapsed} className="text-muted-foreground hover:text-foreground">
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>
      {!collapsed && (
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {AWARENESS_CARDS.map((c, i) => (
            <Card key={i}><CardContent className="space-y-2 pt-5"><c.Icon className="h-7 w-7 text-brand-500" /><h3 className="font-semibold text-foreground">{c.title}</h3><p className="text-sm text-muted-foreground">{c.text}</p></CardContent></Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export default function CollectorDashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [section, setSection] = useState('sec-dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [awarenessCollapsed, setAwarenessCollapsed] = useState(false);

  const [stats, setStats] = useState({ total: 0, pending: 0, progress: 0, done: 0 });
  const [openComplaints, setOpenComplaints] = useState([]);
  const [dashFilter, setDashFilter] = useState('');
  const [resolved, setResolved] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [activeId, setActiveId] = useState('');
  const [modalStatus, setModalStatus] = useState('in-progress');
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const [profile, setProfile] = useState(null);
  const [cpOld, setCpOld] = useState(''); const [cpNew, setCpNew] = useState(''); const [cpConfirm, setCpConfirm] = useState('');
  const [upName, setUpName] = useState('');

  const [completionFile, setCompletionFile] = useState(null);
  const [completionPreview, setCompletionPreview] = useState(null);
  const [isCompleting, setIsCompleting] = useState(false);

  const [storeItems, setStoreItems] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [rewardHistory, setRewardHistory] = useState([]);
  const [rewardTotal, setRewardTotal] = useState(0);

  const [storeOrders, setStoreOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [isOrderLoading, setIsOrderLoading] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [orderCache, setOrderCache] = useState({});

  const [binData, setBinData] = useState([]);

  const loadStats = useCallback(async () => { try { setStats((await getDashboardStats()).data); } catch {} }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await getComplaints(dashFilter ? { status: dashFilter } : {});
      const open = dashFilter ? res.data : res.data.filter((c) => c.status !== 'completed' && c.status !== 'rejected');
      const sorted = [...open].sort((a, b) => {
        if (a.type === 'iot' && b.type !== 'iot') return -1;
        if (a.type !== 'iot' && b.type === 'iot') return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      setOpenComplaints(sorted);
    } catch {}
  }, [dashFilter]);

  const loadHistory = useCallback(async () => { try { setResolved((await getComplaints({ status: 'completed' })).data); } catch {} }, []);
  const loadProfile = useCallback(async () => {
    try { const res = await getUserById(user._id); setProfile(res.data); setUpName(res.data.name || ''); setRewardTotal(res.data.rewardPoints || 0); } catch {}
  }, [user._id]);
  const loadStoreItems = useCallback(async () => { try { setStoreItems((await getStoreItems()).data); } catch {} }, []);
  const loadMyOrders = useCallback(async () => { try { setMyOrders((await getOrders({ user: user._id })).data); } catch {} }, [user._id]);
  const loadRewardHistory = useCallback(async () => { try { setRewardHistory((await getRewards({ user: user._id })).data); } catch {} }, [user._id]);
  const loadStoreOrders = useCallback(async () => {
    try { const params = {}; if (orderFilter) params.status = orderFilter; setStoreOrders((await getOrders(params)).data); } catch {}
  }, [orderFilter]);
  const loadBinData = useCallback(async () => { try { setBinData((await getIotBinData()).data); } catch {} }, []);

  useEffect(() => {
    loadStats(); loadDashboard(); loadHistory(); loadProfile(); loadStoreOrders();
    loadStoreItems(); loadMyOrders(); loadRewardHistory(); loadBinData();
  }, [loadStats, loadDashboard, loadHistory, loadProfile, loadStoreOrders, loadStoreItems, loadMyOrders, loadRewardHistory, loadBinData]);

  const handleRedeem = async (itemId) => {
    try {
      const res = await redeemStoreItem(itemId);
      toast.success(`Item redeemed! Order ${res.data.order.orderId} created`);
      loadStoreItems(); loadMyOrders(); loadProfile(); loadRewardHistory(); loadStoreOrders();
    } catch (err) { toast.error(err.response?.data?.message || 'Error redeeming item'); }
  };

  useEffect(() => {
    const interval = setInterval(() => { loadStats(); loadDashboard(); loadBinData(); }, 5000);
    return () => clearInterval(interval);
  }, [loadStats, loadDashboard, loadBinData]);

  useEffect(() => {
    const newIot = openComplaints.find((c) => c.type === 'iot' && c.status === 'pending');
    if (newIot) {
      const lastAlertId = sessionStorage.getItem('last_iot_alert');
      if (lastAlertId !== newIot.complaintId) {
        toast.warning(`Dustbin full: IoT alert in Block ${newIot.block}`);
        sessionStorage.setItem('last_iot_alert', newIot.complaintId);
      }
    }
  }, [openComplaints]);

  const handleUpdateStatus = async () => {
    if (modalStatus === 'rejected' && !rejectionReason.trim()) return showToast('Please provide a reason for rejection.', 'warning');
    if (modalStatus === 'completed' && !completionFile) return showToast('Proof of completion (photo) is required.', 'warning');
    try {
      setIsCompleting(true);
      if (modalStatus === 'completed') {
        const formData = new FormData(); formData.append('image', completionFile);
        await completeComplaintApi(activeId, formData);
        toast.success(`Complaint ${activeId} marked completed with proof`);
      } else {
        const body = { status: modalStatus, note: `Status updated to ${modalStatus}` };
        if (modalStatus === 'rejected') body.rejectionReason = rejectionReason.trim();
        const res = await updateComplaintStatus(activeId, body);
        toast.success(`Complaint ${activeId}  "${modalStatus}"`);
        if (modalStatus === 'completed' && res.data.rewardGiven) toast('You earned 10 reward points!');
      }
      setModalOpen(false); setRejectionReason(''); setCompletionFile(null); setCompletionPreview(null);
      loadDashboard(); loadHistory(); loadStats(); loadProfile();
    } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
    finally { setIsCompleting(false); }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) { setCompletionFile(file); setCompletionPreview(URL.createObjectURL(file)); }
  };

  const handleOrderStatus = async (orderId, newStatus, code) => {
    try {
      const payload = { status: newStatus };
      if (newStatus === 'delivered') {
        if (!code) return showToast('Please enter the pickup code.', 'warning');
        payload.verificationCode = code;
      }
      const res = await updateOrderStatus(orderId, payload);
      if (newStatus === 'delivered') {
        setIsSuccess(true); toast.success('Order delivered');
        if (res.data.rewardGiven) setTimeout(() => toast('Delivery bonus: +20 reward points!'), 1200);
      } else toast.success(`Order ${orderId}  ${newStatus}`);
      setVerificationCode(''); loadStoreOrders(); loadProfile();
      setOrderCache((prev) => ({ ...prev, [orderId]: res.data })); setSelectedOrder(res.data);
    } catch (err) { toast.error(err.response?.data?.message || 'Error updating order'); }
  };

  const handleTakeOrder = async (orderId) => {
    try { await assignOrderApi(orderId); toast.success(`Order ${orderId} assigned to you`); loadStoreOrders(); }
    catch (err) { toast.error(err.response?.data?.message || 'Error taking order'); }
  };

  const handleViewDetails = async (id) => {
    if (orderCache[id]) { setSelectedOrder(orderCache[id]); setOrderModalOpen(true); setIsSuccess(false); return; }
    try {
      setIsOrderLoading(true); setIsSuccess(false);
      const res = await getOrderById(id);
      setSelectedOrder(res.data); setOrderCache((prev) => ({ ...prev, [id]: res.data })); setOrderModalOpen(true);
    } catch (err) { toast.error(err.response?.data?.message || 'Error fetching details'); }
    finally { setIsOrderLoading(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!cpOld || !cpNew || !cpConfirm) return toast.error('Please fill all fields.');
    if (cpNew !== cpConfirm) return toast.error('Passwords do not match.');
    if (cpNew.length < 6) return toast.warning('Password must be ≥ 6 characters.');
    try { await changePassword(user._id, { oldPassword: cpOld, newPassword: cpNew }); toast.success('Password updated'); setCpOld(''); setCpNew(''); setCpConfirm(''); }
    catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!upName.trim()) return toast.error('Name cannot be empty.');
    try { await updateUser(user._id, { name: upName.trim() }); toast.success('Profile updated'); loadProfile(); }
    catch (err) { toast.error(err.response?.data?.message || 'Error updating profile'); }
  };

  const currentLabel = SECTION_LABELS[section] || '';
  const filterTabs = [{ label: 'All open', filter: '' }, { label: 'Pending', filter: 'pending' }, { label: 'In progress', filter: 'in-progress' }, { label: 'Rejected', filter: 'rejected' }];
  const iotOpen = openComplaints.filter((c) => c.type === 'iot' && c.status === 'pending');

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar portalName="Collector Portal" icon={<Truck className="h-4 w-4" />} navItems={NAV_ITEMS} activeSection={section} onNavigate={setSection} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={currentLabel}
          onToggleMenu={() => setIsSidebarOpen(true)}
          rightSlot={
            <ProfileMenu
              name={profile?.name || user?.name}
              email={profile?.email || user?.email}
              points={rewardTotal}
              onNavigate={setSection}
            />
          }
        />
        <main className="flex-1 space-y-5 p-4 md:p-6">
        <TabTransition tabKey={section}>

          {section === 'sec-dashboard' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge><Building2 className="h-3 w-3" /> Block {user.block || '—'}</Badge>
                <span className="text-xs text-muted-foreground">Showing complaints for your block only</span>
              </div>

              {iotOpen.length > 0 && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 rounded-lg border border-danger-500/30 bg-danger-500/10 px-4 py-3">
                  <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger-500" /></span>
                  <ShieldAlert className="h-4 w-4 text-danger-600 dark:text-danger-400" />
                  <span className="text-sm font-semibold text-danger-600 dark:text-danger-400">IoT ALERT</span>
                  <span className="text-sm text-danger-600/80 dark:text-danger-400/80">{iotOpen.length} smart dustbin{iotOpen.length > 1 ? 's' : ''} require immediate collection</span>
                </motion.div>
              )}

              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <StatCard icon={ClipboardList} value={stats.total} label="Block complaints" />
                <StatCard icon={Clock} value={stats.pending} label="Pending" />
                <StatCard icon={RefreshCw} value={stats.progress} label="In progress" />
                <StatCard icon={Radio} value={openComplaints.filter((c) => c.type === 'iot').length} label="IoT alerts" />
                <StatCard icon={Star} value={rewardTotal} label="Your points" />
              </div>

              <div className="flex flex-wrap gap-2">
                {filterTabs.map((t) => (
                  <Button key={t.filter} size="sm" variant={dashFilter === t.filter ? 'default' : 'outline'} onClick={() => setDashFilter(t.filter)}>{t.label}</Button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {openComplaints.length === 0 ? (
                  <div className="sm:col-span-2 lg:col-span-3"><EmptyState icon={CheckCircle2} title="All clear!" desc="No open complaints in your block." /></div>
                ) : openComplaints.map((c) => (
                  <Card key={c.complaintId} className={cn(c.type === 'iot' && 'border-danger-500/40')}>
                    <div className="flex h-32 items-center justify-center bg-muted">
                      {c.image ? <img src={c.image} alt="" className="h-full w-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} /> : (c.type === 'iot' ? <Radio className="h-8 w-8 text-muted-foreground" /> : <Trash2 className="h-8 w-8 text-muted-foreground" />)}
                    </div>
                    <CardContent className="space-y-2 pt-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono-data text-sm font-medium text-foreground">{c.complaintId}</span>
                        {c.type === 'iot' && <Badge variant="danger"><Radio className="h-3 w-3" /> IoT</Badge>}
                      </div>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {c.location}</p>
                      {c.type === 'iot' && c.binId && <p className="flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400"><Link2 className="h-3 w-3" /> Bin {c.binId}</p>}
                      <p className={cn('text-sm', c.type === 'iot' ? 'font-semibold text-danger-600 dark:text-danger-400' : 'text-foreground')}>{c.description}</p>
                      <div className="flex items-center justify-between pt-1">
                        <StatusBadge status={c.status} />
                        <Button size="sm" onClick={() => { setActiveId(c.complaintId); setSelectedComplaint(c); setModalStatus('in-progress'); setModalOpen(true); }}>Update</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {section === 'sec-iot' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Smart dustbin status</h2>
                <p className="text-sm text-muted-foreground">Live sensor readings — auto-refreshes every 5 seconds.</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <StatCard icon={Radio} value={binData.length} label="Total bins" />
                <StatCard icon={Siren} value={binData.filter((b) => b.level >= 80).length} label="Needs collection" />
                <StatCard icon={CheckCircle2} value={binData.filter((b) => b.level < 80).length} label="Normal" />
              </div>
              {binData.length === 0 ? (
                <Card><CardContent className="pt-5"><EmptyState icon={Radio} title="No bin data yet" desc="Waiting for smart dustbins to send sensor data." /></CardContent></Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {binData.map((bin) => {
                    const isAlert = bin.level >= 80;
                    const barTone = bin.level >= 90 ? 'bg-danger-500' : bin.level >= 80 ? 'bg-signal-600' : bin.level >= 50 ? 'bg-signal-400' : 'bg-success-500';
                    return (
                      <Card key={bin.binId} className={cn(isAlert && 'border-danger-500/40')}>
                        <CardContent className="space-y-2 pt-5">
                          <div className="flex items-start justify-between">
                            <div><p className="flex items-center gap-1.5 font-semibold text-foreground"><Trash2 className="h-3.5 w-3.5" /> {bin.binId}</p><p className="text-xs text-muted-foreground">Block {bin.block}</p></div>
                            {isAlert && <Badge variant="danger">Needed</Badge>}
                          </div>
                          <div>
                            <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Fill level</span><span className="font-semibold text-foreground">{bin.level}%</span></div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-all', barTone)} style={{ width: `${bin.level}%` }} /></div>
                          </div>
                          {bin.lastUpdated && <p className="text-right text-[10px] text-muted-foreground">{fmtDate(bin.lastUpdated)}</p>}
                          {isAlert && <p className="rounded-lg bg-danger-500/10 py-1.5 text-center text-xs font-semibold text-danger-600 dark:text-danger-400">Immediate collection required</p>}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {section === 'sec-history' && (
            <div className="space-y-4">
              <BackToDashboard onNavigate={setSection} />
              <h2 className="text-lg font-semibold text-foreground">Resolved complaints</h2>
              <StatCard icon={Award} value={resolved.length} label="Total resolved" />
              <Card>
                <CardContent className="overflow-x-auto pt-5">
                  <table className="w-full">
                    <thead><tr><Th>ID</Th><Th>Photo</Th><Th>Location</Th><Th>Waste type</Th><Th>Date</Th><Th>Status</Th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {resolved.length === 0 ? <tr><td colSpan={6}><EmptyState icon={CheckCircle2} title="No resolved complaints" desc="Completed tasks will appear here." /></td></tr> : resolved.map((c) => (
                        <tr key={c.complaintId}>
                          <Td className="font-mono-data font-medium text-success-600 dark:text-success-400">{c.complaintId}</Td>
                          <Td>{(c.completionImage || c.image) ? <img src={c.completionImage || c.image} alt="" className="h-10 w-10 rounded-md object-cover" onError={(e) => { e.target.style.display = 'none'; }} /> : '—'}</Td>
                          <Td>{c.location}</Td><Td className="text-muted-foreground">{c.wasteType}</Td>
                          <Td className="text-muted-foreground">{fmtDate(c.createdAt)}</Td><Td><StatusBadge status={c.status} /></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {section === 'sec-store-orders' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Store orders</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard icon={Package} value={storeOrders.length} label="Total orders" />
                <StatCard icon={Clock} value={storeOrders.filter((o) => o.status === 'pending').length} label="Pending" />
                <StatCard icon={ThumbsUp} value={storeOrders.filter((o) => o.status === 'approved').length} label="Approved" />
                <StatCard icon={CheckCircle2} value={storeOrders.filter((o) => o.status === 'delivered').length} label="Delivered" />
              </div>
              <div className="flex flex-wrap gap-2">
                {[{ label: 'All', filter: '' }, { label: 'Pending', filter: 'pending' }, { label: 'Approved', filter: 'approved' }, { label: 'Delivered', filter: 'delivered' }].map((t) => (
                  <Button key={t.filter} size="sm" variant={orderFilter === t.filter ? 'default' : 'outline'} onClick={() => setOrderFilter(t.filter)}>{t.label}</Button>
                ))}
              </div>
              <Card>
                <CardContent className="overflow-x-auto pt-5">
                  <table className="w-full">
                    <thead><tr><Th>Order</Th><Th>Citizen</Th><Th>Points</Th><Th>Status</Th><Th>Action</Th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {storeOrders.length === 0 ? <tr><td colSpan={5}><EmptyState icon={ShoppingCart} title="No orders available" desc={`Active redemptions from Block ${user.block || 'your block'} appear here.`} /></td></tr> : storeOrders.map((o) => (
                        <tr key={o.orderId}>
                          <Td><button onClick={() => handleViewDetails(o.orderId)} className="font-mono-data font-medium text-brand-600 hover:underline dark:text-brand-400">{o.orderId}</button></Td>
                          <Td>{o.userName}<p className="text-xs text-muted-foreground">{o.user?.email || '—'}</p></Td>
                          <Td><Badge variant="warning"><Star className="h-3 w-3" /> {o.pointsUsed}</Badge></Td>
                          <Td>
                            <div className="flex items-center gap-1.5">
                              <StatusBadge status={o.status === 'ready_for_pickup' ? 'ready' : o.status === 'approved' ? 'in-progress' : o.status === 'delivered' ? 'completed' : 'pending'} />
                              {!o.assignedTo && <Badge variant="warning">New</Badge>}
                              {o.assignedTo === user._id && <Badge variant="success">Yours</Badge>}
                            </div>
                          </Td>
                          <Td>
                            {!o.assignedTo ? <Button size="sm" onClick={() => handleTakeOrder(o._id)}><Handshake className="h-3.5 w-3.5" /> Take order</Button>
                              : o.assignedTo === user._id ? (
                                <>
                                  {o.status === 'pending' && <Button size="sm" onClick={() => handleOrderStatus(o.orderId, 'approved')}><ThumbsUp className="h-3.5 w-3.5" /> Approve</Button>}
                                  {o.status === 'approved' && <Button size="sm" variant="signal" onClick={() => handleOrderStatus(o.orderId, 'ready_for_pickup')}><Gift className="h-3.5 w-3.5" /> Ready</Button>}
                                  {o.status === 'ready_for_pickup' && <Button size="sm" onClick={() => handleViewDetails(o.orderId)}><Truck className="h-3.5 w-3.5" /> Deliver</Button>}
                                  {o.status === 'delivered' && <span className="text-xs text-muted-foreground">Claimed</span>}
                                </>
                              ) : <span className="text-xs text-muted-foreground">Assigned to other</span>}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {section === 'sec-store' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Eco store</h2>
              <p className="text-sm text-muted-foreground">Redeem your points for eco-friendly products! You have <strong className="text-success-600 dark:text-success-400">{rewardTotal} pts</strong>.</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {storeItems.length === 0 ? <div className="sm:col-span-2 lg:col-span-3"><EmptyState icon={ShoppingCart} title="Store is empty" desc="No items available right now." /></div> : storeItems.map((item) => (
                  <Card key={item._id} className="overflow-hidden">
                    <div className="relative h-36 bg-muted">
                      <img src={item.image} alt={item.name} loading="lazy" className="h-full w-full object-cover" onError={(e) => { e.target.src = 'https://via.placeholder.com/200'; }} />
                      <Badge variant="success" className="absolute right-2 top-2"><Recycle className="h-3 w-3" /> Eco</Badge>
                    </div>
                    <CardContent className="space-y-2 pt-4">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <Badge variant="muted">{item.category || 'other'}</Badge>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                      <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-1 font-semibold text-foreground"><Star className="h-3.5 w-3.5" /> {item.pointsRequired} pts</span><span className="text-xs text-muted-foreground">{item.stock > 0 ? `${item.stock} left` : 'Out of stock'}</span></div>
                      <Button size="sm" className="w-full" disabled={rewardTotal < item.pointsRequired || item.stock <= 0} onClick={() => handleRedeem(item._id)}>
                        {item.stock <= 0 ? 'Out of stock' : rewardTotal < item.pointsRequired ? `Need ${item.pointsRequired - rewardTotal} more` : 'Redeem'}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <AwarenessWidget collapsed={awarenessCollapsed} onToggleCollapsed={() => setAwarenessCollapsed((c) => !c)} />
            </div>
          )}

          {section === 'sec-my-orders' && (
            <div className="space-y-4">
              <BackToDashboard onNavigate={setSection} />
              <h2 className="text-lg font-semibold text-foreground">My redemptions & reward history</h2>
              <div className="grid grid-cols-3 gap-4">
                <StatCard icon={Star} value={rewardTotal} label="Available points" />
                <StatCard icon={ShoppingCart} value={myOrders.length} label="Total redemptions" />
                <StatCard icon={Gift} value={myOrders.filter((o) => o.status === 'ready_for_pickup').length} label="Ready" />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Recent points earned</CardTitle></CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr><Th>Activity</Th><Th>Points</Th><Th>Date</Th></tr></thead>
                      <tbody className="divide-y divide-border">
                        {rewardHistory.length === 0 ? <tr><Td className="text-muted-foreground">No rewards yet.</Td></tr> : rewardHistory.slice(0, 10).map((r, i) => (
                          <tr key={i}><Td>{r.activity}</Td><Td className="font-semibold text-success-600 dark:text-success-400">+{r.points}</Td><Td className="text-muted-foreground">{fmtDate(r.date)}</Td></tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">My redemption orders</h3>
                  {myOrders.length === 0 ? <Card><CardContent className="pt-5 text-center text-sm text-muted-foreground">No items redeemed yet.</CardContent></Card> : myOrders.map((o) => (
                    <Card key={o.orderId}>
                      <CardContent className="space-y-1.5 pt-4">
                        <div className="flex justify-between"><span className="font-mono-data font-medium text-brand-600 dark:text-brand-400">{o.orderId}</span><span className="text-xs text-muted-foreground">{fmtDate(o.createdAt)}</span></div>
                        <p className="font-medium text-foreground">{o.itemName}</p>
                        <div className="space-y-0.5 text-xs text-muted-foreground">
                          <p className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {o.pickupLocation || 'Admin Office'}</p>
                          {o.pickupCode && <p className="flex items-center gap-1"><KeyRound className="h-3 w-3" /> <strong className="text-foreground">{o.pickupCode}</strong></p>}
                        </div>
                        <StatusBadge status={o.status === 'ready_for_pickup' ? 'ready' : o.status === 'approved' ? 'in-progress' : o.status === 'delivered' ? 'completed' : 'pending'} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === 'sec-profile' && (
            <div className="max-w-lg space-y-5">
              <BackToDashboard onNavigate={setSection} />
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-white">{getInitials(profile?.name)}</div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{profile?.name || user?.name}</h3>
                  <p className="text-sm text-muted-foreground">{profile?.email || user?.email}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5"><Badge><Truck className="h-3 w-3" /> Collector</Badge><Badge variant="default"><Building2 className="h-3 w-3" /> Block {profile?.block || 'All'}</Badge><Badge variant="warning"><Star className="h-3 w-3" /> {rewardTotal} pts</Badge></div>
                </div>
              </div>
              <Card>
                <CardHeader><CardTitle>Update profile</CardTitle></CardHeader>
                <CardContent><form onSubmit={handleUpdateProfile} className="space-y-3"><Field label="Full name"><input className={FIELD} value={upName} onChange={(e) => setUpName(e.target.value)} placeholder="Your name" /></Field><Button type="submit">Update name</Button></form></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
                <CardContent>
                  <form onSubmit={handleChangePassword} className="space-y-3">
                    <Field label="Current password"><input className={FIELD} type="password" value={cpOld} onChange={(e) => setCpOld(e.target.value)} /></Field>
                    <Field label="New password"><input className={FIELD} type="password" value={cpNew} onChange={(e) => setCpNew(e.target.value)} /></Field>
                    <Field label="Confirm new password"><input className={FIELD} type="password" value={cpConfirm} onChange={(e) => setCpConfirm(e.target.value)} /></Field>
                    <Button type="submit">Update password</Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
        </TabTransition>
        </main>
      </div>

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setRejectionReason(''); setCompletionFile(null); setCompletionPreview(null); }} title="Complaint details">
        {selectedComplaint && (
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Initial photo</p>
                {selectedComplaint.image ? <img src={selectedComplaint.image} alt="" className="h-32 w-full rounded-lg border border-border object-cover" onError={(e) => { e.target.parentElement.style.display = 'none'; }} /> : <div className="flex h-32 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">No image</div>}
              </div>
              {selectedComplaint.status === 'completed' && selectedComplaint.completionImage && (
                <div><p className="mb-1 text-xs text-success-600 dark:text-success-400">Completion proof</p><img src={selectedComplaint.completionImage} alt="" className="h-32 w-full rounded-lg border-2 border-success-500 object-cover" onError={(e) => { e.target.parentElement.style.display = 'none'; }} /></div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Complaint ID</p><p className="font-mono-data font-medium text-brand-600 dark:text-brand-400">{selectedComplaint.complaintId}</p></div>
              <div><p className="text-xs text-muted-foreground">Block</p><p className="font-medium text-foreground">Block {selectedComplaint.block}</p></div>
              <div><p className="text-xs text-muted-foreground">Location</p><p className="font-medium text-foreground">{selectedComplaint.location}</p></div>
              <div><p className="text-xs text-muted-foreground">Waste type</p><p className="font-medium text-foreground">{selectedComplaint.wasteType}</p></div>
              <div className="col-span-2"><p className="text-xs text-muted-foreground">Description</p><p className="text-foreground">{selectedComplaint.description}</p></div>
              <div><p className="text-xs text-muted-foreground">Date</p><p className="text-foreground">{fmtDate(selectedComplaint.createdAt)}</p></div>
              <div><p className="text-xs text-muted-foreground">Status</p><StatusBadge status={selectedComplaint.status} /></div>
            </div>

            {selectedComplaint.status === 'rejected' && selectedComplaint.rejectionReason && (
              <div className="rounded-lg border border-danger-500/20 bg-danger-500/5 p-3"><p className="mb-1 text-xs font-semibold uppercase text-danger-600 dark:text-danger-400">Rejection reason</p><p className="text-sm text-foreground">{selectedComplaint.rejectionReason}</p></div>
            )}

            {!['completed', 'rejected'].includes(selectedComplaint.status) && (
              <div className="space-y-3 border-t border-border pt-4">
                <Field label="Update status">
                  <select className={FIELD} value={modalStatus} onChange={(e) => setModalStatus(e.target.value)}>
                    <option value="in-progress">In progress</option>
                    <option value="completed">Completed</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </Field>
                {modalStatus === 'rejected' && (
                  <Field label="Rejection reason" required><textarea className={cn(FIELD, 'min-h-20 resize-y')} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="e.g. duplicate, already cleaned…" /></Field>
                )}
                {modalStatus === 'completed' && (
                  <Field label="Upload proof of completion" required>
                    <input type="file" accept="image/*" onChange={handleFileChange} className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white" />
                    {completionPreview && <img src={completionPreview} alt="" className="mt-2 max-h-40 rounded-lg border border-border" />}
                  </Field>
                )}
                <Button className="w-full" variant={modalStatus === 'rejected' ? 'danger' : 'default'} onClick={handleUpdateStatus} disabled={isCompleting || (modalStatus === 'completed' && !completionFile)}>
                  {isCompleting ? 'Processing…' : modalStatus === 'rejected' ? 'Reject complaint' : 'Save status'}
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={orderModalOpen} onClose={() => { setOrderModalOpen(false); setVerificationCode(''); setIsSuccess(false); }} title={isSuccess ? 'Delivery successful' : 'Order details'}>
        {isOrderLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading…</p>
        ) : isSuccess ? (
          <div className="space-y-4 p-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-500/10"><ShieldCheck className="h-7 w-7 text-success-500" /></div>
            <h2 className="text-lg font-bold text-foreground">Well done!</h2>
            <p className="text-sm text-muted-foreground">Order <strong className="text-foreground">{selectedOrder?.orderId}</strong> marked as delivered.</p>
            <div className="flex gap-2"><Button className="flex-1" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button><Button variant="outline" className="flex-1" onClick={() => setOrderModalOpen(false)}>Close</Button></div>
          </div>
        ) : selectedOrder ? (
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-1">{ORDER_STEPS.map((s, i) => <div key={s} className={cn('h-1.5 flex-1 rounded-full', i <= ORDER_STEPS.indexOf(selectedOrder.status) ? 'bg-brand-500' : 'bg-muted')} />)}</div>
            <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
              <Package className="h-8 w-8 text-brand-500" />
              <div><p className="text-xs text-muted-foreground">Item ordered</p><p className="font-bold text-foreground">{selectedOrder.itemName}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Customer</p><p className="font-medium text-foreground">{selectedOrder.user?.name || 'Unknown'}</p><p className="text-xs text-muted-foreground">{selectedOrder.user?.email || 'N/A'}</p></div>
              <div><p className="text-xs text-muted-foreground">Pickup location</p><p className="font-medium text-foreground">{selectedOrder.pickupLocation}</p></div>
              <div><p className="text-xs text-muted-foreground">Pickup time</p><p className="font-medium text-foreground">{selectedOrder.pickupTime}</p></div>
            </div>

            {selectedOrder.status === 'delivered' && (
              <div className="rounded-lg border border-border bg-muted p-3 text-center"><p className="text-xs text-muted-foreground">Verified pickup code</p><p className="font-mono-data text-xl font-bold text-foreground">{selectedOrder.pickupCode || 'VERIFIED'}</p></div>
            )}
            {selectedOrder.status === 'ready_for_pickup' && (
              <div className="rounded-lg border border-signal-500/30 bg-signal-500/10 p-3">
                <p className="text-sm font-semibold text-signal-600 dark:text-signal-400">Delivery verification required</p>
                <p className="mb-2 text-xs text-muted-foreground">Enter the citizen's pickup code.</p>
                <input className={cn(FIELD, 'text-center font-mono-data tracking-widest')} maxLength={6} value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.toUpperCase())} placeholder="X7K9P2" disabled={selectedOrder.failedAttempts >= 3} />
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {selectedOrder.status === 'ready_for_pickup' && <Button className="flex-1" disabled={selectedOrder.failedAttempts >= 3} onClick={() => handleOrderStatus(selectedOrder.orderId, 'delivered', verificationCode)}><Truck className="h-4 w-4" /> Confirm & deliver</Button>}
              {selectedOrder.status === 'approved' && <Button variant="signal" className="flex-1" onClick={() => handleOrderStatus(selectedOrder.orderId, 'ready_for_pickup')}><Gift className="h-4 w-4" /> Ready for pickup</Button>}
              {selectedOrder.status === 'pending' && <Button className="flex-1" onClick={() => handleOrderStatus(selectedOrder.orderId, 'approved')}><ThumbsUp className="h-4 w-4" /> Approve order</Button>}
              <Button variant="outline" className="flex-1" onClick={() => setOrderModalOpen(false)}>Close</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
