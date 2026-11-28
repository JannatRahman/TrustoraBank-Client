"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  UserRound,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Briefcase,
  Calendar,
} from "lucide-react";

export default function NewCustomerPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredCustomer, setRegisteredCustomer] = useState<{
    name: string;
    email: string;
    phone: string;
  } | null>(null);

  // Form fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [occupation, setOccupation] = useState("");
  const [address, setAddress] = useState("");
  const [identityType, setIdentityType] = useState("national-id");
  const [identityNumber, setIdentityNumber] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/staff/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          dateOfBirth,
          occupation,
          address,
          identityType,
          identityNumber,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "Failed to register customer.");
      }

      setRegisteredCustomer({
        name: data.data.name,
        email: data.data.email,
        phone: data.data.phone,
      });
    } catch (err: any) {
      console.error("Customer registration error:", err);
      setError(err.message || "An unexpected error occurred while registering the customer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setRegisteredCustomer(null);
    setFullName("");
    setEmail("");
    setPhone("");
    setDateOfBirth("");
    setOccupation("");
    setAddress("");
    setIdentityType("national-id");
    setIdentityNumber("");
    setError(null);
  };

  if (registeredCustomer) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9F7F7] px-4 py-10">
        <div className="w-full max-w-md rounded-3xl border border-[#DBE2EF] bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600">
            <CheckCircle2 size={34} />
          </div>

          <h1 className="mt-5 text-2xl font-bold text-[#112D4E]">
            Customer Registered!
          </h1>

          <p className="mt-3 text-sm leading-6 text-gray-600">
            <strong>{registeredCustomer.name}</strong> ({registeredCustomer.email}) has been successfully saved to Trustora Bank&apos;s customer directory.
          </p>

          <div className="mt-5 rounded-2xl bg-gray-50 p-4 text-left text-xs space-y-1.5 text-gray-600 border border-gray-100">
            <p><span className="font-semibold text-[#112D4E]">Name:</span> {registeredCustomer.name}</p>
            <p><span className="font-semibold text-[#112D4E]">Email:</span> {registeredCustomer.email}</p>
            <p><span className="font-semibold text-[#112D4E]">Phone:</span> {registeredCustomer.phone}</p>
            <p><span className="font-semibold text-[#112D4E]">Status:</span> Active (KYC Pending)</p>
          </div>

          <div className="mt-7 flex flex-col gap-3">
            <button
              onClick={() => router.push("/dashboard/bankStaff/customers")}
              className="rounded-xl bg-[#172554] px-5 py-3 text-sm font-semibold text-white hover:bg-[#112D4E] transition shadow-sm"
            >
              Back to Customers Directory
            </button>

            <button
              onClick={handleReset}
              className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-[#112D4E] hover:bg-gray-50 transition"
            >
              Register Another Customer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F7F7] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-7">

        {/* Header */}
        <div>
          <Link
            href="/dashboard/bankStaff/customers"
            className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-[#3F72AF] hover:text-[#112D4E]"
          >
            <ArrowLeft size={17} />
            Back to Customers
          </Link>

          <p className="text-sm font-medium text-[#3F72AF]">
            BANKING STAFF / CUSTOMERS / NEW
          </p>

          <h1 className="mt-2 text-2xl font-bold text-[#112D4E] sm:text-3xl">
            Register New Customer
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Enter the customer&apos;s personal and identity information to create an active customer profile.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
            <AlertCircle size={20} className="shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Personal Information */}
          <section className="rounded-2xl border border-[#DBE2EF] bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-xl bg-[#DBE2EF]/50 p-2.5 text-[#3F72AF]">
                <UserRound size={21} />
              </div>

              <div>
                <h2 className="font-bold text-[#112D4E]">
                  Personal Information
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Basic customer details
                </p>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Full Name" required>
                <input
                  name="fullName"
                  type="text"
                  placeholder="Enter full name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#3F72AF]"
                />
              </FormField>

              <FormField label="Email Address" required>
                <input
                  name="email"
                  type="email"
                  placeholder="customer@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#3F72AF]"
                />
              </FormField>

              <FormField label="Phone Number" required>
                <input
                  name="phone"
                  type="tel"
                  placeholder="+880 1XXXXXXXXX"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#3F72AF]"
                />
              </FormField>

              <FormField label="Date of Birth">
                <input
                  name="dateOfBirth"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#3F72AF]"
                />
              </FormField>

              <FormField label="Occupation">
                <input
                  name="occupation"
                  type="text"
                  placeholder="e.g. Software Engineer, Business Owner"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#3F72AF]"
                />
              </FormField>

              <FormField label="Address" required>
                <input
                  name="address"
                  type="text"
                  placeholder="House, Street, City, Country"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#3F72AF]"
                />
              </FormField>
            </div>
          </section>

          {/* Identity Information */}
          <section className="rounded-2xl border border-[#DBE2EF] bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-xl bg-[#DBE2EF]/50 p-2.5 text-[#3F72AF]">
                <CreditCard size={21} />
              </div>

              <div>
                <h2 className="font-bold text-[#112D4E]">
                  Identity Information
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Customer identity verification details
                </p>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Identity Type" required>
                <select
                  name="identityType"
                  required
                  value={identityType}
                  onChange={(e) => setIdentityType(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[#3F72AF]"
                >
                  <option value="national-id">National ID</option>
                  <option value="passport">Passport</option>
                  <option value="driving-license">Driving License</option>
                </select>
              </FormField>

              <FormField label="Identity Number" required>
                <input
                  name="identityNumber"
                  type="text"
                  placeholder="Enter identity number"
                  required
                  value={identityNumber}
                  onChange={(e) => setIdentityNumber(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#3F72AF]"
                />
              </FormField>
            </div>
          </section>

          {/* Notice */}
          <div className="flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <ShieldCheck
              size={22}
              className="shrink-0 text-[#3F72AF]"
            />

            <div>
              <h3 className="text-sm font-semibold text-[#112D4E]">
                KYC Verification Notice
              </h3>
              <p className="mt-1 text-xs leading-5 text-gray-600">
                Registering a customer here creates an active customer account in the system with KYC Status set to Pending. The customer will immediately be available for bank account opening.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
            <Link
              href="/dashboard/bankStaff/customers"
              className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-center text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#172554] px-7 py-3 text-sm font-semibold text-white transition hover:bg-[#112D4E] disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving Customer...
                </>
              ) : (
                "Submit Registration"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-[#112D4E]">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
