import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Camera, MapPin, Clock, CheckCircle2, XCircle, Search, Eye, Recycle, Trophy,
  ShoppingCart, ShoppingBag, Plus, Minus, Trash2, Copy, Star, Printer, Sparkles, Package, X,
  FileText, ClipboardList, Leaf, Waves, Utensils, Zap,
  Building2, HardHat, Mail, Gift, ChevronDown, ChevronUp, Settings, GripVertical,
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
  getComplaints, getComplaintById as fetchComplaint, submitComplaint, getRewards,
  addReward, changePassword, getUserById, getStoreItems, redeemStoreItem, getOrders, updateUser,
} from '../../services/api';

// Trimmed to the two things a citizen actually needs a persistent tab for.
// Profile / Orders / Rewards moved behind the top-right profile menu instead
// of eating sidebar space — they're still full pages, just reached differently.
const NAV_ITEMS = [
  { id: 'sec-report', label: 'Report & Track', icon: <Camera className="h-4 w-4" /> },
  { id: 'sec-scan', label: 'Quick Scan', icon: <Trash2 className="h-4 w-4" /> },
  { id: 'sec-store', label: 'Eco Store', icon: <ShoppingCart className="h-4 w-4" /> },
];

// Topbar title needs labels for every section, including the ones reached
// via the profile menu rather than the sidebar.
const SECTION_LABELS = {
  'sec-report': 'Report & Track',
  'sec-scan': 'Quick Scan',
  'sec-store': 'Eco Store',
  'sec-profile': 'Account Settings',
  'sec-orders': 'My Orders',
  'sec-reward': 'Rewards',
  'sec-history': 'Complaint History',
};

const AWARENESS_SLIDES = [
  { icon: Recycle, title: 'Reduce, Reuse, Recycle', text: 'The 3Rs are the foundation of sustainable waste management.', badge: 'SDG Goal 12' },
  { icon: Waves, title: 'Plastic Pollution Crisis', text: 'Over 8 million tonnes of plastic enter our oceans each year.', badge: 'SDG Goal 14' },
  { icon: Utensils, title: 'Food Waste Matters', text: 'Approximately 1/3 of all food produced globally is wasted.', badge: 'SDG Goal 2' },
  { icon: Zap, title: 'E-Waste Responsibility', text: 'Electronic waste contains hazardous materials like lead and mercury.', badge: 'Hazardous' },
  { icon: Trophy, title: 'Earn Rewards for Clean Campus', text: 'Every complaint and dustbin alert earns you reward points.', badge: 'Campus Initiative' },
];

// Hardcoded placeholder catalogue — shown whenever the store API returns no
// items, so the Eco Store never looks empty during a demo, and redeemable via
// a local simulation (see handleRedeem) since these aren't real DB records.
// TODO: drop this once real product data is served from Supabase.
// Icon tiles instead of photos — via.placeholder.com (the rest of the app's
// image-error fallback) has been flaky/returning 503s, and there's no real
// product photography for demo items yet.
const HARDCODED_STORE_ITEMS = [
  { _id: 'demo-tote-bag', name: 'Recycled Jute Tote Bag', category: 'Bags', description: 'Sturdy tote woven from recycled jute fibre — swap out single-use plastic bags for good.', icon: ShoppingBag, pointsRequired: 150, stock: 20 },
  { _id: 'demo-toothbrush', name: 'Bamboo Toothbrush (Pack of 4)', category: 'Personal Care', description: 'Biodegradable bamboo handles with BPA-free bristles. Compost the handle when you\'re done.', icon: Sparkles, pointsRequired: 80, stock: 35 },
  { _id: 'demo-notebook', name: 'Recycled Paper Notebook', category: 'Stationery', description: 'A5 notebook made from 100% post-consumer recycled paper.', icon: FileText, pointsRequired: 60, stock: 50 },
  { _id: 'demo-bottle', name: 'Steel Reusable Water Bottle', category: 'Drinkware', description: 'Insulated stainless steel bottle — keeps drinks cold for 24h, hot for 12h.', icon: Waves, pointsRequired: 200, stock: 15 },
  { _id: 'demo-compost-kit', name: 'Compost Starter Kit', category: 'Gardening', description: 'Everything you need to start composting food scraps on your balcony or in your room.', icon: Leaf, pointsRequired: 250, stock: 10 },
  { _id: 'demo-seed-paper', name: 'Seed Paper Pack (Plantable)', category: 'Stationery', description: 'Plantable paper embedded with wildflower seeds — write on it, then plant it.', icon: Recycle, pointsRequired: 40, stock: 60 },
];

const BLOCKS = ['A', 'B', 'C', 'D', 'E'];
const FIELD = 'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none ring-brand-400 focus:ring-2';
const LABEL = 'mb-1 block text-xs font-medium text-muted-foreground';
function Field({ label, children }) { return <div><label className={LABEL}>{label}</label>{children}</div>; }
function Th({ children }) { return <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</th>; }
function Td({ children, className }) { return <td className={`px-3 py-2 text-sm ${className || ''}`}>{children}</td>; }
// Store items either come from the real API (have `.image`) or the hardcoded
// demo catalogue (have `.icon` instead, since there's no real product photo).
function ProductThumb({ item, className, iconClassName = 'h-10 w-10' }) {
  if (item.icon) {
    return (
      <div className={cn('flex items-center justify-center bg-gradient-to-br from-brand-500/15 to-brand-700/10', className)}>
        <item.icon className={cn(iconClassName, 'text-brand-600 dark:text-brand-400')} strokeWidth={1.25} />
      </div>
    );
  }
  return (
    <img
      src={item.image}
      alt={item.name}
      loading="lazy"
      className={cn('object-cover', className)}
      onError={(e) => { e.target.src = 'https://via.placeholder.com/200'; }}
    />
  );
}

function EmptyState({ icon: Icon, title, desc }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <Icon className="h-10 w-10 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}

// Top-right profile icon — clicking it reveals My Orders / Rewards / Account
// Settings instead of those living as permanent sidebar tabs.
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
              <Badge variant="warning"><Trophy className="h-3 w-3" /> {points} pts</Badge>
            </div>
            <div className="space-y-0.5 p-2 pt-0">
              <button onClick={() => go('sec-orders')} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted">
                <Package className="h-4 w-4 text-muted-foreground" /> My Orders
              </button>
              <button onClick={() => go('sec-reward')} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted">
                <Trophy className="h-4 w-4 text-muted-foreground" /> Rewards
              </button>
              <button onClick={() => go('sec-history')} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted">
                <ClipboardList className="h-4 w-4 text-muted-foreground" /> Complaint History
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
// menu (Profile / Orders / Rewards no longer sit in the sidebar).
function BackToReport({ onNavigate }) {
  return (
    <button onClick={() => onNavigate('sec-report')} className="mb-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
      <ChevronDown className="h-4 w-4 rotate-90" /> Back to Report &amp; Track
    </button>
  );
}

// Awareness carousel, relocated from its own tab to a small movable widget
// anchored at the end of the page — drag it out of the way, or collapse it.
function AwarenessWidget({ slides, index, onNext, onPrev, onSelect, collapsed, onToggleCollapsed }) {
  const Icon = slides[index].icon;
  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0.08}
      className="mx-auto mt-8 w-full max-w-2xl cursor-default rounded-xl border border-border bg-card shadow-sm"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
        <Leaf className="h-4 w-4 shrink-0 text-brand-500" />
        <p className="flex-1 text-sm font-semibold text-foreground">Waste awareness</p>
        <button onClick={onToggleCollapsed} className="text-muted-foreground hover:text-foreground">
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>
      {!collapsed && (
        <div className="p-4">
          <div className="relative overflow-hidden rounded-lg">
            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3 }}
                className="flex flex-col items-center gap-2 rounded-lg bg-gradient-to-br from-brand-500/10 to-brand-700/5 p-6 text-center"
              >
                <Icon className="h-8 w-8 text-brand-600 dark:text-brand-400" strokeWidth={1.5} />
                <h3 className="text-base font-bold text-foreground">{slides[index].title}</h3>
                <p className="max-w-md text-xs text-muted-foreground">{slides[index].text}</p>
                <Badge>{slides[index].badge}</Badge>
              </motion.div>
            </AnimatePresence>
            <button onClick={onPrev} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-card/80 p-1.5 shadow hover:bg-card">‹</button>
            <button onClick={onNext} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-card/80 p-1.5 shadow hover:bg-card">›</button>
          </div>
          <div className="mt-3 flex justify-center gap-1.5">
            {slides.map((_, i) => (
              <button key={i} onClick={() => onSelect(i)} className={cn('h-1.5 rounded-full transition-all', index === i ? 'w-6 bg-brand-500' : 'w-1.5 bg-muted')} />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [section, setSection] = useState('sec-report');
  const [awarenessCollapsed, setAwarenessCollapsed] = useState(false);

  const [profile, setProfile] = useState(null);
  const [recentComplaints, setRecentComplaints] = useState([]);

  const [compLocation, setCompLocation] = useState('');
  const [compType, setCompType] = useState('');
  const [compDesc, setCompDesc] = useState('');
  const [compBlock, setCompBlock] = useState('');
  const [compImage, setCompImage] = useState(null);
  const [compPreview, setCompPreview] = useState(null);

  const [complaints, setComplaints] = useState([]);
  const [histFilter, setHistFilter] = useState('');

  const [trackResult, setTrackResult] = useState(null);
  const [trackNotFound, setTrackNotFound] = useState(false);
  const [trackingId, setTrackingId] = useState(null);
  const [reportFilter, setReportFilter] = useState('active');

  const [scanLocation, setScanLocation] = useState('');
  const [scanBlock, setScanBlock] = useState('');

  const [rewards, setRewards] = useState([]);
  const [rewardTotal, setRewardTotal] = useState(0);

  const [cpOld, setCpOld] = useState(''); const [cpNew, setCpNew] = useState(''); const [cpConfirm, setCpConfirm] = useState('');
  const [upName, setUpName] = useState('');
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [storeItems, setStoreItems] = useState([]);
  const [demoItems, setDemoItems] = useState(HARDCODED_STORE_ITEMS);
  const [demoOrders, setDemoOrders] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);

  const [receiptOrder, setReceiptOrder] = useState(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cart, setCart] = useState([]);
  const [cartModalOpen, setCartModalOpen] = useState(false);
  const [orderRatings, setOrderRatings] = useState({});
  const [isRedeeming, setIsRedeeming] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const res = await getUserById(user._id);
      setProfile(res.data); setUpName(res.data.name || '');
      setRecentComplaints((await getComplaints({ user: user._id })).data.slice(0, 5));
    } catch {}
  }, [user._id]);

  const loadHistory = useCallback(async () => {
    try {
      const params = { user: user._id };
      if (histFilter) params.status = histFilter;
      setComplaints((await getComplaints(params)).data);
    } catch {}
  }, [user._id, histFilter]);

  const loadRewards = useCallback(async () => {
    try {
      setRewards((await getRewards({ user: user._id })).data);
      setRewardTotal((await getUserById(user._id)).data.rewardPoints || 0);
    } catch {}
  }, [user._id]);

  const loadStore = async () => { try { setStoreItems((await getStoreItems()).data); } catch {} };
  const loadOrders = async () => {
    try { setIsOrdersLoading(true); setMyOrders((await getOrders()).data); } catch {} finally { setIsOrdersLoading(false); }
  };

  useEffect(() => { loadProfile(); loadHistory(); loadRewards(); loadStore(); loadOrders(); }, [loadProfile, loadHistory, loadRewards]);

  const slides = AWARENESS_SLIDES.length;
  const nextSlide = useCallback(() => setCarouselIdx((i) => (i + 1) % slides), [slides]);
  const prevSlide = useCallback(() => setCarouselIdx((i) => (i - 1 + slides) % slides), [slides]);
  useEffect(() => { const t = setInterval(nextSlide, 5000); return () => clearInterval(t); }, [nextSlide]);

  // Demo catalogue items (no real DB record yet — see HARDCODED_STORE_ITEMS)
  // are redeemed entirely client-side: deduct points, fabricate an order with
  // a pickup code, and skip the real API call that would 404 on a fake id.
  const handleDemoRedeem = (item) => {
    if (rewardTotal < item.pointsRequired) return toast.error(`Need ${item.pointsRequired - rewardTotal} more points to redeem this.`);
    if (item.stock <= 0) return toast.error('Item is out of stock.');
    const order = {
      _id: `demo-order-${Date.now()}`,
      orderId: `ORD-DEMO-${Date.now()}`,
      itemName: item.name,
      pointsUsed: item.pointsRequired,
      status: 'pending',
      pickupCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
      pickupLocation: 'Admin Office',
      pickupTime: '10 AM - 5 PM',
      createdAt: new Date().toISOString(),
    };
    setDemoItems((prev) => prev.map((d) => (d._id === item._id ? { ...d, stock: d.stock - 1 } : d)));
    setDemoOrders((prev) => [order, ...prev]);
    setRewardTotal((prev) => prev - item.pointsRequired);
    toast.success(`Item redeemed! Order ${order.orderId} created — ${rewardTotal - item.pointsRequired} pts remaining`);
  };

  const handleRedeem = async (itemId) => {
    if (isRedeeming) return;
    const demoItem = demoItems.find((d) => d._id === itemId);
    if (demoItem) return handleDemoRedeem(demoItem);
    setIsRedeeming(true);
    try {
      const res = await redeemStoreItem(itemId);
      toast.success(`Item redeemed! Order ${res.data.order.orderId} created — ${res.data.remainingPoints} pts remaining`);
      await Promise.all([loadStore(), loadOrders(), loadProfile(), loadRewards()]);
    } catch (err) { toast.error(err.response?.data?.message || 'Error redeeming item'); }
    finally { setIsRedeeming(false); }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) { setCompImage(null); setCompPreview(null); return; }
    if (file.size > 2 * 1024 * 1024) { toast.warning('Image must be under 2 MB.'); e.target.value = ''; return; }
    setCompImage(file);
    const reader = new FileReader();
    reader.onloadend = () => setCompPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleComplaint = async (e) => {
    e.preventDefault();
    if (!compLocation || !compType || !compDesc || !compBlock) return showToast('Please fill all fields including Block.', 'warning');
    try {
      const formData = new FormData();
      formData.append('location', compLocation); formData.append('wasteType', compType);
      formData.append('description', compDesc); formData.append('block', compBlock);
      if (compImage) formData.append('image', compImage);
      const res = await submitComplaint(formData);
      toast.success(`Complaint ${res.data.complaintId} submitted`);
      setCompLocation(''); setCompType(''); setCompDesc(''); setCompBlock(''); setCompImage(null); setCompPreview(null);
      loadProfile(); loadHistory();
    } catch (err) { toast.error(err.response?.data?.message || 'Error submitting'); }
  };

  const handleScan = async (e) => {
    e.preventDefault();
    if (!scanLocation || !scanBlock) return showToast('Please enter location and select block.', 'warning');
    try {
      const formData = new FormData();
      formData.append('location', scanLocation); formData.append('wasteType', 'Dustbin Overflow');
      formData.append('description', 'Dustbin full alert via Quick Scan.'); formData.append('type', 'scan'); formData.append('block', scanBlock);
      const res = await submitComplaint(formData);
      await addReward({ user: user._id, activity: 'Dustbin Full Alert (Scan)', points: 30 });
      toast.success(`Alert sent! ${res.data.complaintId} — +30 pts earned`);
      setScanLocation(''); setScanBlock(''); loadProfile(); loadRewards();
    } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  const closeTrack = () => { setTrackingId(null); setTrackResult(null); setTrackNotFound(false); };

  const handleTrack = async (complaintId) => {
    if (trackingId === complaintId) return closeTrack();
    setTrackingId(complaintId); setTrackResult(null); setTrackNotFound(false);
    if (!complaintId) return;
    try { setTrackResult((await fetchComplaint(complaintId.toUpperCase())).data); }
    catch { setTrackNotFound(true); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!cpOld || !cpNew || !cpConfirm) return toast.error('Please fill all fields.');
    if (cpNew !== cpConfirm) return toast.error('New passwords do not match.');
    if (cpNew.length < 6) return toast.warning('Password must be at least 6 characters.');
    try { await changePassword(user._id, { oldPassword: cpOld, newPassword: cpNew }); toast.success('Password updated'); setCpOld(''); setCpNew(''); setCpConfirm(''); }
    catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!upName.trim()) return toast.error('Name cannot be empty.');
    try { await updateUser(user._id, { name: upName.trim() }); toast.success('Profile updated'); loadProfile(); }
    catch (err) { toast.error(err.response?.data?.message || 'Error updating profile'); }
  };

  const handleViewComplaint = async (id) => {
    try { setSelectedDetail((await fetchComplaint(id)).data); setDetailModalOpen(true); }
    catch { toast.error('Error loading complaint details'); }
  };

  const currentLabel = SECTION_LABELS[section] || '';
  const REPORT_FILTERS = {
    active: (c) => c.status === 'pending' || c.status === 'in-progress',
    done: (c) => c.status === 'completed',
    removed: (c) => c.status === 'rejected',
  };
  const filteredComplaints = complaints.filter(REPORT_FILTERS[reportFilter] || REPORT_FILTERS.active);
  const storeStock = storeItems.length > 0 ? storeItems : demoItems;
  const allOrders = [...demoOrders, ...myOrders];
  const cartMap = {};
  cart.forEach((item) => { cartMap[item._id] = cartMap[item._id] ? { ...cartMap[item._id], qty: cartMap[item._id].qty + 1 } : { ...item, qty: 1 }; });
  const cartItems = Object.values(cartMap);
  const cartTotal = cartItems.reduce((sum, ci) => sum + ci.pointsRequired * ci.qty, 0);
  const canCheckout = cartTotal > 0 && rewardTotal >= cartTotal;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar portalName="Citizen Portal" icon={<Recycle className="h-4 w-4" />} navItems={NAV_ITEMS} activeSection={section} onNavigate={setSection} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={currentLabel}
          onToggleMenu={() => setIsSidebarOpen(true)}
          rightSlot={
            <ProfileMenu
              name={profile?.name || user?.name}
              email={profile?.email || user?.email}
              points={profile?.rewardPoints || 0}
              onNavigate={setSection}
            />
          }
        />
        <main className="flex-1 space-y-5 p-4 md:p-6">
        <TabTransition tabKey={section}>

          {section === 'sec-profile' && (
            <div className="space-y-5">
              <BackToReport onNavigate={setSection} />
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-white">{getInitials(profile?.name)}</div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">{profile?.name || user?.name}</h3>
                  <p className="text-sm text-muted-foreground">{profile?.email || user?.email}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="muted">{profile?.dept || 'General'}</Badge>
                    <Badge><ClipboardList className="h-3 w-3" /> {recentComplaints.length} complaints</Badge>
                    <Badge variant="warning"><Trophy className="h-3 w-3" /> {profile?.rewardPoints || 0} pts</Badge>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Recent complaints</CardTitle></CardHeader>
                  <CardContent>
                    {recentComplaints.length === 0 ? <EmptyState icon={Camera} title="No recent complaints" desc="Your filed complaints will appear here." /> : (
                      <div className="space-y-2">
                        {recentComplaints.map((c) => (
                          <div key={c.complaintId} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                            {c.image ? <img src={c.image} alt="" className="h-10 w-10 rounded-md object-cover" onError={(e) => { e.target.style.display = 'none'; }} /> : <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted"><Camera className="h-4 w-4 text-muted-foreground" /></div>}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">{c.complaintId}</p>
                              <p className="truncate text-xs text-muted-foreground">{c.location}</p>
                            </div>
                            <StatusBadge status={c.status} />
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                <div className="space-y-4">
                  <Card>
                    <CardHeader><CardTitle>Update profile</CardTitle></CardHeader>
                    <CardContent>
                      <form onSubmit={handleUpdateProfile} className="space-y-3">
                        <Field label="Full name"><input className={FIELD} value={upName} onChange={(e) => setUpName(e.target.value)} placeholder="Your name" /></Field>
                        <Button type="submit">Update name</Button>
                      </form>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
                    <CardContent>
                      <form onSubmit={handleChangePassword} className="space-y-3">
                        <Field label="Current password"><input className={FIELD} type="password" value={cpOld} onChange={(e) => setCpOld(e.target.value)} placeholder="Current password" /></Field>
                        <Field label="New password"><input className={FIELD} type="password" value={cpNew} onChange={(e) => setCpNew(e.target.value)} placeholder="New password" /></Field>
                        <Field label="Confirm new password"><input className={FIELD} type="password" value={cpConfirm} onChange={(e) => setCpConfirm(e.target.value)} placeholder="Repeat new password" /></Field>
                        <Button type="submit">Update password</Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {section === 'sec-report' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Report &amp; track</h2>
                <p className="text-sm text-muted-foreground">File a complaint, then track it below.</p>
              </div>

              <Card className="max-w-2xl">
                <CardHeader><CardTitle className="flex items-center gap-2"><Camera className="h-4 w-4" /> File a complaint</CardTitle></CardHeader>
                <CardContent>
                  <form onSubmit={handleComplaint} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Location"><input className={FIELD} placeholder="e.g. Block A Ground Floor" value={compLocation} onChange={(e) => setCompLocation(e.target.value)} /></Field>
                      <Field label="Block">
                        <select className={FIELD} value={compBlock} onChange={(e) => setCompBlock(e.target.value)}>
                          <option value="">Select block…</option>
                          {BLOCKS.map((b) => <option key={b} value={b}>Block {b}</option>)}
                        </select>
                      </Field>
                    </div>
                    <Field label="Waste type">
                      <select className={FIELD} value={compType} onChange={(e) => setCompType(e.target.value)}>
                        <option value="">Select type…</option>
                        {['Mixed Waste', 'Food Waste', 'Paper Waste', 'Plastic Waste', 'Electronic Waste', 'Hazardous Waste', 'Other'].map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </Field>
                    <Field label="Description"><textarea className={cn(FIELD, 'min-h-24 resize-y')} placeholder="Describe the waste situation…" value={compDesc} onChange={(e) => setCompDesc(e.target.value)} /></Field>
                    <Field label="Attach image (optional)">
                      <div onClick={() => document.getElementById('complaint-image-input').click()} className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:border-brand-400">
                        {compPreview ? (
                          <div className="relative">
                            <img src={compPreview} alt="Preview" className="max-h-40 rounded-lg" />
                            <button type="button" onClick={(e) => { e.stopPropagation(); setCompImage(null); setCompPreview(null); document.getElementById('complaint-image-input').value = ''; }} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-danger-500 text-white"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        ) : (
                          <>
                            <Camera className="h-6 w-6 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Click to upload image</span>
                            <span className="text-xs text-muted-foreground">JPG, PNG, WEBP — max 2 MB</span>
                          </>
                        )}
                        <input id="complaint-image-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageChange} className="hidden" />
                      </div>
                    </Field>
                    <Button type="submit" size="lg" className="w-full">Submit complaint</Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="max-w-2xl overflow-hidden">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-400">
                      <Gift className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">You've got reward points to spend</p>
                      <p className="text-xs text-muted-foreground">Redeem them for real eco-friendly products in the Eco Store.</p>
                    </div>
                  </div>
                  <Button onClick={() => setSection('sec-store')} className="shrink-0">
                    <ShoppingCart className="h-4 w-4" /> Visit Eco Store
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-4 border-t border-border pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-foreground">Your complaints</h2>
                  <select className={cn(FIELD, 'w-32')} value={reportFilter} onChange={(e) => { setReportFilter(e.target.value); closeTrack(); }}>
                    <option value="active">Active</option>
                    <option value="done">Done</option>
                    <option value="removed">Removed</option>
                  </select>
                </div>
                <Card>
                  <CardContent className="pt-5">
                    {filteredComplaints.length === 0 ? (
                      <EmptyState icon={Camera} title="No complaints here" desc="Nothing matches this filter yet." />
                    ) : (
                      <div className="space-y-2">
                        {filteredComplaints.map((c) => (
                          <div key={c.complaintId} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                            {c.image ? <img src={c.image} alt="" className="h-10 w-10 rounded-md object-cover" onError={(e) => { e.target.style.display = 'none'; }} /> : <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted"><Camera className="h-4 w-4 text-muted-foreground" /></div>}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">{c.complaintId}</p>
                              <p className="truncate text-xs text-muted-foreground">{c.location}</p>
                            </div>
                            <StatusBadge status={c.status} />
                            <button onClick={() => handleTrack(c.complaintId)} aria-label="Check status" title="Check status" className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-muted hover:text-foreground', trackingId === c.complaintId ? 'bg-muted text-foreground' : 'text-muted-foreground')}>
                              <Eye className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {section === 'sec-scan' && (
            <div className="space-y-4">
              <Card className="flex flex-col items-center gap-2 p-8 text-center">
                <Trash2 className="h-12 w-12 text-signal-500" strokeWidth={1.5} />
                <h3 className="text-lg font-bold text-foreground">Dustbin full alert</h3>
                <p className="text-sm text-muted-foreground">Report an overflowing dustbin directly. You'll earn reward points for each scan!</p>
              </Card>
              <Card className="max-w-lg">
                <CardContent className="pt-5">
                  <form onSubmit={handleScan} className="space-y-3">
                    <Field label="Dustbin location"><input className={FIELD} placeholder="e.g. Canteen Entrance Gate 3" value={scanLocation} onChange={(e) => setScanLocation(e.target.value)} /></Field>
                    <Field label="Block">
                      <select className={FIELD} value={scanBlock} onChange={(e) => setScanBlock(e.target.value)}>
                        <option value="">Select block…</option>
                        {BLOCKS.map((b) => <option key={b} value={b}>Block {b}</option>)}
                      </select>
                    </Field>
                    <Button type="submit" variant="signal" size="lg" className="w-full">Send dustbin alert</Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}

          {section === 'sec-history' && (
            <div className="space-y-4">
              <BackToReport onNavigate={setSection} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">Complaint history</h2>
                <select className={cn(FIELD, 'w-40')} value={histFilter} onChange={(e) => setHistFilter(e.target.value)}>
                  <option value="">All status</option>
                  <option value="pending">Pending</option>
                  <option value="in-progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <Card>
                <CardContent className="overflow-x-auto pt-5">
                  <table className="w-full">
                    <thead><tr><Th>ID</Th><Th>Photo</Th><Th>Location</Th><Th>Waste type</Th><Th>Date</Th><Th>Status</Th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {complaints.length === 0 ? (
                        <tr><td colSpan={6}><EmptyState icon={Search} title="No complaints found" desc="You haven't filed any complaints yet." /></td></tr>
                      ) : complaints.map((c) => (
                        <tr key={c.complaintId}>
                          <Td><button onClick={() => handleViewComplaint(c.complaintId)} className="font-mono-data font-medium text-brand-600 hover:underline dark:text-brand-400">{c.complaintId}</button></Td>
                          <Td>{c.image ? <img src={c.image} alt="" className="h-10 w-10 cursor-pointer rounded-md object-cover" onClick={() => handleViewComplaint(c.complaintId)} onError={(e) => { e.target.style.display = 'none'; }} /> : <span className="text-muted-foreground">—</span>}</Td>
                          <Td>{c.location}</Td>
                          <Td className="text-muted-foreground">{c.wasteType}</Td>
                          <Td className="text-muted-foreground">{fmtDate(c.createdAt)}</Td>
                          <Td><StatusBadge status={c.status} /></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {section === 'sec-reward' && (
            <div className="space-y-4">
              <BackToReport onNavigate={setSection} />
              <h2 className="text-lg font-semibold text-foreground">My rewards</h2>
              <div className="grid grid-cols-2 gap-4">
                <StatCard icon={Star} value={rewardTotal} label="Total points" />
                <StatCard icon={Camera} value={rewards.length} label="Reward activities" />
              </div>
              <Card>
                <CardHeader><CardTitle>Reward history</CardTitle></CardHeader>
                <CardContent>
                  {rewards.length === 0 ? <EmptyState icon={Trophy} title="No rewards yet" desc="Report waste issues on campus to earn points!" /> : (
                    <div className="space-y-2">
                      {rewards.map((r, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-signal-500/10"><Trophy className="h-4 w-4 text-signal-600 dark:text-signal-400" /></div>
                          <div className="flex-1"><p className="text-sm font-medium text-foreground">{r.activity}</p><p className="text-xs text-muted-foreground">{fmtDate(r.date)}</p></div>
                          <Badge variant="warning">+{r.points} pts</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {section === 'sec-store' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">Eco store</h2>
                <Button variant="outline" onClick={() => setCartModalOpen(true)} className="relative">
                  <ShoppingCart className="h-4 w-4" /> Cart
                  {cart.length > 0 && <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-danger-500 text-[10px] font-bold text-white">{cart.length}</span>}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Redeem your reward points for items made from recycled waste! You have <strong className="text-success-600 dark:text-success-400">{rewardTotal} pts</strong>.</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {storeStock.length === 0 ? (
                  <div className="sm:col-span-2 lg:col-span-3"><EmptyState icon={ShoppingCart} title="Store is empty" desc="No eco-friendly items are available right now." /></div>
                ) : storeStock.map((item) => (
                  <Card key={item._id} interactive className="overflow-hidden" onClick={() => setSelectedProduct(item)}>
                    <div className="relative h-36 bg-muted">
                      <ProductThumb item={item} className="h-full w-full" />
                      <Badge variant="success" className="absolute right-2 top-2"><Recycle className="h-3 w-3" /> Eco</Badge>
                    </div>
                    <CardContent className="space-y-2 pt-4">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <Badge variant="muted">{item.category || 'other'}</Badge>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1 font-semibold text-foreground"><Star className="h-3.5 w-3.5" /> {item.pointsRequired} pts</span>
                        <span className="text-xs text-muted-foreground">{item.stock > 0 ? `${item.stock} left` : 'Out of stock'}</span>
                      </div>
                      <Button
                        size="sm" className="w-full"
                        disabled={rewardTotal < item.pointsRequired || item.stock <= 0 || isRedeeming}
                        onClick={(e) => { e.stopPropagation(); handleRedeem(item._id); }}
                      >
                        {isRedeeming ? 'Redeeming…' : rewardTotal >= item.pointsRequired ? 'Redeem now' : `Need ${item.pointsRequired - rewardTotal} more`}
                      </Button>
                      <Button size="sm" variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); setCart((prev) => [...prev, item]); toast.success(`${item.name} added to cart`); }}>
                        <Plus className="h-3.5 w-3.5" /> Add to cart
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <AwarenessWidget
                slides={AWARENESS_SLIDES}
                index={carouselIdx}
                onNext={nextSlide}
                onPrev={prevSlide}
                onSelect={setCarouselIdx}
                collapsed={awarenessCollapsed}
                onToggleCollapsed={() => setAwarenessCollapsed((c) => !c)}
              />
            </div>
          )}

          {section === 'sec-orders' && (
            <div className="space-y-4">
              <BackToReport onNavigate={setSection} />
              <h2 className="text-lg font-semibold text-foreground">My orders & redemptions</h2>
              <div className="grid grid-cols-3 gap-4">
                <StatCard icon={Package} value={allOrders.length} label="Total orders" />
                <StatCard icon={Clock} value={allOrders.filter((o) => o.status === 'pending').length} label="Pending" />
                <StatCard icon={Gift} value={allOrders.filter((o) => o.status === 'ready_for_pickup').length} label="Ready" />
              </div>
              {isOrdersLoading ? (
                <p className="text-sm text-muted-foreground">Loading orders…</p>
              ) : allOrders.length === 0 ? (
                <Card><CardContent className="pt-5"><EmptyState icon={Package} title="No orders found" desc="Redeem points in the Eco Store to see orders here." /></CardContent></Card>
              ) : allOrders.map((o) => {
                const steps = ['pending', 'approved', 'ready_for_pickup', 'delivered'];
                const idx = steps.indexOf(o.status);
                return (
                  <Card key={o._id}>
                    <CardContent className="space-y-4 pt-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Package className="h-8 w-8 text-brand-500" />
                          <div>
                            <p className="font-mono-data text-sm font-medium text-foreground">Order <span className="text-brand-600 dark:text-brand-400">{o.orderId}</span></p>
                            <p className="text-xs text-muted-foreground">Placed on {fmtDate(o.createdAt)}</p>
                          </div>
                        </div>
                        <Badge variant="warning"><Star className="h-3 w-3" /> {o.pointsUsed} pts</Badge>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Product</p>
                          <p className="text-lg font-bold text-foreground">{o.itemName}</p>
                          {o.assignedCollectorName && <p className="mt-1 flex items-center gap-1 text-xs font-medium text-success-600 dark:text-success-400"><HardHat className="h-3 w-3" /> {o.assignedCollectorName}</p>}
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            <div><p className="text-muted-foreground">Location</p><p className="font-medium text-foreground">{o.pickupLocation || 'Admin Office'}</p></div>
                            <div><p className="text-muted-foreground">Time</p><p className="font-medium text-foreground">{o.pickupTime || '10 AM - 5 PM'}</p></div>
                          </div>
                        </div>
                        <div className="rounded-lg border border-border bg-muted p-3 text-center">
                          <p className="text-xs text-muted-foreground">Pickup code</p>
                          <div className="mt-1 flex items-center justify-center gap-1.5">
                            <span className="font-mono-data text-lg font-bold tracking-widest text-foreground">{o.pickupCode}</span>
                            <button onClick={() => { navigator.clipboard.writeText(o.pickupCode); toast('Code copied'); }} className="text-muted-foreground hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
                          </div>
                          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${o.pickupCode}`} alt="QR" className="mx-auto my-2 h-20 w-20 rounded bg-white p-1" />
                          <p className="text-[10px] text-muted-foreground">{o.expiresAt ? `Expires ${new Date(o.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Show this at pickup'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Status</p>
                          <StatusBadge status={o.status === 'ready_for_pickup' ? 'ready' : o.status === 'approved' ? 'in-progress' : o.status === 'delivered' ? 'completed' : 'pending'} />
                          {o.status === 'delivered' && o.deliveredAt && <p className="mt-2 text-xs font-medium text-success-600 dark:text-success-400">Delivered {fmtDate(o.deliveredAt)}</p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {steps.map((s, i) => <div key={s} className={cn('h-1.5 flex-1 rounded-full', i <= idx ? 'bg-brand-500' : 'bg-muted')} />)}
                      </div>

                      <div className="flex items-center justify-between">
                        {o.status === 'delivered' ? (
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star key={star} onClick={() => setOrderRatings((prev) => ({ ...prev, [o._id]: star }))} className={cn('h-4 w-4 cursor-pointer', star <= (orderRatings[o._id] || 0) ? 'fill-signal-400 text-signal-400' : 'text-border')} />
                            ))}
                          </div>
                        ) : <span />}
                        <Button size="sm" variant="ghost" onClick={() => { setReceiptOrder(o); setReceiptModalOpen(true); }}>Full receipt</Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabTransition>
        </main>
      </div>

      <Modal isOpen={receiptModalOpen} onClose={() => setReceiptModalOpen(false)} title="Order receipt">
        {receiptOrder && (
          <div className="space-y-3 p-5">
            <div className="text-center"><p className="flex items-center justify-center gap-1.5 text-lg font-bold text-foreground"><Recycle className="h-5 w-5" /> NagarAI</p><p className="text-xs text-muted-foreground">Eco Store — Order Receipt</p></div>
            <div className="space-y-2 border-y border-border py-3 text-sm">
              {[['Order ID', receiptOrder.orderId], ['Product', receiptOrder.itemName], ['Points used', `${receiptOrder.pointsUsed} pts`], ['Date', fmtDate(receiptOrder.createdAt)], ['Pickup location', receiptOrder.pickupLocation || 'Admin Office'], ['Pickup time', receiptOrder.pickupTime || '10 AM – 5 PM'], ['Status', receiptOrder.status.replace(/_/g, ' ')]].map(([k, v]) => (
                <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-medium text-foreground">{v}</span></div>
              ))}
            </div>
            {receiptOrder.pickupCode && (
              <div className="text-center"><p className="text-xs text-muted-foreground">Pickup code</p><p className="font-mono-data text-2xl font-bold tracking-widest text-foreground">{receiptOrder.pickupCode}</p></div>
            )}
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
              <Button variant="outline" className="flex-1" onClick={() => setReceiptModalOpen(false)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={detailModalOpen} onClose={() => setDetailModalOpen(false)} title="Complaint details">
        {selectedDetail && (
          <div className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-mono-data font-semibold text-brand-600 dark:text-brand-400">{selectedDetail.complaintId}</h2>
              <StatusBadge status={selectedDetail.status} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Location</p><p className="font-medium text-foreground">{selectedDetail.location}</p></div>
              <div><p className="text-xs text-muted-foreground">Waste type</p><p className="font-medium text-foreground">{selectedDetail.wasteType}</p></div>
              <div className="col-span-2"><p className="text-xs text-muted-foreground">Description</p><p className="text-foreground">{selectedDetail.description}</p></div>
              {selectedDetail.assignedTo && <div><p className="text-xs text-muted-foreground">Assigned collector</p><p className="font-medium text-success-600 dark:text-success-400">{selectedDetail.assignedTo.name}</p></div>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {selectedDetail.image && <img src={selectedDetail.image} alt="" className="h-36 w-full rounded-lg border border-border object-cover" onError={(e) => { e.target.parentElement.style.display = 'none'; }} />}
              {selectedDetail.completionImage && <img src={selectedDetail.completionImage} alt="" className="h-36 w-full rounded-lg border-2 border-success-500 object-cover" onError={(e) => { e.target.parentElement.style.display = 'none'; }} />}
            </div>
            <div className="rounded-lg border border-border bg-muted p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-brand-600 dark:text-brand-400">Timeline & history</p>
              <div className="space-y-2">
                {selectedDetail.statusHistory?.map((h, i) => (
                  <div key={i} className="flex gap-3 text-sm"><StatusBadge status={h.status} /><span className="text-foreground">{h.note}</span></div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!trackingId} onClose={closeTrack} title={trackResult ? trackResult.complaintId : 'Complaint status'}>
        <div className="space-y-4 p-5">
          {trackNotFound ? (
            <p className="text-sm text-muted-foreground">Couldn&apos;t load status. Try again.</p>
          ) : trackResult ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <StatusBadge status={trackResult.status} />
              </div>
              <p className="text-sm text-muted-foreground"><strong className="text-foreground">Location:</strong> {trackResult.location} · <strong className="text-foreground">Date:</strong> {fmtDate(trackResult.createdAt)}</p>
              {trackResult.image && (
                <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-brand-600 dark:text-brand-400">Submitted photo</p>
                  <img src={trackResult.image} alt="" className="w-full rounded-lg border border-border" onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
                </div>
              )}
              {trackResult.status === 'rejected' && (
                <div className="rounded-lg border border-danger-500/20 bg-danger-500/5 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase text-danger-600 dark:text-danger-400">Rejection reason</p>
                  <p className="text-sm text-foreground">{trackResult.rejectionReason || 'No reason provided.'}</p>
                </div>
              )}
              {trackResult.status === 'completed' && trackResult.completionImage && (
                <div className="rounded-lg border border-success-500/20 bg-success-500/5 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-success-600 dark:text-success-400">Completion proof</p>
                  <img src={trackResult.completionImage} alt="" className="w-full rounded-lg border border-border" onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
                </div>
              )}
              <div className="space-y-3 border-t border-border pt-3">
                {[
                  { label: 'Complaint submitted', desc: `Filed on ${fmtDate(trackResult.createdAt)}`, done: true },
                  { label: 'Assigned to collector', desc: 'Collector notified', done: trackResult.status !== 'pending' },
                  { label: trackResult.status === 'rejected' ? 'Rejected' : 'In progress', desc: trackResult.status === 'rejected' ? 'Complaint was denied' : 'Collector working on it', done: ['in-progress', 'completed', 'rejected'].includes(trackResult.status), isError: trackResult.status === 'rejected' },
                  { label: 'Completed', desc: 'Area cleaned & verified', done: trackResult.status === 'completed', hidden: trackResult.status === 'rejected' },
                ].filter((s) => !s.hidden).map((s, i) => {
                  const Icon = s.isError ? XCircle : s.done ? CheckCircle2 : Clock;
                  return (
                    <div key={i} className="flex gap-3">
                      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', s.isError ? 'text-danger-500' : s.done ? 'text-success-500' : 'text-muted-foreground')} />
                      <div>
                        <p className={cn('text-sm font-medium', s.isError ? 'text-danger-600 dark:text-danger-400' : s.done ? 'text-foreground' : 'text-muted-foreground')}>{s.label}</p>
                        <p className="text-xs text-muted-foreground">{s.done ? s.desc : 'Pending…'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </div>
      </Modal>

      <Modal isOpen={cartModalOpen} onClose={() => setCartModalOpen(false)} title="Your cart">
        <div className="space-y-4 p-5">
          {cartItems.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Your cart is empty" desc="Browse the Eco Store to add items!" />
          ) : (
            <>
              <div className="space-y-2">
                {cartItems.map((ci) => (
                  <div key={ci._id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                    <ProductThumb item={ci} className="h-12 w-12 rounded-lg bg-muted p-1" iconClassName="h-6 w-6" />
                    <div className="flex-1"><p className="text-sm font-medium text-foreground">{ci.name}</p><p className="flex items-center gap-1 text-xs text-success-600 dark:text-success-400"><Star className="h-3 w-3" /> {ci.pointsRequired} pts each</p></div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setCart((prev) => { const i = prev.findIndex((c) => c._id === ci._id); return i === -1 ? prev : [...prev.slice(0, i), ...prev.slice(i + 1)]; })} className="rounded p-1 hover:bg-muted"><Minus className="h-3.5 w-3.5" /></button>
                      <span className="w-5 text-center text-sm font-semibold">{ci.qty}</span>
                      <button onClick={() => setCart((prev) => [...prev, ci])} className="rounded p-1 hover:bg-muted"><Plus className="h-3.5 w-3.5" /></button>
                    </div>
                    <span className="w-14 text-right text-sm font-semibold text-foreground">{ci.pointsRequired * ci.qty} pts</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5 rounded-lg border border-border bg-muted p-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Your balance</span><span className="flex items-center gap-1 font-medium"><Trophy className="h-3.5 w-3.5" /> {rewardTotal} pts</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cart total</span><span className="flex items-center gap-1 font-semibold"><Star className="h-3.5 w-3.5" /> {cartTotal} pts</span></div>
                <div className="flex justify-between border-t border-border pt-1.5"><span className="font-medium">After checkout</span><span className={cn('font-semibold', canCheckout ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400')}>{canCheckout ? `${rewardTotal - cartTotal} pts remaining` : `Need ${cartTotal - rewardTotal} more`}</span></div>
              </div>
              <div className="flex gap-2">
                <Button variant="danger" className="flex-1" onClick={() => { setCart([]); toast('Cart cleared'); }}><Trash2 className="h-4 w-4" /> Clear</Button>
                <Button
                  className="flex-1" disabled={!canCheckout}
                  onClick={async () => {
                    for (const ci of cartItems) for (let i = 0; i < ci.qty; i++) await handleRedeem(ci._id);
                    setCart([]); setCartModalOpen(false); toast.success('All cart items redeemed — check My Orders');
                  }}
                >
                  {canCheckout ? 'Checkout all' : 'Insufficient points'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal isOpen={!!selectedProduct} onClose={() => setSelectedProduct(null)} title="Product details">
        {selectedProduct && (
          <div className="space-y-4 p-5">
            <ProductThumb item={selectedProduct} className="h-52 w-full rounded-lg bg-muted" iconClassName="h-20 w-20" />
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-bold text-foreground">{selectedProduct.name}</h2>
              <Badge variant="muted">{selectedProduct.category}</Badge>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1 font-semibold text-success-600 dark:text-success-400"><Star className="h-3.5 w-3.5" /> {selectedProduct.pointsRequired} pts</span>
              <span className={selectedProduct.stock > 0 ? 'text-brand-600 dark:text-brand-400' : 'text-danger-600 dark:text-danger-400'}>{selectedProduct.stock > 0 ? `${selectedProduct.stock} in stock` : 'Out of stock'}</span>
            </div>
            <p className="text-sm text-muted-foreground">{selectedProduct.description}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setCart((prev) => [...prev, selectedProduct]); toast.success(`${selectedProduct.name} added to cart`); }}><Plus className="h-4 w-4" /> Add to cart</Button>
              <Button className="flex-1" disabled={rewardTotal < selectedProduct.pointsRequired || selectedProduct.stock <= 0} onClick={() => { handleRedeem(selectedProduct._id); setSelectedProduct(null); }}>
                {selectedProduct.stock <= 0 ? 'Out of stock' : 'Redeem now'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
