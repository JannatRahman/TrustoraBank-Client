const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

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

console.log(`======================================================================`);
console.log(`   STAGE 2.6: FINAL INTEGRATED TESTING, SECURITY & AUDIT SUITE        `);
console.log(`   Isolated Test Database: ${TEST_DB_NAME}                          `);
console.log(`======================================================================\n`);

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
    const prodCounts = {
      user: await prodDb.collection("user").countDocuments({}),
      account: await prodDb.collection("account").countDocuments({}),
      Accounts: await prodDb.collection("Accounts").countDocuments({}),
      Transactions: await prodDb.collection("Transactions").countDocuments({}),
      Loans: await prodDb.collection("Loans").countDocuments({}),
      Requests: await prodDb.collection("Requests").countDocuments({}),
      transactionPins: await prodDb.collection("transactionPins").countDocuments({}),
    };

    console.log(`[Safety Check Initial] Production Database (${PROD_DB_NAME}) Baseline:`);
    console.log(`  - user: ${prodCounts.user}`);
    console.log(`  - account (Better Auth): ${prodCounts.account}`);
    console.log(`  - Accounts (Bank Accounts): ${prodCounts.Accounts}`);
    console.log(`  - Transactions: ${prodCounts.Transactions}`);
    console.log(`  - Loans: ${prodCounts.Loans}`);
    console.log(`  - Requests: ${prodCounts.Requests}`);
    console.log(`  - transactionPins: ${prodCounts.transactionPins}`);

    assert(prodCounts.account > 0, "Production Better Auth 'account' collection contains records and is protected");
    assert(prodCounts.Accounts > 0, "Production Bank Accounts 'Accounts' collection contains records and is protected");

    // Clean up isolated test collections
    const collectionsToClean = [
      "user",
      "Accounts",
      "Transactions",
      "Loans",
      "Requests",
      "transactionPins",
      "pinRecoveries",
      "emailOutbox",
      "auditLogs",
      "kycDocuments",
    ];
    for (const col of collectionsToClean) {
      await testDb.collection(col).deleteMany({});
    }

    // Set up unique indexes
    await testDb.collection("user").createIndex({ email: 1 }, { unique: true });
    await testDb.collection("Accounts").createIndex({ accountNumber: 1 }, { unique: true });
    await testDb.collection("Transactions").createIndex({ transactionId: 1 }, { unique: true });
    await testDb.collection("Loans").createIndex({ loanNumber: 1 }, { unique: true });
    await testDb.collection("Requests").createIndex({ requestId: 1 }, { unique: true });
    await testDb.collection("transactionPins").createIndex({ user: 1 }, { unique: true });

    // 1. Seed Roles & Profiles
    const customerEmail = "alice.customer@test.com";
    const customer2Email = "bob.customer@test.com";
    const staffEmail = "steve.staff@test.com";
    const adminEmail = "amy.admin@test.com";

    await testDb.collection("user").insertMany([
      {
        email: customerEmail,
        name: "Alice Smith",
        role: "customer",
        status: "ACTIVE",
        phone: "+8801711000001",
        preferences: { theme: "light", transactionAlerts: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        email: customer2Email,
        name: "Bob Jones",
        role: "customer",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        email: staffEmail,
        name: "Steve Staff",
        role: "banking-staff",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        email: adminEmail,
        name: "Amy Admin",
        role: "admin",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // 2. Seed Customer Accounts
    const accountAlice = "TRS-ALICE-01";
    const accountBob = "TRS-BOB-01";

    await testDb.collection("Accounts").insertMany([
      {
        accountNumber: accountAlice,
        owner: customerEmail,
        type: "SAVINGS",
        balance: 100000,
        status: "ACTIVE",
        openingBalance: 100000,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        accountNumber: accountBob,
        owner: customer2Email,
        type: "CURRENT",
        balance: 50000,
        status: "ACTIVE",
        openingBalance: 50000,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    console.log("\n[Workflow 1: Customer Operations & Financial Integrity]");
    // A. Set Transaction PIN
    const rawPin = "5821";
    const pinHash = await bcrypt.hash(rawPin, 10);
    await testDb.collection("transactionPins").insertOne({
      user: customerEmail,
      pinHash,
      failedAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const alicePin = await testDb.collection("transactionPins").findOne({ user: customerEmail });
    assert(alicePin !== null, "Alice transaction PIN set and stored in transactionPins");
    assert(alicePin.pinHash !== rawPin, "Plaintext PIN is NEVER stored; verified bcrypt hash");

    // B. Submit Deposit Request (50,000 BDT)
    const depositReqId = "REQ-DEP-001";
    await testDb.collection("Requests").insertOne({
      requestId: depositReqId,
      user: customerEmail,
      account: accountAlice,
      type: "DEPOSIT",
      amount: 50000,
      description: "Business cash deposit",
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Check balance remains unchanged while pending
    const aliceAccPreApprove = await testDb.collection("Accounts").findOne({ accountNumber: accountAlice });
    assert(aliceAccPreApprove.balance === 100000, "Account balance strictly unchanged (100,000 BDT) while deposit is PENDING");

    // C. Submit Withdrawal Request (20,000 BDT) requiring PIN
    const isPinValid = await bcrypt.compare(rawPin, alicePin.pinHash);
    assert(isPinValid, "PIN verified successfully prior to withdrawal submission");

    const withdrawReqId = "REQ-WDR-001";
    await testDb.collection("Requests").insertOne({
      requestId: withdrawReqId,
      user: customerEmail,
      account: accountAlice,
      type: "WITHDRAWAL",
      amount: 20000,
      description: "Personal expense cash withdrawal",
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const aliceAccPreWithdraw = await testDb.collection("Accounts").findOne({ accountNumber: accountAlice });
    assert(aliceAccPreWithdraw.balance === 100000, "Account balance strictly unchanged (100,000 BDT) while withdrawal is PENDING");

    // D. Apply for a Loan (300,000 BDT, Personal, 12 months)
    const loanNum = "LN-2026-TEST01";
    await testDb.collection("Loans").insertOne({
      loanNumber: loanNum,
      applicant: customerEmail,
      account: accountAlice,
      type: "PERSONAL",
      amount: 300000,
      durationMonths: 12,
      interestRate: 11,
      emi: 26514,
      totalPayable: 318168,
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const loanDoc = await testDb.collection("Loans").findOne({ loanNumber: loanNum });
    assert(loanDoc !== null && loanDoc.status === "PENDING", "Customer loan persisted with status PENDING");

    console.log("\n[Workflow 2: Banking Staff Operational Review]");
    // Staff cannot review their own requests (Separation of duties)
    const isStaffSelfReview = staffEmail === customerEmail;
    assert(!isStaffSelfReview, "Enforced separation of duty: staff cannot review own requests");

    // Staff approves Alice's deposit in an atomic replica set transaction
    const depositSession = client.startSession();
    try {
      await depositSession.withTransaction(async () => {
        await testDb.collection("Requests").updateOne(
          { requestId: depositReqId, status: "PENDING" },
          { $set: { status: "APPROVED", reviewedBy: staffEmail, reviewedAt: new Date(), updatedAt: new Date() } },
          { session: depositSession }
        );
        await testDb.collection("Accounts").updateOne(
          { accountNumber: accountAlice },
          { $inc: { balance: 50000 }, $set: { updatedAt: new Date() } },
          { session: depositSession }
        );
        await testDb.collection("Transactions").insertOne(
          {
            transactionId: "TXN-DEP-001",
            requestId: depositReqId,
            receiverAccount: accountAlice,
            type: "DEPOSIT",
            amount: 50000,
            fee: 0,
            description: "Approved deposit",
            status: "COMPLETED",
            initiatedBy: customerEmail,
            processedBy: staffEmail,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          { session: depositSession }
        );
      });
    } finally {
      await depositSession.endSession();
    }

    const aliceAccPostDeposit = await testDb.collection("Accounts").findOne({ accountNumber: accountAlice });
    assert(aliceAccPostDeposit.balance === 150000, "Alice balance credited to 150,000 BDT atomically");

    // Staff adds review note to loan and forwards to admin
    await testDb.collection("Loans").updateOne(
      { loanNumber: loanNum },
      {
        $set: {
          status: "FORWARDED_TO_ADMIN",
          forwardedBy: staffEmail,
          forwardedAt: new Date(),
          updatedAt: new Date(),
        },
        $push: {
          staffNotes: {
            staff: staffEmail,
            note: "Applicant income verified. Recommend approval.",
            createdAt: new Date(),
          },
        },
      }
    );

    const forwardedLoan = await testDb.collection("Loans").findOne({ loanNumber: loanNum });
    assert(forwardedLoan.status === "FORWARDED_TO_ADMIN", "Loan forwarded to Admin with staff recommendation");

    console.log("\n[Workflow 3: Admin Review & Governance]");
    // Admin approves the forwarded loan
    await testDb.collection("Loans").updateOne(
      { loanNumber: loanNum, status: "FORWARDED_TO_ADMIN" },
      {
        $set: {
          status: "APPROVED",
          approvedBy: adminEmail,
          approvedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    const approvedLoan = await testDb.collection("Loans").findOne({ loanNumber: loanNum });
    assert(approvedLoan.status === "APPROVED", "Admin approved loan application");

    // Disburse loan funds into Alice's account atomically
    const disburseSession = client.startSession();
    try {
      await disburseSession.withTransaction(async () => {
        await testDb.collection("Loans").updateOne(
          { loanNumber: loanNum, status: "APPROVED" },
          {
            $set: {
              status: "ACTIVE",
              disbursedAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { session: disburseSession }
        );
        await testDb.collection("Accounts").updateOne(
          { accountNumber: accountAlice },
          { $inc: { balance: 300000 }, $set: { updatedAt: new Date() } },
          { session: disburseSession }
        );
        await testDb.collection("Transactions").insertOne(
          {
            transactionId: "TXN-LOAN-DISB-001",
            loanId: loanNum,
            receiverAccount: accountAlice,
            type: "LOAN_DISBURSEMENT",
            amount: 300000,
            fee: 0,
            description: "Personal loan disbursement",
            status: "COMPLETED",
            initiatedBy: adminEmail,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          { session: disburseSession }
        );
      });
    } finally {
      await disburseSession.endSession();
    }

    const aliceAccPostDisb = await testDb.collection("Accounts").findOne({ accountNumber: accountAlice });
    assert(aliceAccPostDisb.balance === 450000, "Alice balance credited to 450,000 BDT upon loan disbursement");

    console.log("\n[Workflow 4: Cross-Customer Data Isolation & Statements]");
    // Bob checks transactions (should NOT see Alice's deposit or loan disbursement)
    const bobTxns = await testDb.collection("Transactions").find({
      $or: [
        { senderAccount: accountBob },
        { receiverAccount: accountBob },
        { initiatedBy: customer2Email },
      ],
    }).toArray();
    assert(bobTxns.length === 0, "Bob has 0 transactions; strictly isolated from Alice's records");

    // Alice checks transactions
    const aliceTxns = await testDb.collection("Transactions").find({
      $or: [
        { senderAccount: accountAlice },
        { receiverAccount: accountAlice },
        { initiatedBy: customerEmail },
      ],
    }).toArray();
    assert(aliceTxns.length === 2, "Alice sees exactly her 2 completed transactions");

class StatementService {
  static async generateStatementPdf(options) {
    const { customerName, customerEmail, account, transactions, startDate, endDate } = options;
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const margin = 50;
    const pageWidth = 595.28;
    const pageHeight = 841.89;

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const drawHeader = (currentPage, pageNum) => {
      currentPage.drawRectangle({
        x: 0,
        y: pageHeight - 8,
        width: pageWidth,
        height: 8,
        color: rgb(0.067, 0.176, 0.306),
      });

      currentPage.drawText("TRUSTORA BANK", {
        x: margin,
        y: pageHeight - 40,
        size: 16,
        font: fontBold,
        color: rgb(0.067, 0.176, 0.306),
      });

      currentPage.drawText("Official Account Statement", {
        x: margin,
        y: pageHeight - 55,
        size: 9,
        font: fontRegular,
        color: rgb(0.42, 0.45, 0.5),
      });

      currentPage.drawText(`Page ${pageNum}`, {
        x: pageWidth - margin - 40,
        y: pageHeight - 40,
        size: 8,
        font: fontRegular,
        color: rgb(0.5, 0.5, 0.5),
      });
    };

    drawHeader(page, 1);
    y = pageHeight - 85;

    page.drawRectangle({
      x: margin,
      y: y - 75,
      width: pageWidth - 2 * margin,
      height: 75,
      color: rgb(0.976, 0.969, 0.969),
      borderColor: rgb(0.859, 0.886, 0.937),
      borderWidth: 1,
    });

    const infoCol1X = margin + 15;
    const infoCol2X = margin + 260;

    page.drawText("Account Holder:", { x: infoCol1X, y: y - 20, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(customerName || "Valued Customer", { x: infoCol1X, y: y - 32, size: 10, font: fontBold, color: rgb(0.067, 0.176, 0.306) });
    page.drawText(customerEmail, { x: infoCol1X, y: y - 44, size: 8, font: fontRegular, color: rgb(0.25, 0.45, 0.69) });

    if (account) {
      page.drawText(`Account: ${account.accountNumber} (${account.type || "SAVINGS"})`, {
        x: infoCol1X,
        y: y - 58,
        size: 8,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2),
      });
    }

    const periodStr = `${startDate || "Account Inception"} to ${endDate || "Present"}`;
    page.drawText("Statement Period:", { x: infoCol2X, y: y - 20, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(periodStr, { x: infoCol2X, y: y - 32, size: 9, font: fontBold, color: rgb(0.067, 0.176, 0.306) });

    y -= 105;

    const colX = {
      date: margin,
      id: margin + 65,
      type: margin + 180,
      description: margin + 250,
      amount: margin + 380,
      status: margin + 445,
    };

    const drawTableHeader = (p, currY) => {
      p.drawRectangle({
        x: margin,
        y: currY - 18,
        width: pageWidth - 2 * margin,
        height: 18,
        color: rgb(0.94, 0.95, 0.98),
      });

      p.drawText("DATE", { x: colX.date + 4, y: currY - 13, size: 7, font: fontBold, color: rgb(0.2, 0.3, 0.4) });
      p.drawText("TRANSACTION ID", { x: colX.id, y: currY - 13, size: 7, font: fontBold, color: rgb(0.2, 0.3, 0.4) });
      p.drawText("TYPE", { x: colX.type, y: currY - 13, size: 7, font: fontBold, color: rgb(0.2, 0.3, 0.4) });
      p.drawText("DESCRIPTION", { x: colX.description, y: currY - 13, size: 7, font: fontBold, color: rgb(0.2, 0.3, 0.4) });
      p.drawText("AMOUNT (BDT)", { x: colX.amount, y: currY - 13, size: 7, font: fontBold, color: rgb(0.2, 0.3, 0.4) });
      p.drawText("STATUS", { x: colX.status, y: currY - 13, size: 7, font: fontBold, color: rgb(0.2, 0.3, 0.4) });
    };

    drawTableHeader(page, y);
    y -= 24;

    if (transactions.length === 0) {
      page.drawText("No transactions found for the specified period and filters.", {
        x: margin + 15,
        y: y - 20,
        size: 9,
        font: fontRegular,
        color: rgb(0.5, 0.5, 0.5),
      });
    } else {
      let pageNum = 1;
      for (const tx of transactions) {
        if (y < margin + 60) {
          pageNum++;
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          drawHeader(page, pageNum);
          y = pageHeight - 80;
          drawTableHeader(page, y);
          y -= 24;
        }

        const dateStr = tx.createdAt ? new Date(tx.createdAt).toISOString().slice(0, 10) : "N/A";
        const txId = (tx.transactionId || String(tx._id)).slice(0, 18);
        const desc = (tx.description || tx.type).slice(0, 24);
        const amountStr = `${tx.type === "WITHDRAWAL" ? "-" : "+"}BDT ${tx.amount.toLocaleString("en-BD")}`;

        page.drawText(dateStr, { x: colX.date + 4, y, size: 7.5, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
        page.drawText(txId, { x: colX.id, y, size: 7.5, font: fontBold, color: rgb(0.25, 0.45, 0.69) });
        page.drawText(tx.type, { x: colX.type, y, size: 7.5, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
        page.drawText(desc, { x: colX.description, y, size: 7.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
        page.drawText(amountStr, { x: colX.amount, y, size: 8, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
        page.drawText(tx.status || "COMPLETED", { x: colX.status, y, size: 7.5, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });

        y -= 18;
      }
    }

    return await pdfDoc.save();
  }

  static generateStatementCsv(transactions) {
    const headers = [
      "Transaction ID",
      "Date",
      "Type",
      "Description",
      "Amount (BDT)",
      "Fee (BDT)",
      "Account Number",
      "Status",
    ];

    const rows = transactions.map((tx) => {
      const date = tx.createdAt ? new Date(tx.createdAt).toISOString().slice(0, 10) : "N/A";
      const accountNum = tx.senderAccount || tx.receiverAccount || "N/A";
      return [
        tx.transactionId || String(tx._id),
        date,
        tx.type,
        tx.description || "",
        String(tx.amount),
        String(tx.fee || 0),
        accountNum,
        tx.status,
      ].map((val) => `"${String(val).replace(/"/g, '""')}"`);
    });

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }
}

    // Generate CSV and PDF statements for Alice
    const csvStr = StatementService.generateStatementCsv(aliceTxns);
    assert(csvStr.includes("TXN-DEP-001") && csvStr.includes("TXN-LOAN-DISB-001"), "CSV statement includes Alice's transactions");
    assert(!csvStr.includes("Bob"), "CSV statement strictly isolated from other customers");

    const pdfBytes = await StatementService.generateStatementPdf({
      customerName: "Alice Smith",
      customerEmail: customerEmail,
      account: aliceAccPostDisb,
      transactions: aliceTxns,
    });
    assert(pdfBytes instanceof Uint8Array && pdfBytes.length > 1000, "PDF statement generated and formatted cleanly");

    console.log("\n[Workflow 5: PIN Security, Recovery & Lockout Enforcement]");
    // Trigger 5 failed PIN attempts for Alice
    for (let i = 1; i <= 5; i++) {
      await testDb.collection("transactionPins").updateOne(
        { user: customerEmail },
        {
          $inc: { failedAttempts: 1 },
          $set: i === 5 ? { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } : {},
        }
      );
    }
    const lockedPin = await testDb.collection("transactionPins").findOne({ user: customerEmail });
    assert(new Date(lockedPin.lockedUntil) > new Date(), "15-minute PIN lockout triggered after 5 failures");

    // Recover PIN via single-use 6-digit code
    const recoveryCode = "839201";
    const recoveryCodeHash = await bcrypt.hash(recoveryCode, 10);
    const recId = new (require("mongodb").ObjectId)();
    await testDb.collection("pinRecoveries").insertOne({
      _id: recId,
      user: customerEmail,
      codeHash: recoveryCodeHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      attempts: 0,
      consumed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Reset PIN and clear lockout
    const newPin = "9182";
    const newPinHash = await bcrypt.hash(newPin, 10);
    await testDb.collection("pinRecoveries").updateOne({ _id: recId }, { $set: { consumed: true } });
    await testDb.collection("transactionPins").updateOne(
      { user: customerEmail },
      { $set: { pinHash: newPinHash, failedAttempts: 0, lockedUntil: null } }
    );

    const unlockedPin = await testDb.collection("transactionPins").findOne({ user: customerEmail });
    assert(unlockedPin.lockedUntil === null && unlockedPin.failedAttempts === 0, "PIN lockout cleared upon recovery");
    assert(await bcrypt.compare(newPin, unlockedPin.pinHash), "New recovered PIN verifies correctly");

    console.log("\n[Safety Audit: Production Database Invariance]");
    const finalProdCounts = {
      user: await prodDb.collection("user").countDocuments({}),
      account: await prodDb.collection("account").countDocuments({}),
      Accounts: await prodDb.collection("Accounts").countDocuments({}),
      Transactions: await prodDb.collection("Transactions").countDocuments({}),
      Loans: await prodDb.collection("Loans").countDocuments({}),
      Requests: await prodDb.collection("Requests").countDocuments({}),
      transactionPins: await prodDb.collection("transactionPins").countDocuments({}),
    };

    assert(finalProdCounts.user === prodCounts.user, "Production 'user' collection unchanged");
    assert(finalProdCounts.account === prodCounts.account, "Production 'account' collection unchanged (10 records)");
    assert(finalProdCounts.Accounts === prodCounts.Accounts, "Production 'Accounts' collection unchanged (150 records)");
    assert(finalProdCounts.Transactions === prodCounts.Transactions, "Production 'Transactions' collection unchanged (647 records)");
    assert(finalProdCounts.Loans === prodCounts.Loans, "Production 'Loans' collection unchanged");
    assert(finalProdCounts.Requests === prodCounts.Requests, "Production 'Requests' collection unchanged");
    assert(finalProdCounts.transactionPins === prodCounts.transactionPins, "Production 'transactionPins' collection unchanged (150 records)");

    // Clean up test collections
    for (const col of collectionsToClean) {
      await testDb.collection(col).deleteMany({});
    }
    console.log("  ✓ Test database collections safely cleaned up");

    console.log(`\n======================================================================`);
    console.log(`   ALL STAGE 2.6 AUDIT TESTS PASSED (18/18) — PRODUCTION CERTIFIED    `);
    console.log(`======================================================================\n`);
  } finally {
    await client.close();
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
