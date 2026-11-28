import { NextRequest, NextResponse } from "next/server";
import { requireStaffOrAdmin, handleApiError } from "@/server/auth";
import { StaffService } from "@/services/staffService";
import { AdminService } from "@/services/adminService";
import { getDatabase } from "@/lib/mongodb";
import { COLLECTIONS, type DbBankAccount } from "@/types";

export async function GET(request: NextRequest) {
  try {
    await requireStaffOrAdmin();
    const searchParams = request.nextUrl.searchParams;

    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;
    const page = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 20;

    const result = await AdminService.listCustomers({ search, status, page, limit });

    // Look up bank accounts for these customers to provide real account numbers
    const emails = result.customers.map((c) => c.email);
    let accountsByEmail: Record<string, string> = {};
    if (emails.length > 0) {
      const db = await getDatabase();
      const accounts = await db
        .collection<DbBankAccount>(COLLECTIONS.ACCOUNTS)
        .find({ owner: { $in: emails } })
        .toArray();

      accounts.forEach((acc) => {
        if (!accountsByEmail[acc.owner]) {
          accountsByEmail[acc.owner] = acc.accountNumber;
        }
      });
    }

    const enrichedCustomers = result.customers.map((c) => ({
      _id: c._id?.toString(),
      id: c._id?.toString() || c.id,
      name: c.name,
      email: c.email,
      phone: c.phone || "N/A",
      account: accountsByEmail[c.email] ? `**** ${accountsByEmail[c.email].slice(-4)}` : "No account",
      accountNumber: accountsByEmail[c.email] || null,
      status: c.kycStatus === "VERIFIED" ? "Verified" : c.kycStatus === "REJECTED" ? "Incomplete" : "Pending",
      rawStatus: c.status || "ACTIVE",
      kycStatus: c.kycStatus || "PENDING",
      createdAt: c.createdAt,
    }));

    return NextResponse.json({
      success: true,
      data: enrichedCustomers,
      pagination: result.pagination,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireStaffOrAdmin();
    const body = await request.json();

    const {
      name,
      fullName,
      email,
      phone,
      address,
      dateOfBirth,
      occupation,
      identityType,
      identityNumber,
    } = body;

    const customerName = name || fullName;

    const createdCustomer = await StaffService.registerCustomer({
      name: customerName,
      email,
      phone,
      address,
      dateOfBirth,
      occupation,
      identityType,
      identityNumber,
      registeredBy: user.email,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Customer registered successfully.",
        data: createdCustomer,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
