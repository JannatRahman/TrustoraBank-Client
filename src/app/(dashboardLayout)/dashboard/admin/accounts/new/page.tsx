"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Wallet,
  UserRound,
  Mail,
  Phone,
  Building2,
  CreditCard,
  CircleDollarSign,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Plus,
  Copy,
  Loader2,
  Users,
  UserPlus,
  Info,
  Check,
} from "lucide-react";

interface RegisteredCustomer {
  _id?: string;
  id?: string;
  name: string;
  email: string;
  phone?: string;
  status?: string;
  role?: string;
}

const branches = [
  "Central Clearing Operations",
  "Dhanmondi Branch",
  "Gulshan Branch",
  "Uttara Branch",
  "Banani Branch",
  "Mirpur Branch",
  "Mohakhali Branch",
];

type AccountTypeChoice = "SAVINGS" | "CURRENT" | "BUSINESS";

export default function CreateAdminBankAccountPage() {
  // Customer selection mode: "existing" | "manual"
  const [customerMode, setCustomerMode] = useState<"existing" | "manual">("existing");

  // Existing customer list & selection
  const [customers, setCustomers] = useState<RegisteredCustomer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  // Manual customer entry fields
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualPhone, setManualPhone] = useState("");

  // Account details
  const [accountType, setAccountType] = useState<AccountTypeChoice>("SAVINGS");
  const [initialDeposit, setInitialDeposit] = useState("5000");
  const [minBalance, setMinBalance] = useState("500");
  const [dailyLimit, setDailyLimit] = useState("2000000");
  const [maxTransaction, setMaxTransaction] = useState("1000000");
  const [branch, setBranch] = useState("Central Clearing Operations");
  const [currency] = useState("BDT");

  // Submission feedback states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [createdAccount, setCreatedAccount] = useState<{
    accountNumber: string;
    owner: string;
    customerName: string;
    type: string;
    balance: number;
    dailyLimit: number;
    branch: string;
  } | null>(null);
  const [copiedAccount, setCopiedAccount] = useState(false);

  // Fetch real registered customers from Admin API
  useEffect(() => {
    async function fetchCustomers() {
      try {
        setIsLoadingCustomers(true);
        const res = await fetch("/api/admin/customers?limit=100");
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setCustomers(json.data);
          if (json.data.length > 0) {
            setSelectedCustomerId(json.data[0].email);
          }
        }
      } catch (err) {
        console.error("Failed to load registered customers:", err);
      } finally {
        setIsLoadingCustomers(false);
      }
    }

    fetchCustomers();
  }, []);

  const selectedCustomer = customers.find(
    (c) => c.email.toLowerCase() === selectedCustomerId.toLowerCase()
  );

  const effectiveEmail =
    customerMode === "existing"
      ? selectedCustomer?.email || selectedCustomerId
      : manualEmail.trim().toLowerCase();

  const effectiveName =
    customerMode === "existing"
      ? selectedCustomer?.name || selectedCustomer?.email || "Selected Customer"
      : manualName.trim() || manualEmail.trim();

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (customerMode === "existing") {
      if (!selectedCustomerId) {
        newErrors.customerId = "Please select an existing registered customer.";
      }
    } else {
      if (!manualName.trim() || manualName.trim().length < 2) {
        newErrors.manualName = "Full name must be at least 2 characters.";
      }
      if (!manualEmail.trim() || !manualEmail.includes("@")) {
        newErrors.manualEmail = "A valid customer email address is required.";
      }
      if (manualPhone.trim() && manualPhone.trim().length < 6) {
        newErrors.manualPhone = "Please enter a valid phone number (at least 6 digits).";
      }
    }

    if (initialDeposit === "" || Number(initialDeposit) < 0 || isNaN(Number(initialDeposit))) {
      newErrors.initialDeposit = "Initial deposit must be a valid number (0 or greater).";
    }

    if (minBalance === "" || Number(minBalance) < 0 || isNaN(Number(minBalance))) {
      newErrors.minBalance = "Minimum balance must be 0 or greater.";
    }

    if (!dailyLimit || Number(dailyLimit) <= 0 || isNaN(Number(dailyLimit))) {
      newErrors.dailyLimit = "Daily transaction limit must be greater than zero.";
    }

    if (!maxTransaction || Number(maxTransaction) <= 0 || isNaN(Number(maxTransaction))) {
      newErrors.maxTransaction = "Maximum single transaction limit must be greater than zero.";
    }

    if (Number(maxTransaction) > Number(dailyLimit)) {
      newErrors.maxTransaction = "Max single transaction cannot exceed the daily transaction limit.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setApiError(null);

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const payload = {
        owner: effectiveEmail,
        name: customerMode === "manual" ? manualName.trim() : undefined,
        phone: customerMode === "manual" ? manualPhone.trim() : undefined,
        type: accountType,
        openingBalance: Number(initialDeposit),
        minBalance: Number(minBalance),
        dailyLimit: Number(dailyLimit),
        maxTransaction: Number(maxTransaction),
      };

      const res = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || "Failed to create bank account.");
      }

      const accountData = json.data;
      setCreatedAccount({
        accountNumber: accountData.accountNumber,
        owner: accountData.owner,
        customerName: effectiveName,
        type: accountData.type,
        balance: accountData.balance,
        dailyLimit: accountData.dailyLimit,
        branch,
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiError(err.message);
      } else {
        setApiError("An unexpected error occurred while creating the bank account.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setCustomerMode("existing");
    setManualName("");
    setManualEmail("");
    setManualPhone("");
    setAccountType("SAVINGS");
    setInitialDeposit("5000");
    setMinBalance("500");
    setDailyLimit("2000000");
    setMaxTransaction("1000000");
    setBranch("Central Clearing Operations");
    setErrors({});
    setApiError(null);
    setCreatedAccount(null);
    setCopiedAccount(false);
  };

  const copyAccountNumber = () => {
    if (!createdAccount) return;
    navigator.clipboard.writeText(createdAccount.accountNumber);
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  // SUCCESS VIEW
  if (createdAccount) {
    return (
      <div className="min-h-screen bg-[#F9F7F7] p-4 sm:p-6 lg:p-8">
        <div className="mx-auto flex min-h-[75vh] max-w-2xl items-center justify-center">
          <div className="w-full rounded-3xl border border-[#DBE2EF] bg-white p-6 text-center shadow-xs sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-xs">
              <CheckCircle2 size={36} />
            </div>

            <h1 className="mt-5 text-2xl font-bold text-[#112D4E]">
              Bank Account Opened Successfully!
            </h1>

            <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
              A new live bank account has been provisioned and linked to customer{" "}
              <span className="font-semibold text-[#112D4E]">
                {createdAccount.customerName}
              </span>{" "}
              ({createdAccount.owner}).
            </p>

            <div className="mt-7 rounded-2xl border border-[#DBE2EF] bg-[#F8FAFD] p-6 text-left shadow-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                  Generated Account Number
                </span>
                <button
                  type="button"
                  onClick={copyAccountNumber}
                  className="flex items-center gap-1.5 rounded-lg border border-[#DBE2EF] bg-white px-2.5 py-1 text-xs font-semibold text-[#3F72AF] shadow-xs hover:text-[#112D4E]"
                >
                  {copiedAccount ? (
                    <>
                      <Check size={13} className="text-emerald-600" />
                      <span className="text-emerald-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              <p className="mt-2.5 font-mono text-2xl font-bold tracking-wider text-[#112D4E]">
                {createdAccount.accountNumber}
              </p>

              <div className="mt-6 grid grid-cols-1 gap-4 border-t border-[#DBE2EF] pt-5 sm:grid-cols-2 text-xs">
                <div>
                  <p className="text-gray-500">Account Owner</p>
                  <p className="mt-1 font-semibold text-[#112D4E]">
                    {createdAccount.owner}
                  </p>
                </div>

                <div>
                  <p className="text-gray-500">Account Type</p>
                  <p className="mt-1 font-semibold text-[#112D4E]">
                    {createdAccount.type}
                  </p>
                </div>

                <div>
                  <p className="text-gray-500">Opening Balance</p>
                  <p className="mt-1 font-semibold text-[#112D4E]">
                    {currency} {createdAccount.balance.toLocaleString("en-BD")}
                  </p>
                </div>

                <div>
                  <p className="text-gray-500">Operating Branch</p>
                  <p className="mt-1 font-semibold text-[#112D4E]">
                    {createdAccount.branch}
                  </p>
                </div>

                <div>
                  <p className="text-gray-500">Daily Transaction Limit</p>
                  <p className="mt-1 font-semibold text-[#112D4E]">
                    {currency} {createdAccount.dailyLimit.toLocaleString("en-BD")}
                  </p>
                </div>

                <div>
                  <p className="text-gray-500">Account Status</p>
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    ACTIVE
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard/admin/accounts"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#112D4E] px-5 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-[#1D4168]"
              >
                <Wallet size={17} />
                View in Accounts Directory
              </Link>

              <button
                type="button"
                onClick={handleReset}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#DBE2EF] bg-white px-5 py-3 text-sm font-semibold text-[#112D4E] shadow-xs transition hover:bg-gray-50"
              >
                <Plus size={17} />
                Open Another Account
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F7F7] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-7">
        
        {/* Header Breadcrumb */}
        <div>
          <Link
            href="/dashboard/admin/accounts"
            className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-[#3F72AF] transition hover:text-[#112D4E]"
          >
            <ArrowLeft size={16} />
            Back to Accounts Directory
          </Link>

          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.15em] text-[#3F72AF]">
            Administration / Accounts / New Account
          </p>

          <h1 className="text-2xl font-extrabold text-[#112D4E] sm:text-3xl">
            Open Bank Account
          </h1>

          <p className="mt-1.5 text-xs sm:text-sm text-[#6B7280]">
            Provision a new high-security bank account for a registered customer.
          </p>
        </div>

        {/* Global API Error Alert */}
        {apiError && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs sm:text-sm text-rose-800 shadow-xs animate-in fade-in">
            <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-600" />
            <div className="space-y-1">
              <p className="font-bold">Account Creation Failed</p>
              <p className="leading-relaxed">{apiError}</p>
              {apiError.includes("register") && (
                <p className="mt-2 text-xs text-rose-700">
                  Tip: Customers can complete registration at{" "}
                  <Link href="/register" className="font-semibold underline">
                    /register
                  </Link>{" "}
                  before an account is opened for their identity.
                </p>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* 1. Customer Selection / Entry Mode */}
          <section className="rounded-3xl border border-[#DBE2EF] bg-white p-6 sm:p-7 shadow-xs">
            <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-gray-100 pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#3F72AF] shadow-xs">
                  <UserRound size={21} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#112D4E]">
                    Customer Identity & Ownership
                  </h2>
                  <p className="mt-0.5 text-xs text-[#6B7280]">
                    Select an existing registered customer or enter customer information manually.
                  </p>
                </div>
              </div>

              {/* Mode Switcher Buttons */}
              <div className="inline-flex rounded-xl bg-gray-100 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setCustomerMode("existing");
                    setApiError(null);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 transition ${
                    customerMode === "existing"
                      ? "bg-white text-[#112D4E] shadow-xs"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Users size={14} />
                  <span>Registered Customer</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomerMode("manual");
                    setApiError(null);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 transition ${
                    customerMode === "manual"
                      ? "bg-white text-[#112D4E] shadow-xs"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <UserPlus size={14} />
                  <span>Add New Customer</span>
                </button>
              </div>
            </div>

            {/* Mode A: Select Existing Registered Customer */}
            {customerMode === "existing" ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold text-[#112D4E]">
                    Select Registered Customer <span className="text-rose-500">*</span>
                  </label>

                  {isLoadingCustomers ? (
                    <div className="flex h-12 items-center gap-2 rounded-xl border border-[#DBE2EF] bg-gray-50 px-4 text-xs text-gray-500">
                      <Loader2 size={16} className="animate-spin text-[#3F72AF]" />
                      Loading customer directory from database...
                    </div>
                  ) : customers.length === 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
                      No registered customers found in database. Use <strong>Add New Customer</strong> mode to enter details.
                    </div>
                  ) : (
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => {
                        setSelectedCustomerId(e.target.value);
                        setErrors((prev) => ({ ...prev, customerId: "" }));
                      }}
                      className={`h-12 w-full rounded-xl border bg-white px-4 text-xs sm:text-sm text-[#112D4E] outline-none transition focus:border-[#3F72AF] focus:ring-2 focus:ring-[#3F72AF]/20 ${
                        errors.customerId ? "border-rose-400" : "border-[#DBE2EF]"
                      }`}
                    >
                      <option value="">-- Choose registered customer --</option>
                      {customers.map((c) => (
                        <option key={c.email} value={c.email}>
                          {c.name || "Customer"} — {c.email}
                        </option>
                      ))}
                    </select>
                  )}

                  {errors.customerId && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-rose-600">
                      <AlertCircle size={13} />
                      {errors.customerId}
                    </p>
                  )}
                </div>

                {/* Selected Customer Details Preview Card */}
                {selectedCustomer && (
                  <div className="rounded-2xl border border-[#DBE2EF] bg-[#F8FAFD] p-4.5 text-xs">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                      Verified Customer Record
                    </p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="flex items-center gap-2.5">
                        <UserRound size={16} className="text-[#3F72AF] shrink-0" />
                        <div>
                          <p className="text-[10px] text-gray-400">Legal Name</p>
                          <p className="font-semibold text-[#112D4E]">{selectedCustomer.name}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <Mail size={16} className="text-[#3F72AF] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] text-gray-400">Owner Identifier</p>
                          <p className="truncate font-semibold text-[#112D4E]">{selectedCustomer.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <Phone size={16} className="text-[#3F72AF] shrink-0" />
                        <div>
                          <p className="text-[10px] text-gray-400">Contact Phone</p>
                          <p className="font-semibold text-[#112D4E]">{selectedCustomer.phone || "Not recorded"}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Mode B: Manual Customer Entry */
              <div className="space-y-5">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-xs leading-relaxed text-[#112D4E]">
                  <div className="flex items-center gap-2 font-semibold text-[#3F72AF]">
                    <Info size={16} />
                    <span>Customer Identity & Verification Protocol</span>
                  </div>
                  <p className="mt-1 text-gray-600">
                    If the entered email already belongs to a registered customer, the new bank account will be automatically associated with their account.
                    To prevent unlinked accounts, if the customer is not registered yet, Trustora Bank requires them to complete sign-up before account activation.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {/* Full Name */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[#112D4E]">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <UserRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={manualName}
                        onChange={(e) => {
                          setManualName(e.target.value);
                          setErrors((prev) => ({ ...prev, manualName: "" }));
                        }}
                        placeholder="e.g. Jannat Amila Rahman"
                        className={`h-11 w-full rounded-xl border bg-white pl-10 pr-3.5 text-xs text-[#112D4E] outline-none transition focus:border-[#3F72AF] focus:ring-2 focus:ring-[#3F72AF]/20 ${
                          errors.manualName ? "border-rose-400" : "border-[#DBE2EF]"
                        }`}
                      />
                    </div>
                    {errors.manualName && (
                      <p className="mt-1 text-[11px] text-rose-600">{errors.manualName}</p>
                    )}
                  </div>

                  {/* Email Address */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[#112D4E]">
                      Email Address <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        value={manualEmail}
                        onChange={(e) => {
                          setManualEmail(e.target.value);
                          setErrors((prev) => ({ ...prev, manualEmail: "" }));
                        }}
                        placeholder="e.g. customer@example.com"
                        className={`h-11 w-full rounded-xl border bg-white pl-10 pr-3.5 text-xs text-[#112D4E] outline-none transition focus:border-[#3F72AF] focus:ring-2 focus:ring-[#3F72AF]/20 ${
                          errors.manualEmail ? "border-rose-400" : "border-[#DBE2EF]"
                        }`}
                      />
                    </div>
                    {errors.manualEmail && (
                      <p className="mt-1 text-[11px] text-rose-600">{errors.manualEmail}</p>
                    )}
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[#112D4E]">
                      Phone Number (Optional)
                    </label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="tel"
                        value={manualPhone}
                        onChange={(e) => {
                          setManualPhone(e.target.value);
                          setErrors((prev) => ({ ...prev, manualPhone: "" }));
                        }}
                        placeholder="+880 1XXX-XXXXXX"
                        className={`h-11 w-full rounded-xl border bg-white pl-10 pr-3.5 text-xs text-[#112D4E] outline-none transition focus:border-[#3F72AF] focus:ring-2 focus:ring-[#3F72AF]/20 ${
                          errors.manualPhone ? "border-rose-400" : "border-[#DBE2EF]"
                        }`}
                      />
                    </div>
                    {errors.manualPhone && (
                      <p className="mt-1 text-[11px] text-rose-600">{errors.manualPhone}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 2. Account Specifications */}
          <section className="rounded-3xl border border-[#DBE2EF] bg-white p-6 sm:p-7 shadow-xs">
            <div className="mb-6 flex items-center gap-3 border-b border-gray-100 pb-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-xs">
                <CreditCard size={21} />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#112D4E]">
                  Account Terms & Configuration
                </h2>
                <p className="mt-0.5 text-xs text-[#6B7280]">
                  Configure account product type, initial opening deposit, and risk limits.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {/* Account Type */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-[#112D4E]">
                  Account Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value as AccountTypeChoice)}
                  className="h-11 w-full rounded-xl border border-[#DBE2EF] bg-white px-3.5 text-xs text-[#112D4E] outline-none transition focus:border-[#3F72AF]"
                >
                  <option value="SAVINGS">Savings Account (Standard Retail)</option>
                  <option value="CURRENT">Current Account (Checking / Daily)</option>
                  <option value="BUSINESS">Business Account (Commercial Commercial)</option>
                </select>
              </div>

              {/* Initial Opening Balance */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-[#112D4E]">
                  Opening Balance (BDT) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <CircleDollarSign size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={initialDeposit}
                    onChange={(e) => {
                      setInitialDeposit(e.target.value);
                      setErrors((prev) => ({ ...prev, initialDeposit: "" }));
                    }}
                    placeholder="e.g. 5000"
                    className={`h-11 w-full rounded-xl border bg-white pl-10 pr-3.5 text-xs text-[#112D4E] outline-none transition focus:border-[#3F72AF] ${
                      errors.initialDeposit ? "border-rose-400" : "border-[#DBE2EF]"
                    }`}
                  />
                </div>
                {errors.initialDeposit && (
                  <p className="mt-1 text-[11px] text-rose-600">{errors.initialDeposit}</p>
                )}
              </div>

              {/* Daily Transaction Limit */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-[#112D4E]">
                  Daily Limit (BDT) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Wallet size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={dailyLimit}
                    onChange={(e) => {
                      setDailyLimit(e.target.value);
                      setErrors((prev) => ({ ...prev, dailyLimit: "" }));
                    }}
                    placeholder="e.g. 2000000"
                    className={`h-11 w-full rounded-xl border bg-white pl-10 pr-3.5 text-xs text-[#112D4E] outline-none transition focus:border-[#3F72AF] ${
                      errors.dailyLimit ? "border-rose-400" : "border-[#DBE2EF]"
                    }`}
                  />
                </div>
                {errors.dailyLimit && (
                  <p className="mt-1 text-[11px] text-rose-600">{errors.dailyLimit}</p>
                )}
              </div>

              {/* Max Single Transaction Limit */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-[#112D4E]">
                  Max Per-Transaction Limit (BDT) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Wallet size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={maxTransaction}
                    onChange={(e) => {
                      setMaxTransaction(e.target.value);
                      setErrors((prev) => ({ ...prev, maxTransaction: "" }));
                    }}
                    placeholder="e.g. 1000000"
                    className={`h-11 w-full rounded-xl border bg-white pl-10 pr-3.5 text-xs text-[#112D4E] outline-none transition focus:border-[#3F72AF] ${
                      errors.maxTransaction ? "border-rose-400" : "border-[#DBE2EF]"
                    }`}
                  />
                </div>
                {errors.maxTransaction && (
                  <p className="mt-1 text-[11px] text-rose-600">{errors.maxTransaction}</p>
                )}
              </div>

              {/* Minimum Balance */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-[#112D4E]">
                  Minimum Required Balance (BDT)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={minBalance}
                  onChange={(e) => setMinBalance(e.target.value)}
                  placeholder="e.g. 500"
                  className="h-11 w-full rounded-xl border border-[#DBE2EF] bg-white px-3.5 text-xs text-[#112D4E] outline-none transition focus:border-[#3F72AF]"
                />
              </div>

              {/* Branch */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-[#112D4E]">
                  Operating Branch
                </label>
                <div className="relative">
                  <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="h-11 w-full rounded-xl border border-[#DBE2EF] bg-white pl-10 pr-3.5 text-xs text-[#112D4E] outline-none transition focus:border-[#3F72AF]"
                  >
                    {branches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* 3. Account Creation Summary */}
          <section className="rounded-3xl border border-[#DBE2EF] bg-white p-6 shadow-xs">
            <h3 className="text-sm font-bold text-[#112D4E]">
              Account Overview & Ledger Invariant Summary
            </h3>
            <p className="mt-0.5 text-xs text-[#6B7280]">
              Review the configuration details before committing to the live banking ledger.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4 text-xs">
              <div className="rounded-xl bg-[#F8FAFD] border border-gray-100 p-3.5">
                <p className="text-gray-400">Target Owner</p>
                <p className="mt-1 font-semibold text-[#112D4E] truncate">
                  {effectiveEmail || "Not specified"}
                </p>
              </div>

              <div className="rounded-xl bg-[#F8FAFD] border border-gray-100 p-3.5">
                <p className="text-gray-400">Account Type</p>
                <p className="mt-1 font-semibold text-[#112D4E]">{accountType}</p>
              </div>

              <div className="rounded-xl bg-[#F8FAFD] border border-gray-100 p-3.5">
                <p className="text-gray-400">Initial Balance</p>
                <p className="mt-1 font-semibold text-[#112D4E]">
                  {currency} {Number(initialDeposit || 0).toLocaleString("en-BD")}
                </p>
              </div>

              <div className="rounded-xl bg-[#F8FAFD] border border-gray-100 p-3.5">
                <p className="text-gray-400">Daily Limit</p>
                <p className="mt-1 font-semibold text-[#112D4E]">
                  {currency} {Number(dailyLimit || 0).toLocaleString("en-BD")}
                </p>
              </div>
            </div>
          </section>

          {/* Submit Actions */}
          <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row pt-2">
            <Link
              href="/dashboard/admin/accounts"
              className="flex items-center justify-center rounded-xl border border-[#DBE2EF] bg-white px-5 py-3 text-xs font-semibold text-[#4B5563] shadow-xs transition hover:bg-gray-50"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#112D4E] px-7 py-3 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1D4168] disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Provisioning Bank Account...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Open Bank Account
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
