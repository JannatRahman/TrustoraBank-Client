"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  Users,
  UserCheck,
  Clock,
  AlertCircle,
  Eye,
  ChevronDown,
  Loader2,
  RefreshCw,
} from "lucide-react";

type CustomerStatus = "Verified" | "Pending" | "Incomplete";

type Customer = {
  _id?: string;
  id: string;
  name: string;
  email: string;
  phone: string;
  account: string;
  accountNumber?: string | null;
  date: string;
  status: CustomerStatus;
  rawStatus?: string;
  kycStatus?: string;
};

const statusStyles: Record<CustomerStatus, string> = {
  Verified: "bg-green-50 text-green-700",
  Pending: "bg-amber-50 text-amber-700",
  Incomplete: "bg-red-50 text-red-700",
};

export default function ManageCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");

  const fetchCustomers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch("/api/staff/customers?limit=100");
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load customers.");
      }

      const mapped: Customer[] = (json.data || []).map((item: any) => ({
        _id: item._id,
        id: item.id || item._id || "N/A",
        name: item.name || "Unnamed Customer",
        email: item.email || "",
        phone: item.phone || "N/A",
        account: item.account || "No account",
        accountNumber: item.accountNumber || null,
        date: item.createdAt
          ? new Date(item.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "N/A",
        status: item.status || "Pending",
        rawStatus: item.rawStatus || "ACTIVE",
        kycStatus: item.kycStatus || "PENDING",
      }));

      setCustomers(mapped);
    } catch (err: any) {
      console.error("Error fetching customers:", err);
      setError(err.message || "Failed to load customer list.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const matchesSearch =
        customer.name.toLowerCase().includes(search.toLowerCase()) ||
        customer.email.toLowerCase().includes(search.toLowerCase()) ||
        customer.id.toLowerCase().includes(search.toLowerCase()) ||
        customer.phone.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        status === "All" || customer.status === status;

      return matchesSearch && matchesStatus;
    });
  }, [customers, search, status]);

  const verifiedCount = customers.filter(
    (customer) => customer.status === "Verified"
  ).length;

  const pendingCount = customers.filter(
    (customer) => customer.status === "Pending"
  ).length;

  const incompleteCount = customers.filter(
    (customer) => customer.status === "Incomplete"
  ).length;

  return (
    <div className="min-h-screen bg-[#F9F7F7] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-7">

        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium text-[#3F72AF]">
              BANKING STAFF / CUSTOMERS
            </p>
            <h1 className="mt-2 text-2xl font-bold text-[#112D4E] sm:text-3xl">
              Customer Management
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Manage real customer information, view bank accounts, and review KYC verification status.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchCustomers}
              disabled={isLoading}
              title="Refresh customer list"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
              Refresh
            </button>

            <Link
              href="/dashboard/bankStaff/customers/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#172554] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#112D4E]"
            >
              <Plus size={18} />
              Register Customer
            </Link>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
            <AlertCircle size={20} className="shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Statistics */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Total Customers"
            value={customers.length.toString()}
            icon={<Users size={21} />}
            description="Registered in database"
          />

          <StatCard
            title="Verified"
            value={verifiedCount.toString()}
            icon={<UserCheck size={21} />}
            description="Identity verified"
          />

          <StatCard
            title="Pending Review"
            value={pendingCount.toString()}
            icon={<Clock size={21} />}
            description="Awaiting verification"
          />

          <StatCard
            title="Incomplete"
            value={incompleteCount.toString()}
            icon={<AlertCircle size={21} />}
            description="Information required"
          />
        </div>

        {/* Customer Table */}
        <div className="overflow-hidden rounded-2xl border border-[#DBE2EF] bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-gray-100 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#112D4E]">
                All Customers
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Search and review live customer records from the database.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, phone..."
                  className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#3F72AF] sm:w-64"
                />
              </div>

              <div className="relative">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-gray-200 bg-white py-2.5 pl-4 pr-10 text-sm text-gray-600 outline-none focus:border-[#3F72AF] sm:w-40"
                >
                  <option value="All">All Status</option>
                  <option value="Verified">Verified</option>
                  <option value="Pending">Pending</option>
                  <option value="Incomplete">Incomplete</option>
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-500">
                <Loader2 size={28} className="animate-spin text-[#3F72AF]" />
                <span className="ml-3 text-sm font-medium">Loading registered customers...</span>
              </div>
            ) : (
              <table className="w-full min-w-[850px] text-left">
                <thead className="bg-[#F9F7F7] text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Customer</th>
                    <th className="px-5 py-4 font-semibold">Customer ID</th>
                    <th className="px-5 py-4 font-semibold">Phone</th>
                    <th className="px-5 py-4 font-semibold">Bank Account</th>
                    <th className="px-5 py-4 font-semibold">Registration</th>
                    <th className="px-5 py-4 font-semibold">KYC Status</th>
                    <th className="px-5 py-4 font-semibold">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {filteredCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      className="transition hover:bg-[#F9F7F7]/70"
                    >
                      <td className="px-5 py-4">
                        <p className="font-semibold text-[#112D4E]">
                          {customer.name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {customer.email}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-xs font-mono text-gray-600">
                        {customer.id.length > 12 ? `${customer.id.slice(0, 10)}...` : customer.id}
                      </td>

                      <td className="px-5 py-4 text-sm text-gray-600">
                        {customer.phone}
                      </td>

                      <td className="px-5 py-4 text-sm font-medium text-gray-700">
                        {customer.account}
                      </td>

                      <td className="px-5 py-4 text-sm text-gray-600">
                        {customer.date}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusStyles[customer.status] || "bg-gray-100 text-gray-700"}`}
                        >
                          {customer.status}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <Link
                          href={`/dashboard/bankStaff/customers?view=${encodeURIComponent(customer.email)}`}
                          title="View customer"
                          className="inline-flex rounded-lg border border-gray-200 p-2 text-[#3F72AF] transition hover:bg-[#DBE2EF]/50"
                        >
                          <Eye size={17} />
                        </Link>
                      </td>
                    </tr>
                  ))}

                  {filteredCustomers.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-12 text-center text-sm text-gray-500"
                      >
                        No customers found. Try another search or filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div className="border-t border-gray-100 px-5 py-4 text-sm text-gray-500">
            Showing {filteredCustomers.length} of {customers.length} customers
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  description,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-[#DBE2EF] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className="rounded-xl bg-[#DBE2EF]/50 p-2.5 text-[#3F72AF]">
          {icon}
        </div>
      </div>

      <h3 className="mt-4 text-3xl font-bold text-[#112D4E]">{value}</h3>
      <p className="mt-1 text-xs text-gray-400">{description}</p>
    </div>
  );
}
