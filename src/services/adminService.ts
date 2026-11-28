import { clientPromise, getDatabase } from "@/lib/mongodb";
import {
  COLLECTIONS,
  type DbUser,
  type DbBankAccount,
  type DbTransaction,
  type DbLoan,
  type DbRequest,
  type DbAuditLog,
  type DbNotification,
  type CustomerStatus,
  type AccountStatus,
} from "@/types";
import { NotFoundError, BadRequestError } from "@/server/auth/errors";
import type { CreateAccountPayload } from "@/validators/adminValidator";
import { TransactionService } from "@/services/transactionService";
import { escapeRegex } from "@/validators/regexHelper";

export class AdminService {
  /**
   * Generates a unique 10-digit bank account number starting with '10'.
   */
  static async generateUniqueAccountNumber(): Promise<string> {
    const db = await getDatabase();
    const collection = db.collection<DbBankAccount>(COLLECTIONS.ACCOUNTS);

    for (let attempts = 0; attempts < 10; attempts++) {
      const randomDigits = Math.floor(10000000 + Math.random() * 90000000).toString();
      const candidate = `10${randomDigits}`;
      const existing = await collection.findOne({ accountNumber: candidate });
      if (!existing) {
        return candidate;
      }
    }
    return `10${Date.now().toString().slice(-8)}`;
  }

  /**
   * Calculates comprehensive, authoritative server-side analytics from real database records.
   * Supports optional date range filtering for transaction and loan metrics.
   */
  static async getAnalytics(dateRange?: { startDate?: string | Date; endDate?: string | Date }) {
    const db = await getDatabase();
    const usersCol = db.collection<DbUser>(COLLECTIONS.USER);
    const accountsCol = db.collection<DbBankAccount>(COLLECTIONS.ACCOUNTS);
    const txCol = db.collection<DbTransaction>(COLLECTIONS.TRANSACTIONS);
    const loansCol = db.collection<DbLoan>(COLLECTIONS.LOANS);

    const txMatch: Record<string, unknown> = {};
    if (dateRange?.startDate || dateRange?.endDate) {
      const dateFilter: Record<string, unknown> = {};
      if (dateRange.startDate) dateFilter.$gte = new Date(dateRange.startDate);
      if (dateRange.endDate) {
        const end = new Date(dateRange.endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
      txMatch.createdAt = dateFilter;
    }

    const [
      totalCustomers,
      totalStaff,
      totalAccounts,
      balanceAgg,
      depositAgg,
      withdrawalAgg,
      totalTransactions,
      pendingLoans,
      activeLoans,
      completedLoans,
      monthlyActivityAgg,
      accountDistAgg,
      loanStatusAgg,
      txTypeDistAgg,
      recentTransactions,
    ] = await Promise.all([
      // 1. Total Customers
      usersCol.countDocuments({ role: "customer" }),
      // 2. Total Staff
      usersCol.countDocuments({ role: "banking-staff" }),
      // 3. Total Accounts
      accountsCol.countDocuments(),
      // 4. Total Bank Balance
      accountsCol
        .aggregate<{ total: number }>([
          { $group: { _id: null, total: { $sum: "$balance" } } },
        ])
        .toArray(),
      // 5. Total Completed Deposits
      txCol
        .aggregate<{ total: number }>([
          { $match: { type: "DEPOSIT", status: "COMPLETED", ...txMatch } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray(),
      // 6. Total Completed Withdrawals
      txCol
        .aggregate<{ total: number }>([
          { $match: { type: "WITHDRAWAL", status: "COMPLETED", ...txMatch } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray(),
      // 7. Total Completed Transactions
      txCol.countDocuments({ status: "COMPLETED", ...txMatch }),
      // 8. Pending Loans
      loansCol.countDocuments({
        status: { $in: ["PENDING", "UNDER_REVIEW", "FORWARDED_TO_ADMIN"] },
      }),
      // 9. Active Loans
      loansCol.countDocuments({ status: "ACTIVE" }),
      // 10. Completed Loans
      loansCol.countDocuments({ status: "COMPLETED" }),

      // CHART 1: Monthly Deposits vs Withdrawals (last 6-12 months)
      txCol
        .aggregate<{
          _id: { year: number; month: number };
          deposits: number;
          withdrawals: number;
        }>([
          {
            $match: {
              status: "COMPLETED",
              type: { $in: ["DEPOSIT", "WITHDRAWAL"] },
              ...txMatch,
            },
          },
          {
            $group: {
              _id: {
                year: { $year: { $toDate: "$createdAt" } },
                month: { $month: { $toDate: "$createdAt" } },
              },
              deposits: {
                $sum: { $cond: [{ $eq: ["$type", "DEPOSIT"] }, "$amount", 0] },
              },
              withdrawals: {
                $sum: { $cond: [{ $eq: ["$type", "WITHDRAWAL"] }, "$amount", 0] },
              },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
        ])
        .toArray(),

      // CHART 2: Account Distribution by Type
      accountsCol
        .aggregate<{ _id: string; count: number; totalBalance: number }>([
          {
            $group: {
              _id: "$accountType",
              count: { $sum: 1 },
              totalBalance: { $sum: "$balance" },
            },
          },
        ])
        .toArray(),

      // CHART 3: Loan Status Distribution
      loansCol
        .aggregate<{ _id: string; count: number; totalAmount: number }>([
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              totalAmount: { $sum: "$amount" },
            },
          },
        ])
        .toArray(),

      // CHART 4: Transaction Type Distribution
      txCol
        .aggregate<{ _id: string; count: number; totalAmount: number }>([
          { $match: { status: "COMPLETED", ...txMatch } },
          {
            $group: {
              _id: "$type",
              count: { $sum: 1 },
              totalAmount: { $sum: "$amount" },
            },
          },
        ])
        .toArray(),

      // 5. Recent 6 transactions across the bank
      txCol
        .find(txMatch)
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray(),
    ]);

    // Format monthly activity data for clean chart consumption
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthlyActivity = monthlyActivityAgg.map((item) => ({
      year: item._id.year,
      month: months[item._id.month - 1] || `${item._id.month}`,
      deposits: item.deposits,
      withdrawals: item.withdrawals,
    }));

    return {
      overview: {
        totalCustomers,
        totalStaff,
        totalAccounts,
        totalBankBalance: balanceAgg[0]?.total || 0,
        totalDeposits: depositAgg[0]?.total || 0,
        totalWithdrawals: withdrawalAgg[0]?.total || 0,
        totalTransactions,
        pendingLoans,
        activeLoans,
        completedLoans,
      },
      charts: {
        monthlyActivity,
        accountDistribution: accountDistAgg.map((a) => ({
          type: a._id || "SAVINGS",
          count: a.count,
          totalBalance: a.totalBalance,
        })),
        loanStatistics: loanStatusAgg.map((l) => ({
          status: l._id || "OTHER",
          count: l.count,
          totalAmount: l.totalAmount,
        })),
        transactionDistribution: txTypeDistAgg.map((t) => ({
          type: t._id || "OTHER",
          count: t.count,
          totalAmount: t.totalAmount,
        })),
      },
      recentTransactions: recentTransactions.map((tx) => {
        const accountNum = tx.receiverAccount || tx.senderAccount || tx.initiatedBy || "N/A";
        return {
          id: tx.transactionId || String(tx._id),
          customer: accountNum,
          accountNumber: accountNum,
          type:
            tx.type === "DEPOSIT"
              ? "Deposit"
              : tx.type === "WITHDRAWAL"
              ? "Withdrawal"
              : "Transfer",
          amount: tx.amount,
          currency: "BDT",
          date: tx.createdAt
            ? new Date(tx.createdAt).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : "Recent",
          status:
            tx.status === "COMPLETED"
              ? "Completed"
              : tx.status === "FAILED"
              ? "Failed"
              : "Pending",
        };
      }),
    };
  }

  /**
   * Paginated directory of customers with search and status filters.
   */
  static async listCustomers(query: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const db = await getDatabase();
    const usersCol = db.collection<DbUser>(COLLECTIONS.USER);

    const filter: Record<string, unknown> = {
      role: "customer",
    };

    if (query.status) {
      filter.status = query.status.toUpperCase();
    }

    if (query.search) {
      const sanitized = escapeRegex(query.search.trim());
      const regex = new RegExp(sanitized, "i");
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [customers, total] = await Promise.all([
      usersCol.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      usersCol.countDocuments(filter),
    ]);

    return {
      customers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves single customer details including associated accounts, loans, and recent activity.
   */
  static async getCustomerDetails(emailOrId: string) {
    const db = await getDatabase();
    const usersCol = db.collection<DbUser>(COLLECTIONS.USER);
    const accountsCol = db.collection<DbBankAccount>(COLLECTIONS.ACCOUNTS);
    const loansCol = db.collection<DbLoan>(COLLECTIONS.LOANS);
    const requestsCol = db.collection<DbRequest>(COLLECTIONS.REQUESTS);
    const txCol = db.collection<DbTransaction>(COLLECTIONS.TRANSACTIONS);

    const term = emailOrId.trim();
    const user = await usersCol.findOne({
      $or: [{ email: term.toLowerCase() }, { _id: term as any }, { id: term }],
    });

    if (!user) {
      throw new NotFoundError(`Customer ${emailOrId} was not found.`);
    }

    const customerEmail = user.email.toLowerCase();

    const [accounts, loans, requests, recentTransactions] = await Promise.all([
      accountsCol.find({ owner: customerEmail }).toArray(),
      loansCol.find({ applicant: customerEmail }).sort({ createdAt: -1 }).toArray(),
      requestsCol.find({ user: customerEmail }).sort({ createdAt: -1 }).limit(10).toArray(),
      txCol
        .find({ initiatedBy: customerEmail })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray(),
    ]);

    return {
      customer: user,
      accounts,
      loans,
      requests,
      recentTransactions,
    };
  }

  /**
   * Admin updates customer status (ACTIVE, DEACTIVATED, BLOCKED) with audit log and notification.
   */
  static async updateCustomerStatus(
    emailOrId: string,
    newStatus: CustomerStatus,
    reason: string,
    adminEmail: string
  ): Promise<DbUser> {
    const db = await getDatabase();
    const usersCol = db.collection<DbUser>(COLLECTIONS.USER);
    const auditCol = db.collection<DbAuditLog>(COLLECTIONS.AUDIT_LOGS);
    const notifCol = db.collection<DbNotification>(COLLECTIONS.NOTIFICATIONS);

    const term = emailOrId.trim();
    const user = await usersCol.findOne({
      $or: [{ email: term.toLowerCase() }, { _id: term as any }, { id: term }],
    });

    if (!user) {
      throw new NotFoundError(`Customer ${emailOrId} was not found.`);
    }

    const now = new Date();
    const updated = await usersCol.findOneAndUpdate(
      { _id: user._id },
      {
        $set: {
          status: newStatus,
          statusReason: reason,
          statusUpdatedBy: adminEmail.toLowerCase(),
          statusUpdatedAt: now,
          updatedAt: now,
        },
      },
      { returnDocument: "after" }
    );

    if (!updated) {
      throw new BadRequestError("Failed to update customer status.");
    }

    // Revoke all active Better Auth sessions immediately if customer is blocked or deactivated
    if (newStatus === "BLOCKED" || newStatus === "DEACTIVATED") {
      const sessionCol = db.collection(COLLECTIONS.SESSION);
      const userIdentifier = user.id || String(user._id);
      await sessionCol.deleteMany({
        $or: [
          { userId: userIdentifier },
          { userId: String(user._id) },
        ],
      });
    }

    // Write Audit Log
    await auditCol.insertOne({
      performedBy: adminEmail.toLowerCase(),
      role: "ADMIN",
      action: "CUSTOMER_STATUS_CHANGED",
      targetType: "User",
      target: user.email,
      description: `Changed customer ${user.email} status to ${newStatus}. Reason: ${reason}`,
      metadata: { previousStatus: user.status, newStatus, reason },
      createdAt: now,
    });

    // Notify Customer
    await notifCol.insertOne({
      type: "ACCOUNT_STATUS_CHANGED",
      user: user.email.toLowerCase(),
      title: "Account Status Update",
      message: `Your account administrative status has been set to ${newStatus}. Reason: ${reason}`,
      read: false,
      createdAt: now,
      updatedAt: now,
    });

    return updated;
  }

  /**
   * Admin creates a new bank account for an existing customer.
   */
  static async createBankAccount(
    payload: CreateAccountPayload,
    adminEmail: string
  ): Promise<DbBankAccount> {
    const db = await getDatabase();
    const usersCol = db.collection<DbUser>(COLLECTIONS.USER);
    const accountsCol = db.collection<DbBankAccount>(COLLECTIONS.ACCOUNTS);
    const auditCol = db.collection<DbAuditLog>(COLLECTIONS.AUDIT_LOGS);
    const notifCol = db.collection<DbNotification>(COLLECTIONS.NOTIFICATIONS);

    const user = await usersCol.findOne({ email: payload.owner.toLowerCase() });
    if (!user) {
      throw new NotFoundError(
        `Customer with email ${payload.owner} was not found. In accordance with Trustora Bank security policy, unlinked bank accounts cannot be created. The customer must register for an account first before a bank account can be opened.`
      );
    }

    // If customer exists and name or phone was provided and needs updating
    const userUpdates: Partial<DbUser> = {};
    if (payload.name && (!user.name || user.name.trim() === "")) {
      userUpdates.name = payload.name;
    }
    if (payload.phone && (!user.phone || user.phone !== payload.phone)) {
      userUpdates.phone = payload.phone;
    }
    if (Object.keys(userUpdates).length > 0) {
      await usersCol.updateOne(
        { _id: user._id },
        { $set: { ...userUpdates, updatedAt: new Date() } }
      );
    }

    const accountNumber = await this.generateUniqueAccountNumber();
    const now = new Date();

    const accountDoc: DbBankAccount = {
      owner: payload.owner.toLowerCase(),
      accountNumber,
      type: payload.type,
      openingBalance: payload.openingBalance,
      balance: payload.openingBalance,
      status: "ACTIVE",
      dailyLimit: payload.dailyLimit,
      maxTransaction: payload.maxTransaction,
      minBalance: payload.minBalance,
      createdBy: adminEmail.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    };

    await accountsCol.insertOne(accountDoc);

    // Audit Log
    await auditCol.insertOne({
      performedBy: adminEmail.toLowerCase(),
      role: "ADMIN",
      action: "BANK_ACCOUNT_CREATED",
      targetType: "Account",
      target: accountNumber,
      description: `Created ${payload.type} bank account ${accountNumber} for ${payload.owner}`,
      metadata: { accountNumber, owner: payload.owner, type: payload.type },
      createdAt: now,
    });

    // Notify Customer
    await notifCol.insertOne({
      type: "ACCOUNT_CREATED",
      user: payload.owner.toLowerCase(),
      title: "New Bank Account Opened",
      message: `Your new ${payload.type} bank account (${accountNumber}) has been created successfully.`,
      relatedModel: "Account",
      relatedId: accountNumber,
      read: false,
      createdAt: now,
      updatedAt: now,
    });

    return accountDoc;
  }

  /**
   * Admin freezes or unfreezes a bank account.
   */
  static async updateAccountStatus(
    accountNumber: string,
    newStatus: AccountStatus,
    reason: string,
    adminEmail: string
  ): Promise<DbBankAccount> {
    const db = await getDatabase();
    const accountsCol = db.collection<DbBankAccount>(COLLECTIONS.ACCOUNTS);
    const auditCol = db.collection<DbAuditLog>(COLLECTIONS.AUDIT_LOGS);
    const notifCol = db.collection<DbNotification>(COLLECTIONS.NOTIFICATIONS);

    const now = new Date();
    const updated = await accountsCol.findOneAndUpdate(
      { accountNumber: accountNumber.trim() },
      {
        $set: {
          status: newStatus,
          updatedAt: now,
        },
      },
      { returnDocument: "after" }
    );

    if (!updated) {
      throw new NotFoundError(`Bank account ${accountNumber} was not found.`);
    }

    // Write Audit Log
    await auditCol.insertOne({
      performedBy: adminEmail.toLowerCase(),
      role: "ADMIN",
      action: newStatus === "FROZEN" ? "ACCOUNT_FROZEN" : "ACCOUNT_UNFROZEN",
      targetType: "Account",
      target: accountNumber,
      description: `Set account ${accountNumber} status to ${newStatus}. Reason: ${reason}`,
      metadata: { accountNumber, newStatus, reason },
      createdAt: now,
    });

    // Notify Customer
    await notifCol.insertOne({
      type: "ACCOUNT_STATUS_CHANGED",
      user: updated.owner.toLowerCase(),
      title: `Bank Account ${newStatus}`,
      message: `Your bank account ${accountNumber} status has been updated to ${newStatus}. Reason: ${reason}`,
      relatedModel: "Account",
      relatedId: accountNumber,
      read: false,
      createdAt: now,
      updatedAt: now,
    });

    return updated;
  }

  /**
   * Admin updates per-account limits.
   */
  static async updateAccountLimits(
    accountNumber: string,
    limits: { dailyLimit?: number; maxTransaction?: number; minBalance?: number },
    adminEmail: string
  ): Promise<DbBankAccount> {
    const db = await getDatabase();
    const accountsCol = db.collection<DbBankAccount>(COLLECTIONS.ACCOUNTS);
    const auditCol = db.collection<DbAuditLog>(COLLECTIONS.AUDIT_LOGS);

    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (limits.dailyLimit !== undefined) updateFields.dailyLimit = limits.dailyLimit;
    if (limits.maxTransaction !== undefined) updateFields.maxTransaction = limits.maxTransaction;
    if (limits.minBalance !== undefined) updateFields.minBalance = limits.minBalance;

    const updated = await accountsCol.findOneAndUpdate(
      { accountNumber: accountNumber.trim() },
      { $set: updateFields },
      { returnDocument: "after" }
    );

    if (!updated) {
      throw new NotFoundError(`Bank account ${accountNumber} was not found.`);
    }

    // Audit Log
    await auditCol.insertOne({
      performedBy: adminEmail.toLowerCase(),
      role: "ADMIN",
      action: "ACCOUNT_LIMITS_UPDATED",
      targetType: "Account",
      target: accountNumber,
      description: `Updated limits for account ${accountNumber}`,
      metadata: { accountNumber, ...limits },
      createdAt: new Date(),
    });

    return updated;
  }
}
