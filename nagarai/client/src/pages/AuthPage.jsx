import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  MailCheck,
  Lock,
  Eye,
  EyeOff,
  User,
  BookOpen,
  Sparkles,
  Loader2,
  X,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { ImageDithering } from "@paper-design/shaders-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import ThemeToggle from "../components/ui/ThemeToggle";
import { Button } from "../components/ui/Button";
import { forgotPasswordApi } from "../services/api";
import { cn } from "../lib/utils";

const ROLES = [
  { key: "student", label: "Citizen", icon: User },
  { key: "collector", label: "Collector", icon: Sparkles },
  { key: "admin", label: "Admin", icon: Lock },
];

const CYCLE_IMAGES = [
  "/prediction.png",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR8YT275QL5_PxPrn1li38W_EayI5hL5Tqq4cPDtOmzvMLKMbZQcM0JfLI&s=10",
  "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?auto=format&fit=crop&w=1920&q=80",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQEublTfIw_VYG4X3JEyYThZ6eW6ktsDSdLqKjDQ6nTJzuSIl9HRZofcq4&s=10",
];

const transitionVariants = {
  item: {
    hidden: { opacity: 0, filter: "blur(12px)", y: 12 },
    visible: {
      opacity: 1,
      filter: "blur(0px)",
      y: 0,
      transition: { type: "spring", bounce: 0.3, duration: 1.5 },
    },
  },
};

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

  const [selectedRole, setSelectedRole] = useState("student");
  const [activeTab, setActiveTab] = useState("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isAuthMode, setIsAuthMode] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [showPass, setShowPass] = useState(false);

  const [suName, setSuName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suDept, setSuDept] = useState("");
  const [suPass, setSuPass] = useState("");
  const [suConfirm, setSuConfirm] = useState("");

  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [forgotError, setForgotError] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % CYCLE_IMAGES.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    setError("");
    if (role !== "student") setActiveTab("login");
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    if (!loginEmail.trim() || !loginPass)
      return setError("Please provide email and password");
    setLoading(true);
    try {
      await login(loginEmail.trim().toLowerCase(), loginPass, selectedRole);
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleStudentSignup = async (e) => {
    e.preventDefault();
    setError("");
    if (!suName || !suEmail || !suPass || !suConfirm)
      return setError("Please fill in all required fields.");
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(suEmail))
      return setError("Please enter a valid email address.");
    if (suPass.length < 6)
      return setError("Password must be at least 6 characters.");
    if (suPass !== suConfirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      await register({
        name: suName,
        email: suEmail,
        dept: suDept,
        password: suPass,
      });
      showToast("100 points credited — welcome bonus!", "success", 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotError("");
    setForgotSuccess("");
    if (!forgotEmail) return setForgotError("Please provide your email.");
    setForgotLoading(true);
    try {
      const res = await forgotPasswordApi({ email: forgotEmail });
      setForgotSuccess(res.data.message);
    } catch (err) {
      setForgotError(
        err.response?.data?.message ||
          "Request failed. Please verify your details.",
      );
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-background">
      <div className="absolute right-4 top-4 z-50">
        <ThemeToggle />
      </div>

      {/* Left: landing + shader */}
      <div
        className={cn(
          "relative overflow-hidden bg-zinc-950 transition-all duration-700 ease-in-out",
          isAuthMode ? "w-full lg:min-w-3/5" : "min-w-full",
        )}
      >
        <div className="pointer-events-none absolute inset-0 z-0 h-full w-full [&>div]:h-full [&>div]:w-full [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-cover">
          <ImageDithering
            width={1920}
            height={1080}
            image={CYCLE_IMAGES[currentImageIndex]}
            colorBack="#000c38"
            colorFront="#94ffaf"
            colorHighlight="#eaff94"
            originalColors={false}
            inverted={false}
            type="8x8"
            size={2}
            colorSteps={2}
            fit="cover"
          />
        </div>

        <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-r from-zinc-950/60 via-zinc-950/40 to-zinc-950/10" />

        <div className="relative z-20 flex h-full min-h-screen flex-col justify-between p-8 sm:p-12 lg:p-16">
          <div className="flex items-center justify-between">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white backdrop-blur-md">
                <Sparkles className="h-5 w-5" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-white lg:text-3xl">
                NagarAI
              </span>
            </motion.div>

            {isAuthMode && (
              <Button
                variant="ghost"
                onClick={() => setIsAuthMode(false)}
                className="hidden gap-2 text-white hover:bg-white/10 lg:inline-flex"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Home
              </Button>
            )}
          </div>

          <div className="my-auto max-w-4xl space-y-8 py-12">
            <motion.div
              variants={transitionVariants.item}
              initial="hidden"
              animate="visible"
              className="flex flex-wrap gap-2"
            >
              {["Predictive", "Event-aware", "Closed-loop"].map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-zinc-100 backdrop-blur-md"
                >
                  {t}
                </span>
              ))}
            </motion.div>

            <motion.h1
              variants={transitionVariants.item}
              initial="hidden"
              animate="visible"
              className="text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl lg:text-7xl"
            >
              We don&apos;t wait for the city
              <br />
              to become dirty.
            </motion.h1>

            <motion.p
              variants={transitionVariants.item}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.15 }}
              className="max-w-xl text-base font-medium leading-relaxed text-zinc-300 sm:text-lg"
            >
              NagarAI predicts where waste will accumulate before it happens,
              and coordinates bins, vehicles, workers and sweeping teams to
              prevent it.
            </motion.p>

            {!isAuthMode && (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: {
                    transition: { staggerChildren: 0.05, delayChildren: 0.75 },
                  },
                }}
                className="pt-4"
              >
                <motion.div variants={transitionVariants.item}>
                  <Button
                    size="lg"
                    onClick={() => setIsAuthMode(true)}
                    className="group h-14 gap-3 rounded-2xl bg-linear-to-b from-green-400 to-green-500 px-8 text-base font-semibold text-primary-foreground shadow-inner shadow-white/8 transition-all hover:scale-[1.02] hover:opacity-95"
                  >
                    Start Free Trial
                    <span className="block h-5 w-5 overflow-hidden">
                      <span className="flex w-10 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
                        <ArrowRight className="h-5 w-5 shrink-0" />
                        <ArrowRight className="h-5 w-5 shrink-0" />
                      </span>
                    </span>
                  </Button>
                </motion.div>
              </motion.div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-zinc-800/50 pt-6 text-sm font-medium text-green-800">
            <div className="bg-white/90 rounded-2xl">
              <span className="p-2">
                Predictive Municipal Sanitation Intelligence
              </span>
            </div>

            <span>© {new Date().getFullYear()} All rights reserved</span>
          </div>
        </div>
      </div>

      {/* Right: form panel – slides in */}
      <div
        className={cn(
          "absolute right-0 top-0 z-30 flex h-full min-h-screen items-center justify-center bg-background px-6 py-12 transition-all duration-700 ease-in-out lg:relative lg:px-12",
          isAuthMode
            ? "w-full translate-x-0 opacity-100 pointer-events-auto lg:w-2/5"
            : "pointer-events-none hidden w-full translate-x-full opacity-0 lg:flex lg:w-2/5 lg:translate-x-full",
        )}
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="h-5 w-5" />
              </div>
              <span className="text-lg font-bold">NagarAI</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAuthMode(false)}
            >
              Close
            </Button>
          </div>

          <div className="mb-6 flex gap-1 rounded-lg bg-muted p-1">
            {ROLES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => handleRoleSelect(key)}
                className={cn(
                  "relative flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors",
                  selectedRole === key
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {selectedRole === key && (
                  <motion.div
                    layoutId="role-pill"
                    className="absolute inset-0 rounded-md bg-primary"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <span className="relative flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </span>
              </button>
            ))}
          </div>

          <div className="mb-6 flex gap-4 border-b border-border text-sm font-medium">
            <button
              onClick={() => {
                setActiveTab("login");
                setError("");
              }}
              className={cn(
                "relative pb-2.5",
                activeTab === "login"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              Sign In
              {activeTab === "login" && (
                <motion.div
                  layoutId="auth-tab"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-primary"
                />
              )}
            </button>
            {selectedRole === "student" && (
              <button
                onClick={() => {
                  setActiveTab("signup");
                  setError("");
                }}
                className={cn(
                  "relative pb-2.5",
                  activeTab === "signup"
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                Sign Up
                {activeTab === "signup" && (
                  <motion.div
                    layoutId="auth-tab"
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-primary"
                  />
                )}
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === "login" ? (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
              >
                <h1 className="text-2xl font-bold text-foreground">
                  Welcome back
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sign in to continue
                </p>

                {error && (
                  <p className="mt-3 rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-600 dark:text-danger-400">
                    {error}
                  </p>
                )}

                <form onSubmit={handleLogin} className="mt-5 space-y-3.5">
                  <Field
                    icon={Mail}
                    type="text"
                    autoCapitalize="none"
                    placeholder="Email or username"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                  <div className="relative">
                    <Field
                      icon={Lock}
                      type={showPass ? "text" : "password"}
                      placeholder="Password"
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showPass ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotOpen(true);
                        setForgotError("");
                        setForgotSuccess("");
                      }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={loading}
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}{" "}
                    Sign In
                  </Button>
                </form>

                {selectedRole === "student" && (
                  <p className="mt-5 text-center text-sm text-muted-foreground">
                    New here?{" "}
                    <button
                      onClick={() => {
                        setActiveTab("signup");
                        setError("");
                      }}
                      className="font-medium text-primary hover:underline"
                    >
                      Create an account
                    </button>
                  </p>
                )}
                {selectedRole === "collector" && (
                  <p className="mt-5 text-center text-xs text-muted-foreground">
                    Collector accounts are created by an admin.
                  </p>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="signup"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
              >
                <h1 className="text-2xl font-bold text-foreground">
                  Create your account
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Report issues, track cleanups, earn rewards.
                </p>

                {error && (
                  <p className="mt-3 rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-600 dark:text-danger-400">
                    {error}
                  </p>
                )}

                <form onSubmit={handleStudentSignup} className="mt-5 space-y-3">
                  <Field
                    icon={User}
                    placeholder="Full name"
                    value={suName}
                    onChange={(e) => setSuName(e.target.value)}
                  />
                  <Field
                    icon={Mail}
                    type="email"
                    placeholder="Email address"
                    value={suEmail}
                    onChange={(e) => setSuEmail(e.target.value)}
                  />
                  <Field
                    icon={BookOpen}
                    placeholder="Area (optional)"
                    value={suDept}
                    onChange={(e) => setSuDept(e.target.value)}
                  />
                  <Field
                    icon={Lock}
                    type="password"
                    placeholder="Password (min. 6 chars)"
                    value={suPass}
                    onChange={(e) => setSuPass(e.target.value)}
                  />
                  <Field
                    icon={Lock}
                    type="password"
                    placeholder="Confirm password"
                    value={suConfirm}
                    onChange={(e) => setSuConfirm(e.target.value)}
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={loading}
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}{" "}
                    Create Account
                  </Button>
                </form>

                <p className="mt-5 text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <button
                    onClick={() => {
                      setActiveTab("login");
                      setError("");
                    }}
                    className="font-medium text-primary hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            NagarAI v1.0 · Predictive Municipal Sanitation
          </p>
        </motion.div>
      </div>

      <AnimatePresence>
        {isForgotOpen && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsForgotOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-sm rounded-xl bg-card p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-foreground">
                  Reset password
                </h3>
                <button
                  onClick={() => setIsForgotOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {forgotSuccess ? (
                <div className="text-center">
                  <MailCheck className="mx-auto h-10 w-10 text-brand-500" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    {forgotSuccess}
                  </p>
                  <Button
                    className="mt-4 w-full"
                    onClick={() => setIsForgotOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    We&apos;ll send reset instructions to your registered email.
                  </p>
                  {forgotError && (
                    <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-xs text-danger-600 dark:text-danger-400">
                      {forgotError}
                    </p>
                  )}
                  <Field
                    icon={Mail}
                    type="email"
                    placeholder="Email address"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={forgotLoading}
                  >
                    {forgotLoading && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}{" "}
                    Send reset instructions
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
