import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Plus, Eye, Trash2, Camera, ShieldAlert, KeyRound, UserCog,
  Building2, LayoutDashboard, ShoppingBag, Truck, GraduationCap, Trophy, Palette, Lock,
  Settings, Clock, RefreshCw, CheckCircle2, TrendingUp, AlertTriangle, Package, Gift, Star,
  ClipboardList,
} from 'lucide-react';
import SchemeSwitcher from '../../components/ui/SchemeSwitcher';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
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
import NagaraiCommandCenter from './NagaraiCommandCenter';
import WasteOpsTab from '../../components/admin/WasteOpsTab';
import { fmtDate, getInitials } from '../../utils/helpers';
import {
  getComplaints, getUsers, getUserById, createUser, deleteUserApi, getDashboardStats,
  getRewards, addReward, changePassword, getOrders, updateOrderStatus, updateUser,
} from '../../services/api';

const NAV_ITEMS = [
  { id: 'sec-nagarai', label: 'NagarAI Command', icon: <Building2 className="h-4 w-4" /> },
  { id: 'sec-waste-ops', label: 'Waste Ops', icon: <Truck className="h-4 w-4" /> },
  { id: 'sec-dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'sec-store-orders', label: 'Store Orders', icon: <ShoppingBag className="h-4 w-4" /> },
  { id: 'sec-collectors', label: 'Manage Collectors', icon: <Truck className="h-4 w-4" /> },
  { id: 'sec-users', label: 'Manage Citizens', icon: <GraduationCap className="h-4 w-4" /> },
  { id: 'sec-rewards', label: 'Give Rewards', icon: <Trophy className="h-4 w-4" /> },
  { id: 'sec-appearance', label: 'Appearance', icon: <Palette className="h-4 w-4" /> },
  { id: 'sec-profile', label: 'Profile', icon: <Lock className="h-4 w-4" /> },
];

const ORDER_STEPS = ['pending', 'approved', 'ready_for_pickup', 'delivered'];
const FIELD = 'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none ring-brand-400 focus:ring-2';
const LABEL = 'mb-1 block text-xs font-medium text-muted-foreground';

function Field({ label, children }) {
  return <div><label className={LABEL}>{label}</label>{children}</div>;
}
function Th({ children }) { return <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</th>; }
function Td({ children, className }) { return <td className={`px-3 py-2 text-sm ${className || ''}`}>{children}</td>; }
function EmptyRow({ span, children }) { return <tr><td colSpan={span} className="px-3 py-8 text-center text-sm text-muted-foreground">{children}</td></tr>; }

export default function AdminDashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [section, setSection] = useState('sec-dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [stats, setStats] = useState({
    total: 0, pending: 0, progress: 0, done: 0, students: 0, collectors: 0,
    orderAnalytics: { total: 0, delivered: 0, completionRate: 0, failedAttempts: 0, blockPerformance: [] },
  });
  const [allComplaints, setAllComplaints] = useState([]);
  const [studentUsers, setStudentUsers] = useState([]);
  const [createStudentModalOpen, setCreateStudentModalOpen] = useState(false);
  const [collectors, setCollectors] = useState([]);
  const [createCollectorModalOpen, setCreateCollectorModalOpen] = useState(false);
  const [allOrders, setAllOrders] = useState([]);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewUserData, setViewUserData] = useState(null);
  const [viewUserComplaints, setViewUserComplaints] = useState([]);

  const [csName, setCsName] = useState(''); const [csEmail, setCsEmail] = useState('');
  const [csDept, setCsDept] = useState(''); const [csPass, setCsPass] = useState('');
  const [ccName, setCcName] = useState(''); const [ccEmail, setCcEmail] = useState('');
  const [ccBlock, setCcBlock] = useState(''); const [ccPass, setCcPass] = useState('');

  const [students, setStudents] = useState([]);
  const [rewStudentId, setRewStudentId] = useState('');
  const [rewActivity, setRewActivity] = useState('Waste Photo Complaint');
  const [rewCustom, setRewCustom] = useState('');
  const [rewPoints, setRewPoints] = useState('');
  const [allRewards, setAllRewards] = useState([]);

  const [profile, setProfile] = useState(null);
  const [apOld, setApOld] = useState(''); const [apNew, setApNew] = useState(''); const [apConfirm, setApConfirm] = useState('');
  const [upName, setUpName] = useState('');

  const loadStats = useCallback(async () => { try { setStats((await getDashboardStats()).data); } catch {} }, []);
  const loadComplaints = useCallback(async () => { try { setAllComplaints((await getComplaints()).data); } catch {} }, []);
  const loadStudentUsers = useCallback(async () => { try { setStudentUsers((await getUsers('student')).data); } catch {} }, []);
  const loadCollectors = useCallback(async () => { try { setCollectors((await getUsers('collector')).data); } catch {} }, []);
  const loadStudents = useCallback(async () => { try { setStudents((await getUsers('student')).data); } catch {} }, []);
  const loadAllRewards = useCallback(async () => {
    try {
      const res = await getRewards();
      setAllRewards(res.data.map((r) => ({ ...r, userName: r.user?.name || 'Unknown', userEmail: r.user?.email || 'N/A' })));
    } catch {}
  }, []);
  const loadProfile = useCallback(async () => {
    try { const res = await getUserById(user._id); setProfile(res.data); setUpName(res.data.name || ''); } catch {}
  }, [user._id]);
  const loadStoreOrders = useCallback(async () => { try { setAllOrders((await getOrders()).data); } catch {} }, []);

  useEffect(() => {
    loadStats(); loadComplaints(); loadStudentUsers(); loadCollectors();
    loadStudents(); loadAllRewards(); loadProfile(); loadStoreOrders();
  }, [loadStats, loadComplaints, loadStudentUsers, loadCollectors, loadStudents, loadAllRewards, loadProfile, loadStoreOrders]);

  const handleCreateStudent = async (e) => {
    e.preventDefault();
    if (!csName || !csEmail || !csPass) return showToast('Please fill all required fields.', 'warning');
    try {
      await createUser({ role: 'student', name: csName, email: csEmail, dept: csDept, password: csPass, block: 'A' });
      toast.success(`Citizen ${csName} created`);
      setCreateStudentModalOpen(false); setCsName(''); setCsEmail(''); setCsDept(''); setCsPass('');
      loadStudentUsers(); loadStats(); loadStudents();
    } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  const handleCreateCollector = async (e) => {
    e.preventDefault();
    if (!ccName || !ccEmail || !ccBlock || !ccPass) return showToast('Please fill all fields including Block.', 'warning');
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(ccEmail)) return showToast('Please enter a valid email.', 'warning');
    if (ccPass.length < 6) return showToast('Password must be at least 6 characters.', 'warning');
    try {
      await createUser({ role: 'collector', name: ccName, email: ccEmail, block: ccBlock, password: ccPass });
      toast.success(`Collector "${ccName}" created for Block ${ccBlock}`);
      setCreateCollectorModalOpen(false); setCcName(''); setCcEmail(''); setCcBlock(''); setCcPass('');
      loadCollectors(); loadStats();
    } catch (err) { toast.error(err.response?.data?.message || 'Error creating collector'); }
  };

  const handleDeleteUser = async (id, name) => {
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    try { await deleteUserApi(id); toast.warning(`User ${name} deleted`); loadStudentUsers(); loadCollectors(); loadStats(); }
    catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  const handleViewUser = async (id) => {
    try {
      const res = await getUserById(id);
      setViewUserData(res.data);
      setViewUserComplaints((await getComplaints({ user: id })).data);
      setViewModalOpen(true);
    } catch {}
  };

  const handleAwardReward = async (e) => {
    e.preventDefault();
    const activity = rewActivity === 'Custom' ? rewCustom.trim() : rewActivity;
    const pts = parseInt(rewPoints);
    if (!rewStudentId) return showToast('Please select a citizen.', 'warning');
    if (!activity) return showToast('Please specify an activity.', 'warning');
    if (!pts || pts < 1) return showToast('Please enter valid points (≥ 1).', 'warning');
    try {
      await addReward({ user: rewStudentId, activity, points: pts });
      const stu = students.find((s) => s._id === rewStudentId);
      toast.success(`Awarded ${pts} pts to ${stu?.name || 'citizen'}`);
      setRewStudentId(''); setRewActivity('Waste Photo Complaint'); setRewCustom(''); setRewPoints('');
      loadAllRewards(); loadStudents(); loadStats();
    } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!apOld || !apNew || !apConfirm) return toast.error('Please fill all fields.');
    if (apNew !== apConfirm) return toast.error('Passwords do not match.');
    if (apNew.length < 6) return toast.warning('Password must be ≥ 6 characters.');
    try {
      await changePassword(user._id, { oldPassword: apOld, newPassword: apNew });
      toast.success('Admin password updated');
      setApOld(''); setApNew(''); setApConfirm('');
    } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!upName.trim()) return toast.error('Name cannot be empty.');
    try { await updateUser(user._id, { name: upName.trim() }); toast.success('Profile updated'); loadProfile(); }
    catch (err) { toast.error(err.response?.data?.message || 'Error updating profile'); }
  };

  const handleOrderStatus = async (orderId, newStatus) => {
    try { await updateOrderStatus(orderId, { status: newStatus }); toast.success(`Order ${orderId}  ${newStatus}`); loadStoreOrders(); }
    catch (err) { toast.error(err.response?.data?.message || 'Error updating status'); }
  };

  const currentLabel = NAV_ITEMS.find((n) => n.id === section)?.label || '';
  const blockChartData = ['A', 'B', 'C', 'D', 'E'].map((b) => ({
    block: `Block ${b}`,
    delivered: stats.orderAnalytics?.blockPerformance?.find((p) => p._id === b)?.count || 0,
  }));

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar portalName="Admin Portal" icon={<Settings className="h-4 w-4" />} navItems={NAV_ITEMS} activeSection={section} onNavigate={setSection} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={currentLabel} onToggleMenu={() => setIsSidebarOpen(true)} />
        <main className="flex-1 space-y-5 p-4 md:p-6">
        <TabTransition tabKey={section}>

          {section === 'sec-nagarai' && <NagaraiCommandCenter />}

          {section === 'sec-waste-ops' && <WasteOpsTab />}

          {section === 'sec-dashboard' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                <StatCard icon={ClipboardList} value={stats.total} label="Total complaints" />
                <StatCard icon={Clock} value={stats.pending} label="Pending" />
                <StatCard icon={RefreshCw} value={stats.progress} label="In progress" />
                <StatCard icon={CheckCircle2} value={stats.done} label="Resolved" />
                <StatCard icon={GraduationCap} value={stats.students} label="Citizens" />
                <StatCard icon={Truck} value={stats.collectors} label="Collectors" />
                <StatCard icon={ShoppingBag} value={stats.orderAnalytics?.total || 0} label="Store sales" />
                <StatCard icon={TrendingUp} value={`${stats.orderAnalytics?.completionRate || 0}%`} label="Completion rate" />
                <StatCard icon={AlertTriangle} value={stats.orderAnalytics?.failedAttempts || 0} label="Auth failures" />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Fulfillment by block</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={blockChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="block" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="delivered" fill="#0d9488" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                  <ShieldAlert className="h-10 w-10 text-brand-500" />
                  <h3 className="font-semibold text-foreground">Security health</h3>
                  <p className="text-sm text-muted-foreground">
                    Marketplace security is currently <strong className="text-foreground">optimal</strong>.
                    {stats.orderAnalytics?.failedAttempts > 10 ? ' High volume of auth failures detected.' : ' Minimal failed verification attempts.'}
                  </p>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle>All complaints</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr><Th>ID</Th><Th>Photo</Th><Th>Citizen</Th><Th>Location</Th><Th>Block</Th><Th>Assigned</Th><Th>Date</Th><Th>Status</Th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {allComplaints.length === 0 ? <EmptyRow span={8}>No complaints yet.</EmptyRow> : allComplaints.map((c) => (
                        <tr key={c.complaintId}>
                          <Td className="font-mono-data font-medium text-brand-600 dark:text-brand-400">{c.complaintId}</Td>
                          <Td>
                            {(c.image || c.completionImage) ? (
                              <img src={c.image || c.completionImage} alt="" className="h-10 w-10 rounded-md object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                            ) : <span className="text-muted-foreground">—</span>}
                          </Td>
                          <Td>{c.user?.name || '—'}</Td>
                          <Td className="text-muted-foreground">{c.location}</Td>
                          <Td><Badge variant="default"><Building2 className="h-3 w-3" /> {c.block || '—'}</Badge></Td>
                          <Td className="text-muted-foreground">{c.assignedTo?.name || 'Unassigned'}</Td>
                          <Td className="text-muted-foreground">{fmtDate(c.createdAt)}</Td>
                          <Td>
                            <StatusBadge status={c.status} />
                            {c.status === 'completed' && c.completionImage && (
                              <a href={c.completionImage} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 text-xs font-medium text-success-600 hover:underline dark:text-success-400">
                                <Camera className="h-3 w-3" /> View proof
                              </a>
                            )}
                            {c.status === 'rejected' && c.rejectionReason && (
                              <p className="mt-1 max-w-[150px] text-xs text-danger-600 dark:text-danger-400"><strong>Reason:</strong> {c.rejectionReason}</p>
                            )}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {section === 'sec-store-orders' && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-foreground">Store orders management</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <StatCard icon={Package} value={allOrders.length} label="Total orders" />
                <StatCard icon={Clock} value={allOrders.filter((o) => o.status === 'pending').length} label="Pending" />
                <StatCard icon={RefreshCw} value={allOrders.filter((o) => o.status === 'approved').length} label="In progress" />
                <StatCard icon={Gift} value={allOrders.filter((o) => o.status === 'ready_for_pickup').length} label="Ready" />
                <StatCard icon={CheckCircle2} value={allOrders.filter((o) => o.status === 'delivered').length} label="Delivered" />
              </div>
              <Card>
                <CardContent className="overflow-x-auto pt-5">
                  <table className="w-full">
                    <thead><tr><Th>Order</Th><Th>Customer</Th><Th>Product</Th><Th>Progress</Th><Th>Actions</Th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {allOrders.length === 0 ? <EmptyRow span={5}>No marketplace activity yet.</EmptyRow> : allOrders.map((o) => {
                        const idx = ORDER_STEPS.indexOf(o.status);
                        return (
                          <tr key={o.orderId}>
                            <Td>
                              <p className="font-mono-data font-medium text-brand-600 dark:text-brand-400">{o.orderId}</p>
                              <p className="text-xs text-muted-foreground">{fmtDate(o.createdAt)}</p>
                            </Td>
                            <Td>{o.userName}<p className="text-xs text-muted-foreground">{o.user?.email || '—'}</p></Td>
                            <Td>{o.itemName}<p className="flex items-center gap-1 text-xs text-muted-foreground"><Star className="h-3 w-3" /> {o.pointsUsed} pts</p></Td>
                            <Td>
                              <div className="flex items-center gap-1">
                                {ORDER_STEPS.map((s, i) => (
                                  <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= idx ? 'bg-brand-500' : 'bg-muted'}`} />
                                ))}
                              </div>
                              <p className="mt-1 text-[10px] font-medium uppercase text-muted-foreground">{o.status.replace(/_/g, ' ')}</p>
                            </Td>
                            <Td>
                              {o.status === 'pending' && <Button size="sm" onClick={() => handleOrderStatus(o.orderId, 'approved')}>Approve</Button>}
                              {o.status === 'approved' && <Button size="sm" variant="signal" onClick={() => handleOrderStatus(o.orderId, 'ready_for_pickup')}>Ready</Button>}
                              {o.status === 'ready_for_pickup' && <Button size="sm" onClick={() => handleOrderStatus(o.orderId, 'delivered')}>Deliver</Button>}
                              {o.status === 'delivered' && <span className="text-xs text-muted-foreground">Fulfilled</span>}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {section === 'sec-collectors' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">Manage collectors</h2>
                <Button onClick={() => setCreateCollectorModalOpen(true)}><Plus className="h-4 w-4" /> Add collector</Button>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                <StatCard icon={Truck} value={collectors.length} label="Total collectors" />
                {['A', 'B', 'C', 'D', 'E'].map((b) => <StatCard key={b} icon={Building2} value={collectors.filter((c) => c.block === b).length} label={`Block ${b}`} />)}
              </div>
              <Card>
                <CardContent className="overflow-x-auto pt-5">
                  <table className="w-full">
                    <thead><tr><Th>Name</Th><Th>Email</Th><Th>Block</Th><Th>Created</Th><Th>Actions</Th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {collectors.length === 0 ? <EmptyRow span={5}>No collectors found — add one above.</EmptyRow> : collectors.map((c) => (
                        <tr key={c._id}>
                          <Td className="font-medium">{c.name}</Td>
                          <Td className="text-muted-foreground">{c.email}</Td>
                          <Td><Badge><Building2 className="h-3 w-3" /> Block {c.block || '—'}</Badge></Td>
                          <Td className="text-muted-foreground">{fmtDate(c.createdAt)}</Td>
                          <Td className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => handleViewUser(c._id)}><Eye className="h-3.5 w-3.5" /> View</Button>
                            <Button size="sm" variant="danger" onClick={() => handleDeleteUser(c._id, c.name)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {section === 'sec-users' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">Manage citizens</h2>
                <Button onClick={() => setCreateStudentModalOpen(true)}><Plus className="h-4 w-4" /> Create citizen</Button>
              </div>
              <Card>
                <CardContent className="overflow-x-auto pt-5">
                  <table className="w-full">
                    <thead><tr><Th>Name</Th><Th>Email</Th><Th>Area</Th><Th>Reward pts</Th><Th>Actions</Th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {studentUsers.length === 0 ? <EmptyRow span={5}>No citizens found.</EmptyRow> : studentUsers.map((u) => (
                        <tr key={u._id}>
                          <Td className="font-medium">{u.name}</Td>
                          <Td className="text-muted-foreground">{u.email}</Td>
                          <Td className="text-muted-foreground">{u.dept || '—'}</Td>
                          <Td><Badge variant="warning"><Trophy className="h-3 w-3" /> {u.rewardPoints || 0}</Badge></Td>
                          <Td className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => handleViewUser(u._id)}><Eye className="h-3.5 w-3.5" /> View</Button>
                            <Button size="sm" variant="danger" onClick={() => handleDeleteUser(u._id, u.name)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {section === 'sec-rewards' && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-foreground">Give reward points</h2>
              <Card className="max-w-lg">
                <CardContent className="space-y-3 pt-5">
                  <form onSubmit={handleAwardReward} className="space-y-3">
                    <Field label="Select citizen">
                      <select className={FIELD} value={rewStudentId} onChange={(e) => setRewStudentId(e.target.value)}>
                        <option value="">Choose a citizen…</option>
                        {students.map((s) => <option key={s._id} value={s._id}>{s.name} ({s.email}) — {s.rewardPoints || 0} pts</option>)}
                      </select>
                    </Field>
                    <Field label="Activity / reason">
                      <select className={FIELD} value={rewActivity} onChange={(e) => setRewActivity(e.target.value)}>
                        <option>Waste Photo Complaint</option>
                        <option>Dustbin Full Alert (Scan)</option>
                        <option>Best Reporter of the Month</option>
                        <option>Campus Cleanliness Initiative</option>
                        <option value="Custom">Custom Activity…</option>
                      </select>
                    </Field>
                    {rewActivity === 'Custom' && (
                      <Field label="Custom activity name"><input className={FIELD} placeholder="Describe the activity…" value={rewCustom} onChange={(e) => setRewCustom(e.target.value)} /></Field>
                    )}
                    <Field label="Points to award"><input className={FIELD} type="number" placeholder="e.g. 50" min="1" max="500" value={rewPoints} onChange={(e) => setRewPoints(e.target.value)} /></Field>
                    <Button type="submit" variant="signal" size="lg" className="w-full">Award points</Button>
                  </form>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>All rewards distributed</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr><Th>Citizen</Th><Th>Activity</Th><Th>Points</Th><Th>Date</Th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {allRewards.length === 0 ? <EmptyRow span={4}>No rewards distributed yet.</EmptyRow> : allRewards.map((r, i) => (
                        <tr key={i}>
                          <Td><p className="font-medium">{r.userName}</p><p className="text-xs text-muted-foreground">{r.userEmail}</p></Td>
                          <Td className="text-muted-foreground">{r.activity}</Td>
                          <Td><Badge variant="warning">+{r.points}</Badge></Td>
                          <Td className="text-muted-foreground">{fmtDate(r.date)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {section === 'sec-appearance' && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
              <SchemeSwitcher />
            </div>
          )}

          {section === 'sec-profile' && (
            <div className="max-w-xl space-y-5">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-white">{getInitials(profile?.name)}</div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{profile?.name || '—'}</h3>
                  <p className="text-sm text-muted-foreground">{profile?.email}</p>
                  <Badge variant="danger" className="mt-1"><UserCog className="h-3 w-3" /> Administrator</Badge>
                </div>
              </div>

              <Card>
                <CardHeader><CardTitle>Update profile</CardTitle></CardHeader>
                <CardContent>
                  <form onSubmit={handleUpdateProfile} className="space-y-3">
                    <Field label="Full name"><input className={FIELD} value={upName} onChange={(e) => setUpName(e.target.value)} placeholder="Admin name" /></Field>
                    <Button type="submit">Update name</Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-danger-500/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-danger-600 dark:text-danger-400"><ShieldAlert className="h-4 w-4" /> Change admin password</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-xs text-danger-600/80 dark:text-danger-400/80">This changes the master admin password. Keep it secure.</p>
                  <form onSubmit={handleChangePassword} className="space-y-3">
                    <Field label="Current password"><input className={FIELD} type="password" value={apOld} onChange={(e) => setApOld(e.target.value)} placeholder="Current admin password" /></Field>
                    <Field label="New password"><input className={FIELD} type="password" value={apNew} onChange={(e) => setApNew(e.target.value)} placeholder="Min. 6 characters" /></Field>
                    <Field label="Confirm new password"><input className={FIELD} type="password" value={apConfirm} onChange={(e) => setApConfirm(e.target.value)} placeholder="Repeat new password" /></Field>
                    <Button type="submit" variant="danger" size="lg" className="w-full"><KeyRound className="h-4 w-4" /> Change password</Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
        </TabTransition>
        </main>
      </div>

      <Modal isOpen={createCollectorModalOpen} onClose={() => setCreateCollectorModalOpen(false)} title="Add new collector">
        <form onSubmit={handleCreateCollector} className="space-y-3 p-5">
          <Field label="Full name"><input className={FIELD} placeholder="Collector's full name" value={ccName} onChange={(e) => setCcName(e.target.value)} /></Field>
          <Field label="Email"><input className={FIELD} type="email" placeholder="email@campus.edu" value={ccEmail} onChange={(e) => setCcEmail(e.target.value)} /></Field>
          <Field label="Assigned block">
            <select className={FIELD} value={ccBlock} onChange={(e) => setCcBlock(e.target.value)}>
              <option value="">Select block…</option>
              {['A', 'B', 'C', 'D', 'E'].map((b) => <option key={b} value={b}>Block {b}</option>)}
            </select>
          </Field>
          <Field label="Password"><input className={FIELD} type="password" placeholder="Initial password (min 6 chars)" value={ccPass} onChange={(e) => setCcPass(e.target.value)} /></Field>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setCreateCollectorModalOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1">Add collector</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={createStudentModalOpen} onClose={() => setCreateStudentModalOpen(false)} title="Create new citizen">
        <form onSubmit={handleCreateStudent} className="space-y-3 p-5">
          <Field label="Full name"><input className={FIELD} placeholder="Full name" value={csName} onChange={(e) => setCsName(e.target.value)} /></Field>
          <Field label="Email"><input className={FIELD} type="email" placeholder="name@example.com" value={csEmail} onChange={(e) => setCsEmail(e.target.value)} /></Field>
          <Field label="Area (optional)"><input className={FIELD} placeholder="e.g. Old Market" value={csDept} onChange={(e) => setCsDept(e.target.value)} /></Field>
          <Field label="Password"><input className={FIELD} type="password" placeholder="Initial password" value={csPass} onChange={(e) => setCsPass(e.target.value)} /></Field>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setCreateStudentModalOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1">Create citizen</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={viewModalOpen} onClose={() => setViewModalOpen(false)} title="User profile">
        {viewUserData && (
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">{getInitials(viewUserData.name)}</div>
              <div>
                <h3 className="font-semibold text-foreground">{viewUserData.name}</h3>
                <p className="text-sm text-muted-foreground">{viewUserData.email}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge>{viewUserData.role === 'collector' ? <><Truck className="h-3 w-3" /> Collector</> : <><GraduationCap className="h-3 w-3" /> Citizen</>}</Badge>
                  {viewUserData.role === 'collector' && viewUserData.block && <Badge variant="default"><Building2 className="h-3 w-3" /> Block {viewUserData.block}</Badge>}
                  {viewUserData.dept && <Badge variant="muted">{viewUserData.dept}</Badge>}
                  <Badge variant="warning"><Trophy className="h-3 w-3" /> {viewUserData.rewardPoints || 0} pts</Badge>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={ClipboardList} value={viewUserComplaints.length} label="Complaints" />
              <StatCard icon={Star} value={viewUserData.rewardPoints || 0} label="Reward pts" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
