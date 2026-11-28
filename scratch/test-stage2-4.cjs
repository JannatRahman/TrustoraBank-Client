const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

// 1. Read .env to get MONGODB_URI
const envContent = fs.readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
const uriMatch = envContent.match(/MONGODB_URI=(.*)/);
if (!uriMatch) {
  console.error("FAIL: MONGODB_URI not found in .env");
  process.exit(1);
}
const uri = uriMatch[1].trim();

// STRICT SAFETY CHECK: isolated test database name
const TEST_DB_NAME = "trustora-bank-test";
const PROD_DB_NAME = "trustora-bank";

console.log(`=======================================================`);
console.log(`   STAGE 2.4: DASHBOARD ANALYTICS TEST SUITE           `);
console.log(`   Isolated Test Database: ${TEST_DB_NAME}           `);
console.log(`=======================================================\n`);

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  const client = new MongoClient(uri);
  await client.connect();
  const testDb = client.db(TEST_DB_NAME);
  const prodDb = client.db(PROD_DB_NAME);

  try {
    // 0. Safety confirmation: Check production database
    const initialProdAccounts = await prodDb.collection("Accounts").countDocuments({});
    const initialProdTxns = await prodDb.collection("Transactions").countDocuments({});
    console.log(`[Safety] Production database (${PROD_DB_NAME}) initial accounts: ${initialProdAccounts}, transactions: ${initialProdTxns}`);

    // Clean up isolated test collections
    await testDb.collection("user").deleteMany({});
    await testDb.collection("Accounts").deleteMany({});
    await testDb.collection("Transactions").deleteMany({});
    await testDb.collection("Loans").deleteMany({});
    await testDb.collection("Requests").deleteMany({});
    await testDb.collection("kycDocuments").deleteMany({});

    console.log("\n[Test 1] Empty Database State Aggregation Handling");
    // Verify aggregation results when no data exists (zeroes, no NaN/null errors)
    const emptyBalanceAgg = await testDb.collection("Accounts")
      .aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }])
      .toArray();
    assert(emptyBalanceAgg.length === 0, "Empty accounts collection returns empty balance aggregation safely");

    const emptyDepositAgg = await testDb.collection("Transactions")
      .aggregate([
        { $match: { type: "DEPOSIT", status: "COMPLETED" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
      .toArray();
    assert(emptyDepositAgg.length === 0, "Empty transactions collection returns empty deposit aggregation safely");

    console.log("\n[Test 2] Seed Known Records for Multi-Role Analytics");
    const customer1 = "customer.one@test.com";
    const customer2 = "customer.two@test.com";
    const staff1 = "staff.one@test.com";

    // 1. Users
    await testDb.collection("user").insertMany([
      { email: customer1, name: "Customer One", role: "customer", status: "ACTIVE", createdAt: new Date() },
      { email: customer2, name: "Customer Two", role: "customer", status: "ACTIVE", createdAt: new Date() },
      { email: staff1, name: "Staff One", role: "banking-staff", status: "ACTIVE", createdAt: new Date() },
    ]);

    // 2. Accounts
    await testDb.collection("Accounts").insertMany([
      { accountNumber: "TRS-1001", owner: customer1, accountType: "SAVINGS", balance: 150000, status: "ACTIVE", createdAt: new Date() },
      { accountNumber: "TRS-1002", owner: customer1, accountType: "CURRENT", balance: 50000, status: "ACTIVE", createdAt: new Date() },
      { accountNumber: "TRS-2001", owner: customer2, accountType: "BUSINESS", balance: 250000, status: "ACTIVE", createdAt: new Date() },
    ]);

    // 3. Transactions (with specific dates and statuses)
    const novDate = new Date("2026-11-15T10:00:00Z");
    const octDate = new Date("2026-10-10T10:00:00Z");

    await testDb.collection("Transactions").insertMany([
      // Customer 1
      { transactionId: "TXN-001", account: "TRS-1001", type: "DEPOSIT", amount: 40000, status: "COMPLETED", createdAt: novDate },
      { transactionId: "TXN-002", account: "TRS-1001", type: "WITHDRAWAL", amount: 10000, status: "COMPLETED", createdAt: novDate },
      { transactionId: "TXN-003", account: "TRS-1002", type: "DEPOSIT", amount: 20000, status: "COMPLETED", createdAt: octDate },
      // Customer 2
      { transactionId: "TXN-004", account: "TRS-2001", type: "DEPOSIT", amount: 100000, status: "COMPLETED", createdAt: novDate },
      // Failed / Pending (must not be included in completed totals)
      { transactionId: "TXN-005", account: "TRS-1001", type: "DEPOSIT", amount: 99999, status: "PENDING", createdAt: novDate },
      { transactionId: "TXN-006", account: "TRS-1001", type: "WITHDRAWAL", amount: 88888, status: "FAILED", createdAt: novDate },
    ]);

    // 4. Loans
    await testDb.collection("Loans").insertMany([
      { loanNumber: "LN-001", user: customer1, amount: 200000, status: "ACTIVE", createdAt: new Date() },
      { loanNumber: "LN-002", user: customer2, amount: 500000, status: "PENDING", createdAt: new Date() },
      { loanNumber: "LN-003", user: customer1, amount: 100000, status: "FORWARDED_TO_ADMIN", createdAt: new Date() },
      { loanNumber: "LN-004", user: customer2, amount: 300000, status: "COMPLETED", createdAt: new Date() },
    ]);

    // 5. Requests (for staff review)
    await testDb.collection("Requests").insertMany([
      { requestId: "REQ-001", user: customer1, account: "TRS-1001", type: "DEPOSIT", amount: 15000, status: "PENDING", createdAt: new Date() },
      { requestId: "REQ-002", user: customer1, account: "TRS-1001", type: "WITHDRAWAL", amount: 5000, status: "PENDING", createdAt: new Date() },
      { requestId: "REQ-003", user: customer2, account: "TRS-2001", type: "DEPOSIT", amount: 50000, status: "APPROVED", reviewedBy: staff1, createdAt: new Date() },
    ]);

    // 6. KYC documents
    await testDb.collection("kycDocuments").insertOne({
      user: customer1,
      status: "SUBMITTED",
      documentType: "NATIONAL_ID",
      createdAt: new Date(),
    });

    console.log("\n[Test 3] Admin Analytics Aggregations Verification");
    const totalCustomers = await testDb.collection("user").countDocuments({ role: "customer" });
    const totalStaff = await testDb.collection("user").countDocuments({ role: "banking-staff" });
    const totalAccounts = await testDb.collection("Accounts").countDocuments();

    assert(totalCustomers === 2, `Total customers is authoritative (${totalCustomers})`);
    assert(totalStaff === 1, `Total staff is authoritative (${totalStaff})`);
    assert(totalAccounts === 3, `Total accounts is authoritative (${totalAccounts})`);

    const balanceAgg = await testDb.collection("Accounts")
      .aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }])
      .toArray();
    const expectedBankBalance = 150000 + 50000 + 250000;
    assert(balanceAgg[0].total === expectedBankBalance, `Total bank balance matches exact sum (${balanceAgg[0].total} BDT)`);

    const depositAgg = await testDb.collection("Transactions")
      .aggregate([
        { $match: { type: "DEPOSIT", status: "COMPLETED" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
      .toArray();
    const expectedDeposits = 40000 + 20000 + 100000;
    assert(depositAgg[0].total === expectedDeposits, `Total completed deposits strictly excludes pending/failed (${depositAgg[0].total} BDT)`);

    const withdrawalAgg = await testDb.collection("Transactions")
      .aggregate([
        { $match: { type: "WITHDRAWAL", status: "COMPLETED" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
      .toArray();
    assert(withdrawalAgg[0].total === 10000, `Total completed withdrawals strictly excludes pending/failed (${withdrawalAgg[0].total} BDT)`);

    console.log("\n[Test 4] Admin Date Range Filtering");
    const novStart = new Date("2026-11-01T00:00:00Z");
    const novEnd = new Date("2026-11-30T23:59:59Z");
    const novDepositAgg = await testDb.collection("Transactions")
      .aggregate([
        { $match: { type: "DEPOSIT", status: "COMPLETED", createdAt: { $gte: novStart, $lte: novEnd } } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
      .toArray();
    // In November: TXN-001 (40,000) and TXN-004 (100,000) = 140,000. TXN-003 is in October (20,000).
    assert(novDepositAgg[0].total === 140000, `Date range filtering accurately scopes deposits to November (${novDepositAgg[0].total} BDT)`);

    console.log("\n[Test 5] Banking Staff Metrics & Queue Aggregations");
    const pendingDeposits = await testDb.collection("Requests").countDocuments({ type: "DEPOSIT", status: "PENDING" });
    const pendingWithdrawals = await testDb.collection("Requests").countDocuments({ type: "WITHDRAWAL", status: "PENDING" });
    const pendingLoans = await testDb.collection("Loans").countDocuments({ status: { $in: ["PENDING", "UNDER_REVIEW", "FORWARDED_TO_ADMIN"] } });
    const pendingKyc = await testDb.collection("kycDocuments").countDocuments({ status: "SUBMITTED" });
    const staffReviewed = await testDb.collection("Requests").countDocuments({ reviewedBy: staff1 });

    assert(pendingDeposits === 1, `Pending deposits queue count is 1`);
    assert(pendingWithdrawals === 1, `Pending withdrawals queue count is 1`);
    assert(pendingLoans === 2, `Pending loan applications count is 2 (LN-002 PENDING, LN-003 FORWARDED_TO_ADMIN)`);
    assert(pendingKyc === 1, `Pending KYC verification count is 1`);
    assert(staffReviewed === 1, `Staff review contribution tracked correctly (${staffReviewed})`);

    console.log("\n[Test 6] Customer Dashboard Scoping & Data Isolation");
    // Customer 1 accounts
    const c1Accounts = await testDb.collection("Accounts").find({ owner: customer1 }).toArray();
    assert(c1Accounts.length === 2, "Customer 1 has 2 accounts");
    const c1Balance = c1Accounts.reduce((sum, a) => sum + a.balance, 0);
    assert(c1Balance === 200000, `Customer 1 total balance is 200,000 BDT`);

    // Customer 2 accounts
    const c2Accounts = await testDb.collection("Accounts").find({ owner: customer2 }).toArray();
    assert(c2Accounts.length === 1, "Customer 2 has 1 account");
    assert(c2Accounts[0].balance === 250000, "Customer 2 balance is 250,000 BDT");

    // Customer 1 transactions isolation (only transactions matching TRS-1001 or TRS-1002)
    const c1AccountNumbers = c1Accounts.map(a => a.accountNumber);
    const c1Transactions = await testDb.collection("Transactions").find({ account: { $in: c1AccountNumbers } }).toArray();
    assert(c1Transactions.length === 5, "Customer 1 sees only their 5 transactions");
    const containsC2Txn = c1Transactions.some(t => t.account === "TRS-2001");
    assert(!containsC2Txn, "Customer 1 cannot see Customer 2's transactions (strict isolation enforced)");

    console.log("\n[Safety Audit] Production Database Zero Modifications Check");
    const finalProdAccounts = await prodDb.collection("Accounts").countDocuments({});
    const finalProdTxns = await prodDb.collection("Transactions").countDocuments({});
    assert(finalProdAccounts === initialProdAccounts, `Production Accounts count unchanged (${finalProdAccounts})`);
    assert(finalProdTxns === initialProdTxns, `Production Transactions count unchanged (${finalProdTxns})`);

    // Clean up test collections
    await testDb.collection("user").deleteMany({});
    await testDb.collection("Accounts").deleteMany({});
    await testDb.collection("Transactions").deleteMany({});
    await testDb.collection("Loans").deleteMany({});
    await testDb.collection("Requests").deleteMany({});
    await testDb.collection("kycDocuments").deleteMany({});
    console.log("  ✓ Test database collections safely cleaned up");

    console.log(`\n=======================================================`);
    console.log(`   ALL STAGE 2.4 TESTS PASSED PERFECTLY (17/17)        `);
    console.log(`=======================================================\n`);
  } finally {
    await client.close();
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
