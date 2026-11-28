"use client";

import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from "react";
import {
  UserRound,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  Bell,
  Camera,
  Save,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sun,
  Moon,
  Laptop,
  Copy,
  Check,
  Shield,
  Building2,
  UserCog,
  Sparkles,
  Lock,
  BadgeCheck,
  Award,
  FileText,
  Clock,
  ArrowRight,
} from "lucide-react";
import PinManagementSection from "./PinManagementSection";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { UserRole, CustomerStatus } from "@/types";

interface UserProfileData {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: CustomerStatus;
  image: string | null;
  phone?: string | null;
  address?: string | null;
  preferences?: {
    theme?: "light" | "dark" | "system";
    transactionAlerts?: boolean;
    depositUpdates?: boolean;
    withdrawalUpdates?: boolean;
    loanUpdates?: boolean;
    securityAlerts?: boolean;
    promotionalEmails?: boolean;
  } | null;
}

interface UnifiedProfileProps {
  role: UserRole;
}

export default function UnifiedProfileView({ role }: UnifiedProfileProps) {
  const { theme: currentGlobalTheme, setTheme: setGlobalTheme } = useTheme();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Copy ID feedback
  const [copiedId, setCopiedId] = useState(false);

  // Preferences
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [notifications, setNotifications] = useState({
    transactionAlerts: true,
    depositUpdates: true,
    withdrawalUpdates: true,
    loanUpdates: true,
    securityAlerts: true,
    promotionalEmails: false,
  });

  // Avatar file upload & preview
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Status feedback
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchProfile = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/auth/me");
      const data = await res.json();

      if (data.success && data.user) {
        const u = data.user as UserProfileData;
        setProfile(u);
        setName(u.name || "");
        setPhone(u.phone || "");
        setAddress(u.address || "");
        if (u.preferences) {
          if (u.preferences.theme) {
            setTheme(u.preferences.theme);
            setGlobalTheme(u.preferences.theme);
          }
          setNotifications((prev) => ({
            ...prev,
            ...u.preferences,
          }));
        }
      } else {
        setErrorMessage(data.error || "Failed to load profile.");
      }
    } catch {
      setErrorMessage("Network error loading profile. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const clearMessages = () => {
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  // Handle personal information save
  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!name.trim() || name.trim().length < 2) {
      setErrorMessage("Name must be at least 2 characters.");
      return;
    }

    try {
      setIsSaving(true);
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          preferences: {
            theme,
            ...notifications,
          },
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        setErrorMessage(result.error || "Failed to save profile changes.");
        return;
      }

      setProfile(result.user);
      setIsEditing(false);
      setSuccessMessage("Profile information updated successfully.");
    } catch {
      setErrorMessage("Network error saving profile changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Avatar file selection
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    clearMessages();
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrorMessage("Only JPEG, PNG, or WebP images are supported.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage("Image file cannot exceed 2MB.");
      return;
    }

    setPendingFile(file);
    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);
  };

  // Confirm avatar upload
  const handleUploadAvatar = async () => {
    if (!pendingFile) return;
    clearMessages();

    try {
      setIsUploadingAvatar(true);
      const formData = new FormData();
      formData.append("file", pendingFile);

      const res = await fetch("/api/auth/me/avatar", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        setErrorMessage(result.error || "Failed to upload avatar.");
        return;
      }

      setProfile((prev) => (prev ? { ...prev, image: result.image } : null));
      setPendingFile(null);
      setAvatarPreview(null);
      setSuccessMessage("Profile picture updated successfully.");
    } catch {
      setErrorMessage("Network error uploading profile image.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Cancel avatar preview
  const handleCancelAvatar = () => {
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarPreview(null);
    setPendingFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Remove profile picture
  const handleRemoveAvatar = async () => {
    if (!confirm("Are you sure you want to remove your profile picture?")) return;
    clearMessages();

    try {
      setIsUploadingAvatar(true);
      const res = await fetch("/api/auth/me/avatar", {
        method: "DELETE",
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        setErrorMessage(result.error || "Failed to remove avatar.");
        return;
      }

      setProfile((prev) => (prev ? { ...prev, image: null } : null));
      setSuccessMessage("Profile picture removed successfully.");
    } catch {
      setErrorMessage("Network error removing avatar.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Toggle notification preference
  const toggleNotification = async (key: keyof typeof notifications) => {
    const updated = {
      ...notifications,
      [key]: !notifications[key],
    };
    setNotifications(updated);

    try {
      await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: {
            theme,
            ...updated,
          },
        }),
      });
      setSuccessMessage("Preference updated.");
    } catch {
      // silently keep local state
    }
  };

  // Save theme preference
  const selectTheme = async (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme);
    setGlobalTheme(newTheme);
    try {
      await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: {
            theme: newTheme,
            ...notifications,
          },
        }),
      });
      setSuccessMessage("Theme preference saved.");
    } catch {
      // silently keep local state
    }
  };

  const copyIdToClipboard = () => {
    if (!profile?.id) return;
    navigator.clipboard.writeText(profile.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Role Meta Configuration
  const roleConfig = {
    customer: {
      portalTitle: "Customer Banking Portal",
      roleBadge: "Verified Bank Customer",
      badgeColor: "bg-blue-50 text-[#3F72AF] border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
      accentGrad: "from-[#112D4E] via-[#1D4168] to-[#3F72AF]",
      tagline: "Manage your personal banking profile, financial security, and notifications.",
      idLabel: "Customer Account ID",
      authorityLevel: "Standard Retail Banking Access",
      roleIcon: UserRound,
    },
    "banking-staff": {
      portalTitle: "Banking Operations Portal",
      roleBadge: "Authorized Operations Officer",
      badgeColor: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800",
      accentGrad: "from-[#0F243A] via-[#113C5E] to-[#1E6B7B]",
      tagline: "Manage your banking staff credentials, operational clearance, and system preferences.",
      idLabel: "Staff Officer Badge ID",
      authorityLevel: "Level 2 Operational Clearance",
      roleIcon: Building2,
    },
    admin: {
      portalTitle: "Executive Administration Portal",
      roleBadge: "System Executive Administrator",
      badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800",
      accentGrad: "from-[#091524] via-[#112D4E] to-[#4338CA]",
      tagline: "Manage platform administration credentials, master governance, and security directives.",
      idLabel: "Administrator UUID",
      authorityLevel: "Tier 1 Full Platform Superadmin",
      roleIcon: UserCog,
    },
  }[role] || {
    portalTitle: "Digital Banking Portal",
    roleBadge: "Account Holder",
    badgeColor: "bg-blue-50 text-[#3F72AF] border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
    accentGrad: "from-[#112D4E] via-[#1D4168] to-[#3F72AF]",
    tagline: "Manage your profile, preferences, and account security.",
    idLabel: "User ID",
    authorityLevel: "Standard Access",
    roleIcon: UserRound,
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#3F72AF] shadow-xs">
          <Loader2 className="animate-spin" size={24} />
        </div>
        <p className="text-sm font-medium text-[#112D4E]">Loading your profile...</p>
        <p className="text-xs text-gray-500">Retrieving encrypted credentials from Trustora Core</p>
      </div>
    );
  }

  const currentImage = avatarPreview || profile?.image || null;
  const initials = profile?.name
    ? profile.name
        .split(" ")
        .filter(Boolean)
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "TB";

  return (
    <div className="min-h-screen bg-[#F8FAFD] pb-12 pt-6 sm:pb-16 sm:pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Top Breadcrumb & Page Title */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#3F72AF]">
              <span>{roleConfig.portalTitle}</span>
              <span className="text-gray-300">•</span>
              <span className="text-gray-500">Security & Credentials</span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#112D4E] sm:text-3xl">
              Profile & Account Settings
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-gray-500">
              {roleConfig.tagline}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Status: {profile?.status || "ACTIVE"}
            </span>
          </div>
        </div>

        {/* Feedback Banners */}
        {successMessage && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-xs sm:text-sm text-emerald-800 shadow-xs transition animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
              <span className="font-medium">{successMessage}</span>
            </div>
            <button
              type="button"
              onClick={clearMessages}
              className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-xs sm:text-sm text-rose-800 shadow-xs transition animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-2.5">
              <AlertCircle size={18} className="shrink-0 text-rose-600" />
              <span className="font-medium">{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={clearMessages}
              className="text-rose-700 hover:text-rose-900 text-xs font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Hero Profile Banner Card */}
        <section className="relative overflow-hidden rounded-3xl border border-[#DBE2EF]/80 bg-white shadow-xs dark:bg-[#112338] dark:border-[#1E3A5F]">
          {/* Header Gradient Backdrop */}
          <div className={`h-40 sm:h-48 md:h-52 w-full bg-gradient-to-r ${roleConfig.accentGrad} relative`}>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.18),transparent_65%)]" />
            <div className="absolute top-4 right-4 hidden sm:flex items-center gap-2 bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20 text-xs font-medium text-white shadow-xs">
              <ShieldCheck size={14} className="text-emerald-300" />
              <span>Trustora Secure Session Verified</span>
            </div>
          </div>

          {/* Profile Card Body */}
          <div className="px-5 pb-7 sm:px-8 sm:pb-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              
              {/* Left Column: Avatar + Identity Details */}
              <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 text-center sm:text-left">
                
                {/* Avatar with Camera badge */}
                <div className="relative group shrink-0 -mt-16 sm:-mt-20">
                  <div className="relative flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-gradient-to-br from-[#112D4E] to-[#3F72AF] text-3xl font-extrabold text-white shadow-lg ring-1 ring-black/5 dark:border-[#112338] dark:ring-white/10">
                    {currentImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={currentImage}
                        alt={profile?.name || "User Avatar"}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <span className="tracking-wider">{initials}</span>
                    )}

                    {/* Pending upload overlay */}
                    {pendingFile && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white backdrop-blur-[2px]">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-[#3F72AF] rounded-md">Preview</span>
                      </div>
                    )}
                  </div>

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  {/* Camera button trigger */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Upload profile photo"
                    title="Upload profile photo (JPEG, PNG, WebP up to 2MB)"
                    disabled={isUploadingAvatar}
                    className="absolute -bottom-1 -right-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-2 border-white bg-[#3F72AF] text-white shadow-md transition duration-200 hover:bg-[#112D4E] hover:scale-105 dark:border-[#112338]"
                  >
                    <Camera size={16} />
                  </button>
                </div>

                {/* Identity Info — Clearly below banner with clean vertical stacking */}
                <div className="space-y-1.5 pt-2 sm:pt-4">
                  {/* Name + Role Badge */}
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#112D4E] dark:text-white">
                      {profile?.name || "Valued User"}
                    </h2>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${roleConfig.badgeColor}`}>
                      <BadgeCheck size={12} />
                      {roleConfig.roleBadge}
                    </span>
                  </div>

                  {/* Email address completely beneath name */}
                  <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs sm:text-sm text-gray-500 font-medium dark:text-gray-300">
                    <Mail size={13} className="shrink-0 text-[#3F72AF] dark:text-blue-400" />
                    <span>{profile?.email}</span>
                  </div>

                  {/* Identifier & Authority Badge */}
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1 text-xs text-gray-500 dark:text-gray-400">
                    <div className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 border border-gray-200/80 px-2.5 py-1 font-mono text-[11px] dark:bg-gray-800/80 dark:border-gray-700">
                      <span className="text-gray-400 dark:text-gray-400">{roleConfig.idLabel}:</span>
                      <span className="font-semibold text-gray-700 dark:text-gray-200">{profile?.id?.slice(0, 12)}...</span>
                      <button
                        type="button"
                        onClick={copyIdToClipboard}
                        className="ml-1 text-gray-400 hover:text-[#3F72AF] dark:hover:text-blue-400 cursor-pointer"
                        title="Copy full identifier"
                      >
                        {copiedId ? <Check size={12} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={12} />}
                      </button>
                    </div>

                    <span className="hidden sm:inline-block text-gray-300 dark:text-gray-600">•</span>
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                      {roleConfig.authorityLevel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons for Avatar */}
              <div className="flex flex-wrap items-center justify-center md:justify-end gap-2.5 pt-2 md:pt-0 shrink-0">
                {pendingFile ? (
                  <div className="flex items-center gap-2 p-1.5 bg-blue-50/80 rounded-2xl border border-blue-200 dark:bg-blue-950/40 dark:border-blue-900">
                    <button
                      type="button"
                      onClick={handleUploadAvatar}
                      disabled={isUploadingAvatar}
                      className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#3F72AF] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#112D4E] disabled:opacity-50"
                    >
                      {isUploadingAvatar ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        <Save size={14} />
                      )}
                      Save Avatar
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelAvatar}
                      disabled={isUploadingAvatar}
                      className="cursor-pointer rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Discard
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#DBE2EF] bg-white px-3.5 py-2 text-xs font-semibold text-[#112D4E] shadow-xs transition hover:bg-gray-50 dark:bg-[#0F1F33] dark:border-[#1E3A5F] dark:text-gray-200 dark:hover:bg-[#162D4A]"
                    >
                      <Camera size={14} className="text-[#3F72AF] dark:text-blue-400" />
                      Update Picture
                    </button>

                    {profile?.image && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        disabled={isUploadingAvatar}
                        className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/50 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100/60 dark:bg-rose-950/30 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/50"
                        title="Remove uploaded picture"
                      >
                        <Trash2 size={13} />
                        Remove
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 2-Column Responsive Content Grid */}
        <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-3">
          
          {/* Main 2-Span Column: Personal Info & Role-Specific Sections */}
          <div className="space-y-8 xl:col-span-2">
            
            {/* 1. Personal Information Form */}
            <section className="rounded-3xl border border-[#DBE2EF]/80 bg-white p-6 sm:p-7 shadow-xs">
              <div className="flex flex-col justify-between gap-4 border-b border-gray-100 pb-5 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#3F72AF] shadow-xs">
                    <UserRound size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#112D4E]">
                      Personal Information
                    </h2>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Authoritative legal identity and verified contact channels
                    </p>
                  </div>
                </div>

                {!isEditing ? (
                  <button
                    type="button"
                    onClick={() => {
                      clearMessages();
                      setIsEditing(true);
                    }}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#112D4E] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1D4168]"
                  >
                    Edit Information
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setName(profile?.name || "");
                      setPhone(profile?.phone || "");
                      setAddress(profile?.address || "");
                    }}
                    className="cursor-pointer rounded-xl border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveProfile} className="mt-6 space-y-6">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  
                  {/* Full Name */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-[#112D4E]">
                      <UserRound size={13} className="text-[#3F72AF]" />
                      Legal Full Name
                    </label>
                    <input
                      type="text"
                      disabled={!isEditing}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm transition outline-none ${
                        isEditing
                          ? "border-[#3F72AF] bg-white text-[#112D4E] focus:ring-2 focus:ring-[#3F72AF]/20"
                          : "border-gray-200 bg-gray-50 text-gray-700 cursor-not-allowed"
                      }`}
                    />
                    <p className="text-[11px] text-gray-400">Must match government-issued identification</p>
                  </div>

                  {/* Registered Email (read-only) */}
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between text-xs font-semibold text-[#112D4E]">
                      <span className="flex items-center gap-1.5">
                        <Mail size={13} className="text-[#3F72AF]" />
                        Registered Email Address
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-gray-400 font-normal">
                        <Lock size={10} /> Read-only
                      </span>
                    </label>
                    <input
                      type="email"
                      disabled
                      value={profile?.email || ""}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50/80 px-3.5 py-2.5 text-sm font-medium text-gray-500 cursor-not-allowed"
                    />
                    <p className="text-[11px] text-gray-400">
                      Primary login identifier (protected by security policy)
                    </p>
                  </div>

                  {/* Phone */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-[#112D4E]">
                      <Phone size={13} className="text-[#3F72AF]" />
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      disabled={!isEditing}
                      placeholder="+880 1XXX-XXXXXX"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm transition outline-none ${
                        isEditing
                          ? "border-[#3F72AF] bg-white text-[#112D4E] focus:ring-2 focus:ring-[#3F72AF]/20"
                          : "border-gray-200 bg-gray-50 text-gray-700 cursor-not-allowed"
                      }`}
                    />
                    <p className="text-[11px] text-gray-400">Used for transactional notices & security verification</p>
                  </div>

                  {/* Address */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-[#112D4E]">
                      <MapPin size={13} className="text-[#3F72AF]" />
                      {role === "customer" ? "Residential Address" : "Registered Office / Address"}
                    </label>
                    <input
                      type="text"
                      disabled={!isEditing}
                      placeholder="Street, City, Postal Code"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm transition outline-none ${
                        isEditing
                          ? "border-[#3F72AF] bg-white text-[#112D4E] focus:ring-2 focus:ring-[#3F72AF]/20"
                          : "border-gray-200 bg-gray-50 text-gray-700 cursor-not-allowed"
                      }`}
                    />
                    <p className="text-[11px] text-gray-400">Official statement mailing & billing address</p>
                  </div>
                </div>

                {/* Save button toolbar */}
                {isEditing && (
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setName(profile?.name || "");
                        setPhone(profile?.phone || "");
                        setAddress(profile?.address || "");
                      }}
                      className="cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
                    >
                      Discard Changes
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="flex cursor-pointer items-center gap-2 rounded-xl bg-[#112D4E] px-6 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1D4168] disabled:opacity-50"
                    >
                      {isSaving ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        <Save size={14} />
                      )}
                      Save Changes
                    </button>
                  </div>
                )}
              </form>
            </section>

            {/* 2. ROLE-SPECIFIC PANELS */}

            {/* Customer: Transaction PIN Security */}
            {role === "customer" && <PinManagementSection />}

            {/* Banking Staff: Operational Authority & Governance */}
            {role === "banking-staff" && (
              <section className="rounded-3xl border border-teal-200/80 bg-gradient-to-br from-white to-teal-50/20 p-6 sm:p-7 shadow-xs">
                <div className="flex items-center gap-3 border-b border-teal-100 pb-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 shadow-xs">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#112D4E]">
                      Banking Staff Authority & Clearance
                    </h2>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Operational assignments, compliance boundaries, and authorized workflows
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-teal-100 bg-white p-4 shadow-xs">
                    <div className="flex items-center gap-2 text-xs font-medium text-teal-700">
                      <ShieldCheck size={16} />
                      <span>Staff Clearance</span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-[#112D4E]">Level 2 Verification</p>
                    <p className="mt-1 text-[11px] text-gray-500">Deposit & Withdrawal Queue Approval</p>
                  </div>

                  <div className="rounded-2xl border border-teal-100 bg-white p-4 shadow-xs">
                    <div className="flex items-center gap-2 text-xs font-medium text-teal-700">
                      <FileText size={16} />
                      <span>Loan Processing</span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-[#112D4E]">Review & Forward</p>
                    <p className="mt-1 text-[11px] text-gray-500">Escalate credit checks to Admin</p>
                  </div>

                  <div className="rounded-2xl border border-teal-100 bg-white p-4 shadow-xs">
                    <div className="flex items-center gap-2 text-xs font-medium text-teal-700">
                      <Award size={16} />
                      <span>Branch Operations</span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-[#112D4E]">Trustora Central Operations</p>
                    <p className="mt-1 text-[11px] text-gray-500">Active Workstation Assigned</p>
                  </div>
                </div>

                {/* Staff Invariants */}
                <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
                  <h4 className="text-xs font-bold text-[#112D4E]">Operational Compliance Invariants</h4>
                  <ul className="mt-2.5 space-y-2 text-xs text-gray-600">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-teal-600 shrink-0" />
                      <span><strong>Self-Review Restriction:</strong> Staff members are strictly prohibited from approving their own financial requests.</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-teal-600 shrink-0" />
                      <span><strong>Dual-Control Integrity:</strong> High-value transactions and credit requests require multi-stage admin endorsement.</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-teal-600 shrink-0" />
                      <span><strong>Audit Logging:</strong> Every request processing decision is immutably logged with timestamp and officer ID.</span>
                    </li>
                  </ul>
                </div>
              </section>
            )}

            {/* Admin: Executive Governance & Platform Invariants */}
            {role === "admin" && (
              <section className="rounded-3xl border border-indigo-200/80 bg-gradient-to-br from-white to-indigo-50/20 p-6 sm:p-7 shadow-xs">
                <div className="flex items-center gap-3 border-b border-indigo-100 pb-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 shadow-xs">
                    <UserCog size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#112D4E]">
                      Executive Platform Governance
                    </h2>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Root privileges, ledger auditing, and systemic risk controls
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-xs">
                    <div className="flex items-center gap-2 text-xs font-medium text-indigo-700">
                      <Shield size={16} />
                      <span>Administrative Scope</span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-[#112D4E]">Platform Superadmin</p>
                    <p className="mt-1 text-[11px] text-gray-500">Full read/write policy execution</p>
                  </div>

                  <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-xs">
                    <div className="flex items-center gap-2 text-xs font-medium text-indigo-700">
                      <Sparkles size={16} />
                      <span>Credit Authority</span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-[#112D4E]">Final Loan Approvals</p>
                    <p className="mt-1 text-[11px] text-gray-500">Disbursement & ledger commitments</p>
                  </div>

                  <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-xs">
                    <div className="flex items-center gap-2 text-xs font-medium text-indigo-700">
                      <Lock size={16} />
                      <span>Security Guard</span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-[#112D4E]">Elevated Protection</p>
                    <p className="mt-1 text-[11px] text-gray-500">Session isolation active</p>
                  </div>
                </div>

                {/* Admin Safeguards */}
                <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
                  <h4 className="text-xs font-bold text-[#112D4E]">Platform Governance Invariants</h4>
                  <ul className="mt-2.5 space-y-2 text-xs text-gray-600">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-indigo-600 shrink-0" />
                      <span><strong>Immutable Ledger:</strong> All balance updates execute with strict transactional consistency and database ACID compliance.</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-indigo-600 shrink-0" />
                      <span><strong>Role-Based Access Enforcement:</strong> Route-level proxy and API middleware enforce strict session claims.</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-indigo-600 shrink-0" />
                      <span><strong>Financial Integrity:</strong> Negative balance prevention and double-entry reconciliation running continuously.</span>
                    </li>
                  </ul>
                </div>
              </section>
            )}

            {/* 3. Communication & Notification Matrix */}
            <section className="rounded-3xl border border-[#DBE2EF]/80 bg-white p-6 sm:p-7 shadow-xs">
              <div className="flex items-center gap-3 border-b border-gray-100 pb-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 shadow-xs">
                  <Bell size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#112D4E]">
                    Notification & Alert Preferences
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Control which real-time notices and email advisories are delivered to you
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {[
                  {
                    key: "transactionAlerts" as const,
                    title: "Financial Transaction Alerts",
                    desc: "Real-time updates whenever debits, credits, or transfers occur",
                    badge: "Instant",
                  },
                  {
                    key: "depositUpdates" as const,
                    title: "Deposit Review Updates",
                    desc: "Notifications when cash deposits are inspected, verified, and credited",
                    badge: "Operations",
                  },
                  {
                    key: "withdrawalUpdates" as const,
                    title: "Withdrawal Settlement Updates",
                    desc: "Alerts when payout requests pass staff review and reach settlement",
                    badge: "Operations",
                  },
                  {
                    key: "loanUpdates" as const,
                    title: "Loan Processing & Approvals",
                    desc: "Status updates across loan applications, review notes, and disbursements",
                    badge: "Credit",
                  },
                  {
                    key: "securityAlerts" as const,
                    title: "Security & Login Notices",
                    desc: "Immediate security alerts for new device logins, password or PIN modifications",
                    badge: "Critical",
                  },
                  {
                    key: "promotionalEmails" as const,
                    title: "Financial Insights & Product News",
                    desc: "Periodic updates on Trustora Bank savings rates, new features, and services",
                    badge: "Optional",
                  },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-gray-100 p-4 transition hover:bg-gray-50/70"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-semibold text-[#112D4E]">
                          {item.title}
                        </span>
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                          {item.badge}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{item.desc}</p>
                    </div>

                    <label className="relative inline-flex cursor-pointer items-center shrink-0">
                      <input
                        type="checkbox"
                        checked={notifications[item.key]}
                        onChange={() => toggleNotification(item.key)}
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#3F72AF] peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                    </label>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column: Theme & Credentials Summary */}
          <div className="space-y-8">
            
            {/* Theme Preference */}
            <section className="rounded-3xl border border-[#DBE2EF]/80 bg-white p-6 shadow-xs">
              <div className="flex items-center gap-2.5">
                <Sun size={18} className="text-[#3F72AF]" />
                <h3 className="font-bold text-[#112D4E] text-sm">Interface Appearance</h3>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Choose how Trustora Bank renders on your device
              </p>

              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {[
                  { id: "light" as const, label: "Light", icon: Sun },
                  { id: "dark" as const, label: "Dark", icon: Moon },
                  { id: "system" as const, label: "System", icon: Laptop },
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = (currentGlobalTheme || theme) === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectTheme(item.id)}
                      className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border p-3.5 text-xs font-semibold transition ${
                        isSelected
                          ? "border-[#3F72AF] bg-blue-50/70 text-[#3F72AF] shadow-xs"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Account Credentials & Authority Summary */}
            <section className="rounded-3xl border border-[#DBE2EF]/80 bg-white p-6 shadow-xs">
              <div className="flex items-center gap-2.5">
                <ShieldCheck size={18} className="text-emerald-600" />
                <h3 className="font-bold text-[#112D4E] text-sm">Account & Authority</h3>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Verified security status and identity tokens
              </p>

              <div className="mt-5 space-y-3.5 text-xs">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <span className="text-gray-500">System Role</span>
                  <span className="font-semibold uppercase tracking-wider text-[#112D4E]">
                    {profile?.role}
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <span className="text-gray-500">Account Standing</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {profile?.status || "ACTIVE"}
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <span className="text-gray-500">Session Security</span>
                  <span className="font-medium text-gray-700">Encrypted (TLS 1.3)</span>
                </div>

                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <span className="text-gray-500">System Clearance</span>
                  <span className="font-medium text-[#3F72AF]">{roleConfig.authorityLevel}</span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-gray-500">Unique Identity</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-gray-700 text-[11px]">
                      {profile?.id?.slice(0, 10)}...
                    </span>
                    <button
                      type="button"
                      onClick={copyIdToClipboard}
                      className="text-gray-400 hover:text-[#3F72AF] cursor-pointer"
                      title="Copy full ID"
                    >
                      {copiedId ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Quick Security Tips */}
            <section className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50/60 to-white p-6 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-bold text-[#112D4E]">
                <ShieldCheck size={16} className="text-[#3F72AF]" />
                <span>Trustora Security Commitment</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-gray-600">
                Trustora Bank uses industry-grade encryption, role-level proxies, and isolated transactional ledgers to safeguard your digital banking operations. Never share your credentials or PIN with anyone.
              </p>
            </section>

          </div>
        </div>

      </div>
    </div>
  );
}
