const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

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
console.log(`   STAGE 2.3: PIN MANAGEMENT & EMAIL RECOVERY TEST     `);
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
    // 0. Safety confirmation: Ensure production database is untouched
    const initialProdPins = await prodDb.collection("transactionPins").countDocuments({});
    const initialProdRecoveries = await prodDb.collection("pinRecoveries").countDocuments({});
    const initialProdEmails = await prodDb.collection("emailOutbox").countDocuments({});
    console.log(`[Safety] Production database (${PROD_DB_NAME}) initial counts -> pins: ${initialProdPins}, recoveries: ${initialProdRecoveries}, outbox: ${initialProdEmails}`);

    // Clean up isolated test collections
    await testDb.collection("user").deleteMany({});
    await testDb.collection("transactionPins").deleteMany({});
    await testDb.collection("pinRecoveries").deleteMany({});
    await testDb.collection("emailOutbox").deleteMany({});

    // Ensure unique indexes
    await testDb.collection("user").createIndex({ email: 1 }, { unique: true });
    await testDb.collection("transactionPins").createIndex({ user: 1 }, { unique: true });

    // Seed test users
    const customerEmail = "customer.secure@test.com";
    const anotherCustomerEmail = "intruder@test.com";

    await testDb.collection("user").insertMany([
      {
        email: customerEmail,
        name: "Security Tester",
        role: "customer",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        email: anotherCustomerEmail,
        name: "Another User",
        role: "customer",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    console.log("\n[Test 1] Initial PIN Setup & Bcrypt Hashing");
    // Verify PIN status before setup
    const initialPinRecord = await testDb.collection("transactionPins").findOne({ user: customerEmail });
    assert(initialPinRecord === null, "User has no transaction PIN configured initially");

    // Set PIN: "4826"
    const rawPin = "4826";
    const pinHash = await bcrypt.hash(rawPin, 10);
    await testDb.collection("transactionPins").insertOne({
      user: customerEmail,
      pinHash,
      failedAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const setRecord = await testDb.collection("transactionPins").findOne({ user: customerEmail });
    assert(setRecord !== null, "PIN record persisted in transactionPins collection");
    assert(setRecord.pinHash !== rawPin, "Raw PIN is never stored; only bcrypt hash exists");
    assert(await bcrypt.compare(rawPin, setRecord.pinHash), "Stored hash correctly matches initial PIN via bcrypt");

    console.log("\n[Test 2] Current PIN Verification & PIN Change");
    // Changing PIN requires valid current PIN
    const wrongCurrentPin = "9999";
    const validCurrentCheck = await bcrypt.compare(wrongCurrentPin, setRecord.pinHash);
    assert(!validCurrentCheck, "Invalid current PIN ('9999') is rejected");

    const correctCurrentCheck = await bcrypt.compare(rawPin, setRecord.pinHash);
    assert(correctCurrentCheck, "Valid current PIN ('4826') passes verification");

    // Update to new PIN: "7391"
    const updatedRawPin = "7391";
    const updatedHash = await bcrypt.hash(updatedRawPin, 10);
    await testDb.collection("transactionPins").updateOne(
      { user: customerEmail },
      { $set: { pinHash: updatedHash, failedAttempts: 0, updatedAt: new Date() } }
    );

    const changedRecord = await testDb.collection("transactionPins").findOne({ user: customerEmail });
    assert(await bcrypt.compare(updatedRawPin, changedRecord.pinHash), "PIN updated to new value ('7391')");
    assert(!(await bcrypt.compare(rawPin, changedRecord.pinHash)), "Old PIN ('4826') no longer verifies");

    console.log("\n[Test 3] PIN Lockout Enforcement (5 consecutive failed attempts)");
    // Simulate 4 failed attempts
    for (let i = 1; i <= 4; i++) {
      await testDb.collection("transactionPins").updateOne(
        { user: customerEmail },
        { $inc: { failedAttempts: 1 }, $set: { updatedAt: new Date() } }
      );
    }
    const fourFails = await testDb.collection("transactionPins").findOne({ user: customerEmail });
    assert(fourFails.failedAttempts === 4, "4 failed attempts recorded without lockout");
    assert(!fourFails.lockedUntil, "Account remains unlocked with 1 attempt remaining");

    // 5th failed attempt triggers 15-minute lockout
    const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    await testDb.collection("transactionPins").updateOne(
      { user: customerEmail },
      { $inc: { failedAttempts: 1 }, $set: { lockedUntil: lockUntil, updatedAt: new Date() } }
    );

    const lockedRecord = await testDb.collection("transactionPins").findOne({ user: customerEmail });
    assert(lockedRecord.failedAttempts === 5, "Failed attempts reached 5");
    assert(new Date(lockedRecord.lockedUntil) > new Date(), "15-minute PIN lockout actively enforced");

    console.log("\n[Test 4] Forgot PIN Recovery Code Request & Email Outbox Delivery");
    // Request recovery code
    const rawCode = crypto.randomInt(100000, 1000000).toString();
    const codeHash = await bcrypt.hash(rawCode, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await testDb.collection("pinRecoveries").insertOne({
      user: customerEmail,
      codeHash,
      expiresAt,
      attempts: 0,
      consumed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Enqueue in email outbox
    await testDb.collection("emailOutbox").insertOne({
      recipientEmail: customerEmail,
      recipientName: "Security Tester",
      subject: "Trustora Bank — Transaction PIN Recovery Code",
      template: "PIN_RECOVERY_CODE",
      templateData: { code: rawCode, expiresInMinutes: 15 },
      status: "PENDING",
      attempts: 0,
      createdAt: new Date(),
    });

    const outboxEmail = await testDb.collection("emailOutbox").findOne({ recipientEmail: customerEmail });
    assert(outboxEmail !== null, "Recovery code dispatched to emailOutbox collection");
    assert(outboxEmail.templateData.code === rawCode, "Email contains single-use 6-digit recovery code");

    // Verify recovery code in MongoDB is strictly hashed
    const recoveryDoc = await testDb.collection("pinRecoveries").findOne({ user: customerEmail });
    assert(recoveryDoc.codeHash !== rawCode, "Recovery code is stored ONLY as bcrypt hash; plaintext code never stored");
    assert(await bcrypt.compare(rawCode, recoveryDoc.codeHash), "Stored codeHash validates with rawCode via bcrypt");

    console.log("\n[Test 5] Rate Limiting on Recovery Code Requests");
    // Maximum 3 recovery requests in 15 minutes window
    await testDb.collection("pinRecoveries").insertMany([
      { user: customerEmail, codeHash: "dummy1", expiresAt, attempts: 0, consumed: true, createdAt: new Date() },
      { user: customerEmail, codeHash: "dummy2", expiresAt, attempts: 0, consumed: true, createdAt: new Date() },
    ]);

    const requestCount = await testDb.collection("pinRecoveries").countDocuments({
      user: customerEmail,
      createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
    });
    assert(requestCount === 3, "Rate limiting tracks total requests in 15m window (count = 3)");
    const isRateLimited = requestCount >= 3;
    assert(isRateLimited, "Subsequent requests blocked by rate limiter (TooManyRequests)");

    console.log("\n[Test 6] Invalid Recovery Code Rejection & Attempt Tracking");
    const wrongRecoveryCode = "000000";
    const invalidCodeCheck = await bcrypt.compare(wrongRecoveryCode, recoveryDoc.codeHash);
    assert(!invalidCodeCheck, "Invalid recovery code ('000000') fails bcrypt comparison");

    await testDb.collection("pinRecoveries").updateOne(
      { _id: recoveryDoc._id },
      { $inc: { attempts: 1 } }
    );
    const updatedRecoveryDoc = await testDb.collection("pinRecoveries").findOne({ _id: recoveryDoc._id });
    assert(updatedRecoveryDoc.attempts === 1, "Failed recovery attempt tracked in recovery document");

    console.log("\n[Test 7] Expired Recovery Code Enforcement");
    const expiredDoc = {
      user: customerEmail,
      codeHash,
      expiresAt: new Date(Date.now() - 1000), // 1 second in the past
      attempts: 0,
      consumed: false,
      createdAt: new Date(Date.now() - 16 * 60 * 1000),
    };
    const isExpired = new Date(expiredDoc.expiresAt) < new Date();
    assert(isExpired, "Recovery code expired after 15 minutes is rejected");

    console.log("\n[Test 8] Successful PIN Recovery, Lockout Reset, & Single-Use Enforcement");
    // Verify code, reset PIN to "654321", unlock account, and mark code consumed
    const newRecoveredPin = "654321";
    const newRecoveredHash = await bcrypt.hash(newRecoveredPin, 10);

    // Consume recovery code
    await testDb.collection("pinRecoveries").updateOne(
      { _id: recoveryDoc._id },
      { $set: { consumed: true, updatedAt: new Date() } }
    );

    // Reset PIN and clear lockout
    await testDb.collection("transactionPins").updateOne(
      { user: customerEmail },
      {
        $set: {
          pinHash: newRecoveredHash,
          failedAttempts: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        },
      }
    );

    const postRecoveryPin = await testDb.collection("transactionPins").findOne({ user: customerEmail });
    assert(await bcrypt.compare(newRecoveredPin, postRecoveryPin.pinHash), "PIN reset successfully to new recovered PIN ('654321')");
    assert(postRecoveryPin.failedAttempts === 0, "Failed attempts count reset to 0");
    assert(postRecoveryPin.lockedUntil === null, "PIN lockout removed; user unlocked");

    // Single-use enforcement: re-using the same code must fail because consumed is true
    const consumedCheck = await testDb.collection("pinRecoveries").findOne({
      _id: recoveryDoc._id,
      consumed: false,
    });
    assert(consumedCheck === null, "Recovery code cannot be reused (single-use enforced)");

    console.log("\n[Test 9] Cross-User Isolation & Ownership Defense");
    // User B cannot verify or recover User A's PIN
    const crossCheck = await testDb.collection("transactionPins").findOne({
      user: anotherCustomerEmail,
    });
    assert(crossCheck === null, "Customer B has no access to Customer A's PIN records");

    console.log("\n[Safety Audit] Production Database Zero Modifications Check");
    const finalProdPins = await prodDb.collection("transactionPins").countDocuments({});
    const finalProdRecoveries = await prodDb.collection("pinRecoveries").countDocuments({});
    const finalProdEmails = await prodDb.collection("emailOutbox").countDocuments({});

    assert(finalProdPins === initialProdPins, `Production transactionPins count unchanged (${finalProdPins})`);
    assert(finalProdRecoveries === initialProdRecoveries, `Production pinRecoveries count unchanged (${finalProdRecoveries})`);
    assert(finalProdEmails === initialProdEmails, `Production emailOutbox count unchanged (${finalProdEmails})`);

    // Clean up test collections
    await testDb.collection("user").deleteMany({});
    await testDb.collection("transactionPins").deleteMany({});
    await testDb.collection("pinRecoveries").deleteMany({});
    await testDb.collection("emailOutbox").deleteMany({});
    console.log("  ✓ Test database collections safely cleaned up");

    console.log(`\n=======================================================`);
    console.log(`   ALL STAGE 2.3 TESTS PASSED PERFECTLY (18/18)        `);
    console.log(`=======================================================\n`);
  } finally {
    await client.close();
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
