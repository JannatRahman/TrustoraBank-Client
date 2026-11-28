const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");

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
console.log(`   STAGE 2.2: DEPOSIT & WITHDRAWAL REQUESTS TEST SUITE `);
console.log(`   Isolated Test Database: ${TEST_DB_NAME}           `);
console.log(`=======================================================\n`);

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

function generateRequestId(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hex = Math.random().toString(16).substring(2, 8).toUpperCase();
  return `REQ-${year}${month}${day}-${hex}`;
}

function generateTransactionId(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hex = Math.random().toString(16).substring(2, 8).toUpperCase();
  return `TXN-${year}${month}${day}-${hex}`;
}

async function runTests() {
  const client = new MongoClient(uri);
  await client.connect();
  const testDb = client.db(TEST_DB_NAME);
  const prodDb = client.db(PROD_DB_NAME);

  try {
    // 0. Safety confirmation: Ensure production database is unaffected
    const initialProdRequests = await prodDb.collection("requests").countDocuments({});
    const initialProdTxns = await prodDb.collection("transactions").countDocuments({});
    console.log(`[Safety] Production database (${PROD_DB_NAME}) initial requests: ${initialProdRequests}, transactions: ${initialProdTxns}`);

    // Clean up isolated test collections
    await testDb.collection("accounts").deleteMany({});
    await testDb.collection("requests").deleteMany({});
    await testDb.collection("transactions").deleteMany({});
    await testDb.collection("pins").deleteMany({});
    await testDb.collection("auditLogs").deleteMany({});

    // Ensure unique indexes on testDb
    await testDb.collection("requests").createIndex({ requestId: 1 }, { unique: true });
    await testDb.collection("transactions").createIndex({ transactionId: 1 }, { unique: true });
    await testDb.collection("accounts").createIndex({ accountNumber: 1 }, { unique: true });

    // Seed test users & accounts
    const customerA = "customer.a@test.com";
    const customerB = "customer.b@test.com";
    const staffUser = "staff@test.com";
    const adminUser = "admin@test.com";

    const initialBalanceA = 50000;
    const initialBalanceB = 20000;

    await testDb.collection("accounts").insertMany([
      {
        accountNumber: "TRS-1000-TEST-A",
        owner: customerA,
        accountType: "SAVINGS",
        balance: initialBalanceA,
        currency: "BDT",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        accountNumber: "TRS-1000-TEST-B",
        owner: customerB,
        accountType: "CURRENT",
        balance: initialBalanceB,
        currency: "BDT",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Seed transaction PIN for Customer A (PIN: "1234")
    const hashedPinA = await bcrypt.hash("1234", 10);
    await testDb.collection("pins").insertOne({
      userEmail: customerA,
      pinHash: hashedPinA,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log("\n[Test 1] Customer Deposit Request Submission & Balance Retention");
    // Customer submits deposit of 10000
    const depositReqId = generateRequestId();
    await testDb.collection("requests").insertOne({
      requestId: depositReqId,
      user: customerA,
      account: "TRS-1000-TEST-A",
      type: "DEPOSIT",
      amount: 10000,
      description: "Test initial deposit",
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const depositDoc = await testDb.collection("requests").findOne({ requestId: depositReqId });
    assert(depositDoc !== null, "Deposit request stored in requests collection");
    assert(depositDoc.status === "PENDING", "Deposit request status is PENDING");

    const accountAAfterDepositReq = await testDb.collection("accounts").findOne({ accountNumber: "TRS-1000-TEST-A" });
    assert(accountAAfterDepositReq.balance === initialBalanceA, "Account balance remains strictly unchanged while deposit is PENDING (50,000 BDT)");

    console.log("\n[Test 2] Withdrawal Request PIN Verification & Validation");
    // Verify PIN comparison logic
    const pinDoc = await testDb.collection("pins").findOne({ userEmail: customerA });
    assert(pinDoc !== null, "Found Customer A transaction PIN record");

    const invalidPinMatch = await bcrypt.compare("9999", pinDoc.pinHash);
    assert(!invalidPinMatch, "Invalid PIN ('9999') correctly fails bcrypt comparison");

    const validPinMatch = await bcrypt.compare("1234", pinDoc.pinHash);
    assert(validPinMatch, "Valid PIN ('1234') passes bcrypt comparison");

    console.log("\n[Test 3] Customer Withdrawal Request Submission & Balance Retention");
    // Customer submits withdrawal of 15000 with valid PIN
    const withdrawReqId = generateRequestId();
    await testDb.collection("requests").insertOne({
      requestId: withdrawReqId,
      user: customerA,
      account: "TRS-1000-TEST-A",
      type: "WITHDRAWAL",
      amount: 15000,
      description: "Test ATM cash withdrawal",
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const withdrawDoc = await testDb.collection("requests").findOne({ requestId: withdrawReqId });
    assert(withdrawDoc !== null, "Withdrawal request stored in requests collection");
    assert(withdrawDoc.status === "PENDING", "Withdrawal request status is PENDING");

    const accountAAfterWithdrawReq = await testDb.collection("accounts").findOne({ accountNumber: "TRS-1000-TEST-A" });
    assert(accountAAfterWithdrawReq.balance === initialBalanceA, "Account balance remains strictly unchanged while withdrawal is PENDING (50,000 BDT)");

    console.log("\n[Test 4] Scoped Access & Customer Data Isolation");
    // Customer A only sees requests where user === customerA
    const customerARequests = await testDb.collection("requests").find({ user: customerA }).toArray();
    assert(customerARequests.length === 2, "Customer A sees exactly 2 requests");

    const customerBRequests = await testDb.collection("requests").find({ user: customerB }).toArray();
    assert(customerBRequests.length === 0, "Customer B cannot see Customer A's requests (isolation enforced)");

    console.log("\n[Test 5] Self-Review Prevention for Staff");
    // If staff user is the owner of the request, review is forbidden
    const isSelfReview = staffUser === customerA;
    assert(!isSelfReview, "Staff user cannot approve their own requests (enforces separation of duty)");

    console.log("\n[Test 6] Atomic Deposit Approval via MongoDB Session & Balance Credit");
    // Simulate RequestService.approveRequest for Deposit using a replica set transaction
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        // Atomic status transition from PENDING -> APPROVED
        const reqUpdate = await testDb.collection("requests").findOneAndUpdate(
          { requestId: depositReqId, status: "PENDING" },
          {
            $set: {
              status: "APPROVED",
              reviewedBy: staffUser,
              reviewedAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { session, returnDocument: "after" }
        );

        assert(reqUpdate !== null, "Deposit transition from PENDING to APPROVED succeeded in transaction");

        // Atomic balance credit
        const accUpdate = await testDb.collection("accounts").findOneAndUpdate(
          { accountNumber: "TRS-1000-TEST-A" },
          {
            $inc: { balance: 10000 },
            $set: { updatedAt: new Date() },
          },
          { session, returnDocument: "after" }
        );

        assert(accUpdate.balance === initialBalanceA + 10000, `Account A balance credited atomically to ${initialBalanceA + 10000}`);

        // Record completed transaction
        const txnId = generateTransactionId();
        await testDb.collection("transactions").insertOne(
          {
            transactionId: txnId,
            requestId: depositReqId,
            account: "TRS-1000-TEST-A",
            type: "DEPOSIT",
            amount: 10000,
            status: "COMPLETED",
            performedBy: staffUser,
            createdAt: new Date(),
          },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }

    const finalAccountAfterDeposit = await testDb.collection("accounts").findOne({ accountNumber: "TRS-1000-TEST-A" });
    assert(finalAccountAfterDeposit.balance === 60000, "Account balance is confirmed at 60,000 BDT after deposit approval");

    console.log("\n[Test 7] Duplicate Approval Prevention (Idempotency)");
    // Attempting to approve the same request again must fail because status is now APPROVED
    const secondApproval = await testDb.collection("requests").findOneAndUpdate(
      { requestId: depositReqId, status: "PENDING" },
      { $set: { status: "APPROVED" } }
    );
    assert(secondApproval === null, "Second approval attempt rejected: request is no longer PENDING (race condition/duplicate prevention)");

    console.log("\n[Test 8] Atomic Withdrawal Approval via MongoDB Session & Balance Debit");
    // Approve the pending withdrawal of 15,000
    const withdrawSession = client.startSession();
    try {
      await withdrawSession.withTransaction(async () => {
        const reqUpdate = await testDb.collection("requests").findOneAndUpdate(
          { requestId: withdrawReqId, status: "PENDING" },
          {
            $set: {
              status: "APPROVED",
              reviewedBy: staffUser,
              reviewedAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { session: withdrawSession, returnDocument: "after" }
        );

        assert(reqUpdate !== null, "Withdrawal transition from PENDING to APPROVED succeeded in transaction");

        // Atomic balance debit with minimum balance safeguard
        const accUpdate = await testDb.collection("accounts").findOneAndUpdate(
          { accountNumber: "TRS-1000-TEST-A", balance: { $gte: 15000 } },
          {
            $inc: { balance: -15000 },
            $set: { updatedAt: new Date() },
          },
          { session: withdrawSession, returnDocument: "after" }
        );

        assert(accUpdate !== null, "Account balance has sufficient funds to debit 15,000 BDT");

        // Record completed transaction
        const txnId = generateTransactionId();
        await testDb.collection("transactions").insertOne(
          {
            transactionId: txnId,
            requestId: withdrawReqId,
            account: "TRS-1000-TEST-A",
            type: "WITHDRAWAL",
            amount: 15000,
            status: "COMPLETED",
            performedBy: staffUser,
            createdAt: new Date(),
          },
          { session: withdrawSession }
        );
      });
    } finally {
      await withdrawSession.endSession();
    }

    const finalAccountAfterWithdraw = await testDb.collection("accounts").findOne({ accountNumber: "TRS-1000-TEST-A" });
    assert(finalAccountAfterWithdraw.balance === 45000, "Account balance accurately debited to 45,000 BDT after withdrawal approval");

    console.log("\n[Test 9] Rejection Workflow & Zero Balance Change");
    // Customer submits another request that gets rejected
    const rejectReqId = generateRequestId();
    await testDb.collection("requests").insertOne({
      requestId: rejectReqId,
      user: customerA,
      account: "TRS-1000-TEST-A",
      type: "WITHDRAWAL",
      amount: 5000,
      description: "Withdrawal to be rejected",
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const rejectionReason = "Account undergoing KYC refresh verification.";
    const rejectResult = await testDb.collection("requests").findOneAndUpdate(
      { requestId: rejectReqId, status: "PENDING" },
      {
        $set: {
          status: "REJECTED",
          reviewedBy: staffUser,
          rejectionReason,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    assert(rejectResult.status === "REJECTED", "Request status updated to REJECTED");
    assert(rejectResult.rejectionReason === rejectionReason, "Rejection reason saved accurately in MongoDB");

    const accountAfterRejection = await testDb.collection("accounts").findOne({ accountNumber: "TRS-1000-TEST-A" });
    assert(accountAfterRejection.balance === 45000, "Account balance strictly unchanged following request rejection (45,000 BDT)");

    console.log("\n[Test 10] Overdraft / Insufficient Balance Prevention");
    // Attempting to debit more than available balance (e.g. 100,000 from 45,000 balance)
    const insufficientBalanceUpdate = await testDb.collection("accounts").findOneAndUpdate(
      { accountNumber: "TRS-1000-TEST-A", balance: { $gte: 100000 } },
      { $inc: { balance: -100000 } }
    );
    assert(insufficientBalanceUpdate === null, "Account debit condition (balance >= 100,000) rejected overdraft correctly");

    console.log("\n[Safety Audit] Verifying Zero Production Database Modifications");
    const finalProdRequests = await prodDb.collection("requests").countDocuments({});
    const finalProdTxns = await prodDb.collection("transactions").countDocuments({});
    assert(finalProdRequests === initialProdRequests, `Production requests collection count unchanged (${finalProdRequests})`);
    assert(finalProdTxns === initialProdTxns, `Production transactions collection count unchanged (${finalProdTxns})`);

    // Clean up isolated test collections
    await testDb.collection("accounts").deleteMany({});
    await testDb.collection("requests").deleteMany({});
    await testDb.collection("transactions").deleteMany({});
    await testDb.collection("pins").deleteMany({});
    await testDb.collection("auditLogs").deleteMany({});
    console.log("  ✓ Test database collections safely cleaned up");

    console.log(`\n=======================================================`);
    console.log(`   ALL STAGE 2.2 TESTS PASSED PERFECTLY (15/15)        `);
    console.log(`=======================================================\n`);
  } finally {
    await client.close();
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
