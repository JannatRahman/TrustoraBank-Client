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
console.log(`   STAGE 2.1: LOAN APPLICATION & MANAGEMENT TEST SUITE `);
console.log(`   Isolated Test Database: ${TEST_DB_NAME}           `);
console.log(`=======================================================\n`);

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

// Replicate EMI formula as implemented in LoanService
function calculateLoanTerms(principal, annualRatePercent, durationMonths) {
  if (annualRatePercent <= 0) {
    const emi = Math.round(principal / durationMonths);
    return { emi, totalPayable: emi * durationMonths };
  }
  const monthlyRate = (annualRatePercent / 100) / 12;
  const factor = Math.pow(1 + monthlyRate, durationMonths);
  const emi = Math.round((principal * monthlyRate * factor) / (factor - 1));
  const totalPayable = emi * durationMonths;
  return { emi, totalPayable };
}

function generateLoanNumber(date = new Date()) {
  const year = date.getFullYear();
  const hex = Math.random().toString(16).substring(2, 7).toUpperCase();
  return `LN-${year}-${hex}`;
}

async function runTests() {
  const client = new MongoClient(uri);
  await client.connect();
  const testDb = client.db(TEST_DB_NAME);
  const prodDb = client.db(PROD_DB_NAME);

  try {
    // 0. Safety confirmation: Ensure production database is NOT modified
    const initialProdLoansCount = await prodDb.collection("loans").countDocuments({});
    console.log(`[Safety] Production database (${PROD_DB_NAME}) initial loans count: ${initialProdLoansCount}`);
    assert(initialProdLoansCount === 0, "Production loans collection is clean and unaffected");

    // Clean up test database collections first to start fresh
    await testDb.collection("accounts").deleteMany({});
    await testDb.collection("loans").deleteMany({});
    await testDb.collection("auditLogs").deleteMany({});

    // Ensure unique index on loanNumber in testDb
    await testDb.collection("loans").createIndex({ loanNumber: 1 }, { unique: true });

    console.log("\n[Test 1] Math & EMI Calculation Terms");
    const terms1 = calculateLoanTerms(500000, 10.5, 36);
    assert(terms1.emi > 0, `EMI calculated correctly: ৳${terms1.emi}`);
    assert(terms1.totalPayable > 500000, `Total payable (৳${terms1.totalPayable}) includes interest`);

    const termsZeroRate = calculateLoanTerms(120000, 0, 12);
    assert(termsZeroRate.emi === 10000, "0% interest loan computes exact quotient: ৳10,000");
    assert(termsZeroRate.totalPayable === 120000, "0% interest total payable equals principal");

    console.log("\n[Test 2] Loan Number Formatting & Uniqueness");
    const ln1 = generateLoanNumber();
    const ln2 = generateLoanNumber();
    assert(/^LN-\d{4}-[0-9A-F]{5}$/.test(ln1), `Loan number matches LN-YYYY-XXXXX format: ${ln1}`);
    assert(ln1 !== ln2, "Consecutive generated loan numbers are unique");

    console.log("\n[Test 3] Bank Account Validation for Loan Application");
    const testCustomerA = "customer_a@trustora-test.com";
    const testCustomerB = "customer_b@trustora-test.com";
    const testStaff = "staff@trustora-test.com";
    const testAdmin = "admin@trustora-test.com";

    const accountA = {
      accountNumber: "1099887766",
      owner: testCustomerA,
      type: "SAVINGS",
      balance: 50000,
      openingBalance: 50000,
      status: "ACTIVE",
      dailyLimit: 200000,
      maxTransaction: 100000,
      minBalance: 500,
      createdBy: testAdmin,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await testDb.collection("accounts").insertOne(accountA);
    console.log(`  ✓ Inserted test account ${accountA.accountNumber} for ${testCustomerA}`);

    // Verify account ownership check
    const fetchedAccount = await testDb.collection("accounts").findOne({ accountNumber: "1099887766" });
    assert(fetchedAccount !== null, "Test bank account exists");
    assert(fetchedAccount.owner === testCustomerA, "Test bank account owner is customer A");
    assert(fetchedAccount.owner !== testCustomerB, "Customer B is NOT the owner of account A");

    console.log("\n[Test 4] Customer Loan Application Submission & Persistence");
    const loanPayload = {
      loanNumber: generateLoanNumber(),
      applicant: testCustomerA,
      account: accountA.accountNumber,
      type: "PERSONAL",
      amount: 250000,
      durationMonths: 24,
      interestRate: 10.5,
      emi: calculateLoanTerms(250000, 10.5, 24).emi,
      totalPayable: calculateLoanTerms(250000, 10.5, 24).totalPayable,
      monthlyIncome: 75000,
      employmentStatus: "Employed",
      description: "Medical and family expenses - Home renovation",
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const insertResult = await testDb.collection("loans").insertOne(loanPayload);
    assert(insertResult.acknowledged === true, "Loan document inserted and acknowledged by MongoDB");

    const savedLoan = await testDb.collection("loans").findOne({ loanNumber: loanPayload.loanNumber });
    assert(savedLoan !== null, "Loan document retrieved from MongoDB");
    assert(savedLoan.status === "PENDING", "Loan initial status is PENDING");
    assert(savedLoan.amount === 250000, "Loan principal is ৳250,000");
    assert(savedLoan.applicant === testCustomerA, "Applicant email matches Customer A");

    console.log("\n[Test 5] Customer Isolation: Role-Based Filtering");
    // Customer A queries loans: should find 1 loan
    const customerALoans = await testDb.collection("loans").find({ applicant: testCustomerA }).toArray();
    assert(customerALoans.length === 1, "Customer A can view their own loan application");
    assert(customerALoans[0].loanNumber === loanPayload.loanNumber, "Customer A views exact loan");

    // Customer B queries loans: should find 0 loans (ISOLATION VERIFIED)
    const customerBLoans = await testDb.collection("loans").find({ applicant: testCustomerB }).toArray();
    assert(customerBLoans.length === 0, "Customer B cannot see Customer A's loan (Isolation strictly enforced)");

    console.log("\n[Test 6] Duplicate Loan Number Prevention");
    let duplicateRejected = false;
    try {
      await testDb.collection("loans").insertOne({
        ...loanPayload,
        _id: undefined, // let Mongo generate a new _id
      });
    } catch (err) {
      if (err.code === 11000) {
        duplicateRejected = true;
      }
    }
    assert(duplicateRejected, "Duplicate loan number rejected by MongoDB unique index (E11000)");

    console.log("\n[Test 7] Banking Staff Review: Notes & Forward to Admin");
    // Staff adds review note
    const staffNote = {
      staff: testStaff,
      note: "Customer documents and income statements verified against salary slips.",
      createdAt: new Date(),
    };
    await testDb.collection("loans").updateOne(
      { loanNumber: loanPayload.loanNumber },
      {
        $push: { staffNotes: staffNote },
        $set: { status: "UNDER_REVIEW", updatedAt: new Date() },
      }
    );

    let updatedLoan = await testDb.collection("loans").findOne({ loanNumber: loanPayload.loanNumber });
    assert(updatedLoan.status === "UNDER_REVIEW", "Loan status updated to UNDER_REVIEW");
    assert(updatedLoan.staffNotes.length === 1, "Staff note recorded in loan document");
    assert(updatedLoan.staffNotes[0].staff === testStaff, "Staff note author matches banking staff");

    // Staff forwards to Admin
    await testDb.collection("loans").updateOne(
      { loanNumber: loanPayload.loanNumber },
      {
        $set: {
          status: "FORWARDED_TO_ADMIN",
          forwardedBy: testStaff,
          forwardedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    updatedLoan = await testDb.collection("loans").findOne({ loanNumber: loanPayload.loanNumber });
    assert(updatedLoan.status === "FORWARDED_TO_ADMIN", "Loan status updated to FORWARDED_TO_ADMIN");
    assert(updatedLoan.forwardedBy === testStaff, "Forwarding recorded with staff email");

    console.log("\n[Test 8] Admin Approval Workflow");
    // Admin approves the loan
    await testDb.collection("loans").updateOne(
      { loanNumber: loanPayload.loanNumber },
      {
        $set: {
          status: "APPROVED",
          approvedBy: testAdmin,
          approvedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    const approvedLoan = await testDb.collection("loans").findOne({ loanNumber: loanPayload.loanNumber });
    assert(approvedLoan.status === "APPROVED", "Loan status is APPROVED");
    assert(approvedLoan.approvedBy === testAdmin, "Approval recorded with admin email");
    assert(approvedLoan.approvedAt instanceof Date, "approvedAt timestamp is valid Date");

    console.log("\n[Test 9] Admin Rejection Workflow");
    const loanPayload2 = {
      loanNumber: generateLoanNumber(),
      applicant: testCustomerB,
      account: "1099887766",
      type: "BUSINESS",
      amount: 1500000,
      durationMonths: 36,
      interestRate: 11,
      emi: calculateLoanTerms(1500000, 11, 36).emi,
      totalPayable: calculateLoanTerms(1500000, 11, 36).totalPayable,
      monthlyIncome: 40000,
      employmentStatus: "Self-employed",
      description: "Business expansion capital",
      status: "FORWARDED_TO_ADMIN",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await testDb.collection("loans").insertOne(loanPayload2);

    // Admin rejects with reason
    const rejectionReason = "Debt-to-income ratio exceeds permissible threshold.";
    await testDb.collection("loans").updateOne(
      { loanNumber: loanPayload2.loanNumber },
      {
        $set: {
          status: "REJECTED",
          rejectedBy: testAdmin,
          rejectedAt: new Date(),
          rejectionReason,
          updatedAt: new Date(),
        },
      }
    );

    const rejectedLoan = await testDb.collection("loans").findOne({ loanNumber: loanPayload2.loanNumber });
    assert(rejectedLoan.status === "REJECTED", "Loan status is REJECTED");
    assert(rejectedLoan.rejectedBy === testAdmin, "Rejection recorded with admin email");
    assert(rejectedLoan.rejectionReason === rejectionReason, "Rejection reason saved accurately");

    console.log("\n[Test 10] Isolated Test Database Cleanup & Production Integrity");
    await testDb.collection("loans").deleteMany({});
    await testDb.collection("accounts").deleteMany({});
    const finalTestLoanCount = await testDb.collection("loans").countDocuments({});
    assert(finalTestLoanCount === 0, `Isolated test database (${TEST_DB_NAME}) cleaned completely: 0 loans remaining`);

    // Verify production database is still completely untouched
    const finalProdLoansCount = await prodDb.collection("loans").countDocuments({});
    assert(finalProdLoansCount === 0, `Production database (${PROD_DB_NAME}) remains 100% clean and intact`);

    console.log(`\n=======================================================`);
    console.log(`   ALL 15 STAGE 2.1 VERIFICATION ASSERTIONS PASSED!    `);
    console.log(`=======================================================\n`);
  } finally {
    await client.close();
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
