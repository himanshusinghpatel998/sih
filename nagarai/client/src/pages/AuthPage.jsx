import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, MailCheck, Lock, Eye, EyeOff, User, BookOpen, Sparkles, Loader2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ThemeToggle from '../components/ui/ThemeToggle';
import { Button } from '../components/ui/Button';
import { forgotPasswordApi } from '../services/api';
import { cn } from '../lib/utils';

const ROLES = [
  { key: 'student', label: 'Citizen', icon: User },
  { key: 'collector', label: 'Collector', icon: Sparkles },
  { key: 'admin', label: 'Admin', icon: Lock },
];

function Field({ icon: Icon, ...props }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-3 text-sm text-foreground outline-none ring-brand-400 transition-shadow placeholder:text-muted-foreground focus:ring-2"
        {...props}
      />
    </div>
  );
}

export default function AuthPage() {
  const { login, register } = useAuth();
  const { showToast } = useToast();

  const [selectedRole, setSelectedRole] = useState('student');
  const [activeTab, setActiveTab] = useState('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [suName, setSuName] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suDept, setSuDept] = useState('');
  const [suPass, setSuPass] = useState('');
  const [suConfirm, setSuConfirm] = useState('');

  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotError, setForgotError] = useState('');

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    setError('');
    if (role !== 'student') setActiveTab('login');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!loginEmail.trim() || !loginPass) return setError('Please provide email and password');
    setLoading(true);
    try {
      await login(loginEmail.trim().toLowerCase(), loginPass, selectedRole);
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleStudentSignup = async (e) => {
    e.preventDefault();
    setError('');
    if (!suName || !suEmail || !suPass || !suConfirm) return setError('Please fill in all required fields.');
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(suEmail)) return setError('Please enter a valid email address.');
    if (suPass.length < 6) return setError('Password must be at least 6 characters.');
    if (suPass !== suConfirm) return setError('Passwords do not match.');
    setLoading(true);
    try {
      await register({ name: suName, email: suEmail, dept: suDept, password: suPass });
      showToast('100 points credited — welcome bonus!', 'success', 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotError(''); setForgotSuccess('');
    if (!forgotEmail) return setForgotError('Please provide your email.');
    setForgotLoading(true);
    try {
      const res = await forgotPasswordApi({ email: forgotEmail });
      setForgotSuccess(res.data.message);
    } catch (err) {
      setForgotError(err.response?.data?.message || 'Request failed. Please verify your details.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen bg-background">
      <ThemeToggle className="absolute right-4 top-4 z-20" />

      {/* Left: brand panel */}
      <div className="relative hidden w-1/2 overflow-hidden bg-brand-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0">
          {[
            { size: 320, top: '-10%', left: '-5%', delay: 0 },
            { size: 240, top: '55%', left: '65%', delay: 1.2 },
            { size: 180, top: '20%', left: '75%', delay: 2.1 },
          ].map((b, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full bg-brand-500/20 blur-3xl"
              style={{ width: b.size, height: b.size, top: b.top, left: b.left }}
              animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 8, repeat: Infinity, delay: b.delay, ease: 'easeInOut' }}
            />
          ))}
        </div>

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="relative flex items-center gap-2 text-brand-50">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white"><Sparkles className="h-5 w-5" /></div>
          <span className="text-lg font-bold">NagarAI</span>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="relative">
          <h1 className="text-4xl font-bold leading-tight text-white">
            We don't wait for the city<br />to become dirty.
          </h1>
          <p className="mt-4 max-w-md text-brand-200">
            NagarAI predicts where waste will accumulate before it happens, and coordinates bins,
            vehicles, workers and sweeping teams to prevent it.
          </p>
          <div className="mt-6 flex gap-2">
            {['Predictive', 'Event-aware', 'Closed-loop'].map((t) => (
              <span key={t} className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-100 ring-1 ring-inset ring-white/10">{t}</span>
            ))}
          </div>
        </motion.div>

        <p className="relative text-xs text-brand-300">Predictive Municipal Sanitation Intelligence</p>
      </div>

      {/* Right: form panel */}
      <div className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-sm">
          <div className="mb-6 flex gap-1 rounded-lg bg-muted p-1">
            {ROLES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => handleRoleSelect(key)}
                className={cn(
                  'relative flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors',
                  selectedRole === key ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {selectedRole === key && (
                  <motion.div layoutId="role-pill" className="absolute inset-0 rounded-md bg-primary" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />
                )}
                <span className="relative flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{label}</span>
              </button>
            ))}
          </div>

          <div className="mb-6 flex gap-4 border-b border-border text-sm font-medium">
            <button
              onClick={() => { setActiveTab('login'); setError(''); }}
              className={cn('relative pb-2.5', activeTab === 'login' ? 'text-foreground' : 'text-muted-foreground')}
            >
              Sign In
              {activeTab === 'login' && <motion.div layoutId="auth-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
            </button>
            {selectedRole === 'student' && (
              <button
                onClick={() => { setActiveTab('signup'); setError(''); }}
                className={cn('relative pb-2.5', activeTab === 'signup' ? 'text-foreground' : 'text-muted-foreground')}
              >
                Sign Up
                {activeTab === 'signup' && <motion.div layoutId="auth-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'login' ? (
              <motion.div key="login" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
                <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
                <p className="mt-1 text-sm text-muted-foreground">Sign in to continue</p>

                {error && <p className="mt-3 rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-600 dark:text-danger-400">{error}</p>}

                <form onSubmit={handleLogin} className="mt-5 space-y-3.5">
                  <Field icon={Mail} type="text" autoCapitalize="none" placeholder="Email or username" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                  <div className="relative">
                    <Field icon={Lock} type={showPass ? 'text' : 'password'} placeholder="Password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} />
                    <button type="button" onClick={() => setShowPass((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="text-right">
                    <button type="button" onClick={() => { setIsForgotOpen(true); setForgotError(''); setForgotSuccess(''); }} className="text-xs font-medium text-primary hover:underline">
                      Forgot password?
                    </button>
                  </div>
                  <Button type="submit" className="w-full" size="lg" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />} Sign In
                  </Button>
                </form>

                {selectedRole === 'student' && (
                  <p className="mt-5 text-center text-sm text-muted-foreground">
                    New here? <button onClick={() => { setActiveTab('signup'); setError(''); }} className="font-medium text-primary hover:underline">Create an account</button>
                  </p>
                )}
                {selectedRole === 'collector' && (
                  <p className="mt-5 text-center text-xs text-muted-foreground">Collector accounts are created by an admin.</p>
                )}
              </motion.div>
            ) : (
              <motion.div key="signup" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
                <h1 className="text-2xl font-bold text-foreground">Create your account</h1>
                <p className="mt-1 text-sm text-muted-foreground">Report issues, track cleanups, earn rewards.</p>

                {error && <p className="mt-3 rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-600 dark:text-danger-400">{error}</p>}

                <form onSubmit={handleStudentSignup} className="mt-5 space-y-3">
                  <Field icon={User} placeholder="Full name" value={suName} onChange={(e) => setSuName(e.target.value)} />
                  <Field icon={Mail} type="email" placeholder="Email address" value={suEmail} onChange={(e) => setSuEmail(e.target.value)} />
                  <Field icon={BookOpen} placeholder="Department (optional)" value={suDept} onChange={(e) => setSuDept(e.target.value)} />
                  <Field icon={Lock} type="password" placeholder="Password (min. 6 chars)" value={suPass} onChange={(e) => setSuPass(e.target.value)} />
                  <Field icon={Lock} type="password" placeholder="Confirm password" value={suConfirm} onChange={(e) => setSuConfirm(e.target.value)} />
                  <Button type="submit" className="w-full" size="lg" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />} Create Account
                  </Button>
                </form>

                <p className="mt-5 text-center text-sm text-muted-foreground">
                  Already have an account? <button onClick={() => { setActiveTab('login'); setError(''); }} className="font-medium text-primary hover:underline">Sign in</button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-8 text-center text-xs text-muted-foreground">NagarAI v1.0 · Predictive Municipal Sanitation</p>
        </motion.div>
      </div>

      {/* Forgot password modal */}
      <AnimatePresence>
        {isForgotOpen && (
          <motion.div
            className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setIsForgotOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-sm rounded-xl bg-card p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Reset password</h3>
                <button onClick={() => setIsForgotOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              {forgotSuccess ? (
                <div className="text-center">
                  <MailCheck className="mx-auto h-10 w-10 text-brand-500" />
                  <p className="mt-3 text-sm text-muted-foreground">{forgotSuccess}</p>
                  <Button className="mt-4 w-full" onClick={() => setIsForgotOpen(false)}>Close</Button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-3">
                  <p className="text-xs text-muted-foreground">We'll send reset instructions to your registered email.</p>
                  {forgotError && <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-xs text-danger-600 dark:text-danger-400">{forgotError}</p>}
                  <Field icon={Mail} type="email" placeholder="Email address" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
                  <Button type="submit" className="w-full" disabled={forgotLoading}>
                    {forgotLoading && <Loader2 className="h-4 w-4 animate-spin" />} Send reset instructions
                  </Button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
