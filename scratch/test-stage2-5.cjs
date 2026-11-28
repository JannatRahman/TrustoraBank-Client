const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
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

console.log(`=======================================================`);
console.log(`   STAGE 2.5: STATEMENTS & TRANSACTION HISTORY TEST    `);
console.log(`   Isolated Test Database: ${TEST_DB_NAME}           `);
console.log(`=======================================================\n`);

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

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
      page.drawText(`Account: ${account.accountNumber} (${account.accountType})`, {
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

    console.log("\n[Test 1] Multi-Account Customer Setup & Known Ledger Seeding");
    const customerA = "statement.user.a@test.com";
    const customerB = "statement.user.b@test.com";

    // Insert accounts
    await testDb.collection("Accounts").insertMany([
      { accountNumber: "TRS-A1", owner: customerA, accountType: "SAVINGS", balance: 100000, status: "ACTIVE", createdAt: new Date() },
      { accountNumber: "TRS-A2", owner: customerA, accountType: "CURRENT", balance: 50000, status: "ACTIVE", createdAt: new Date() },
      { accountNumber: "TRS-B1", owner: customerB, accountType: "SAVINGS", balance: 80000, status: "ACTIVE", createdAt: new Date() },
    ]);

    // Insert transactions for Customer A across both accounts
    const dateNov1 = new Date("2026-11-01T10:00:00Z");
    const dateNov10 = new Date("2026-11-10T14:30:00Z");
    const dateNov20 = new Date("2026-11-20T09:15:00Z");

    const testTxns = [
      {
        transactionId: "TXN-20261101-0001",
        senderAccount: "TRS-A1",
        receiverAccount: "TRS-A2",
        type: "TRANSFER",
        amount: 25000,
        fee: 0,
        description: "Internal savings to current transfer",
        status: "COMPLETED",
        initiatedBy: customerA,
        createdAt: dateNov1,
      },
      {
        transactionId: "TXN-20261110-0002",
        receiverAccount: "TRS-A1",
        type: "DEPOSIT",
        amount: 50000,
        fee: 0,
        description: "Salary deposit",
        status: "COMPLETED",
        initiatedBy: customerA,
        createdAt: dateNov10,
      },
      {
        transactionId: "TXN-20261120-0003",
        senderAccount: "TRS-A2",
        type: "WITHDRAWAL",
        amount: 15000,
        fee: 0,
        description: "Branch cash withdrawal",
        status: "COMPLETED",
        initiatedBy: customerA,
        createdAt: dateNov20,
      },
      // Customer B's transaction
      {
        transactionId: "TXN-20261105-B001",
        receiverAccount: "TRS-B1",
        type: "DEPOSIT",
        amount: 75000,
        fee: 0,
        description: "Customer B deposit",
        status: "COMPLETED",
        initiatedBy: customerB,
        createdAt: dateNov10,
      },
    ];

    await testDb.collection("Transactions").insertMany(testTxns);

    console.log("\n[Test 2] Customer Transaction History Scoping & Isolation");
    const myAccountsA = await testDb.collection("Accounts").find({ owner: customerA }).toArray();
    const myAccountNumbersA = myAccountsA.map(a => a.accountNumber);

    const c1Txns = await testDb.collection("Transactions").find({
      $or: [
        { senderAccount: { $in: myAccountNumbersA } },
        { receiverAccount: { $in: myAccountNumbersA } },
        { initiatedBy: customerA },
      ]
    }).toArray();

    assert(c1Txns.length === 3, `Customer A receives exactly 3 transactions`);
    const c1ContainsB = c1Txns.some(t => t.transactionId === "TXN-20261105-B001");
    assert(!c1ContainsB, `Customer B's transaction is strictly excluded from Customer A's history`);

    console.log("\n[Test 3] Account and Date Range Filtering");
    const trsA1Txns = await testDb.collection("Transactions").find({
      $and: [
        {
          $or: [
            { senderAccount: "TRS-A1" },
            { receiverAccount: "TRS-A1" },
          ]
        },
        { createdAt: { $gte: new Date("2026-11-05T00:00:00Z") } }
      ]
    }).toArray();

    assert(trsA1Txns.length === 1, `Filtering by account TRS-A1 and date >= Nov 5 returns exactly 1 transaction`);
    assert(trsA1Txns[0].transactionId === "TXN-20261110-0002", `Transaction ID TXN-20261110-0002 matched`);

    console.log("\n[Test 4] CSV Statement Generation & Escaping");
    const csvOutput = StatementService.generateStatementCsv(c1Txns);

    assert(typeof csvOutput === "string", "CSV statement is generated as valid string");
    assert(csvOutput.includes("TXN-20261101-0001"), "CSV contains transaction ID TXN-20261101-0001");
    assert(csvOutput.includes("TXN-20261110-0002"), "CSV contains transaction ID TXN-20261110-0002");
    assert(csvOutput.includes("TXN-20261120-0003"), "CSV contains transaction ID TXN-20261120-0003");
    assert(!csvOutput.includes("TXN-20261105-B001"), "CSV strictly does not contain another customer's transaction ID");

    console.log("\n[Test 5] PDF Statement Generation & Validity");
    const pdfBytes = await StatementService.generateStatementPdf({
      customerName: "Statement Tester",
      customerEmail: customerA,
      account: myAccountsA[0],
      transactions: c1Txns,
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    });

    assert(pdfBytes instanceof Uint8Array, "PDF statement generated as Uint8Array byte buffer");
    assert(pdfBytes.length > 1000, `PDF size is valid (${pdfBytes.length} bytes)`);

    const parsedPdf = await PDFDocument.load(pdfBytes);
    assert(parsedPdf.getPageCount() === 1, "Single-page statement contains 1 page");

    console.log("\n[Test 6] Multi-Page PDF Statement Handling");
    const overflowTxns = [];
    for (let i = 1; i <= 50; i++) {
      overflowTxns.push({
        transactionId: `TXN-MULTI-${String(i).padStart(4, "0")}`,
        senderAccount: "TRS-A1",
        receiverAccount: "TRS-A2",
        type: i % 2 === 0 ? "DEPOSIT" : "WITHDRAWAL",
        amount: 1000 * i,
        description: `Synthetic recurring ledger item #${i}`,
        status: "COMPLETED",
        createdAt: new Date(),
      });
    }

    const multiPagePdfBytes = await StatementService.generateStatementPdf({
      customerName: "Statement Tester",
      customerEmail: customerA,
      account: myAccountsA[0],
      transactions: overflowTxns,
    });

    const parsedMultiPage = await PDFDocument.load(multiPagePdfBytes);
    const pageCount = parsedMultiPage.getPageCount();
    assert(pageCount > 1, `Multi-page statement automatically wraps into ${pageCount} pages`);

    console.log("\n[Test 7] Empty Statement State Handling");
    const emptyPdfBytes = await StatementService.generateStatementPdf({
      customerName: "Empty User",
      customerEmail: "empty@test.com",
      transactions: [],
    });
    const parsedEmptyPdf = await PDFDocument.load(emptyPdfBytes);
    assert(parsedEmptyPdf.getPageCount() === 1, "Empty statement generates cleanly without errors");

    console.log("\n[Safety Audit] Production Database Zero Modifications Check");
    const finalProdAccounts = await prodDb.collection("Accounts").countDocuments({});
    const finalProdTxns = await prodDb.collection("Transactions").countDocuments({});
    assert(finalProdAccounts === initialProdAccounts, `Production Accounts count unchanged (${finalProdAccounts})`);
    assert(finalProdTxns === initialProdTxns, `Production Transactions count unchanged (${finalProdTxns})`);

    // Clean up test collections
    await testDb.collection("user").deleteMany({});
    await testDb.collection("Accounts").deleteMany({});
    await testDb.collection("Transactions").deleteMany({});
    console.log("  ✓ Test database collections safely cleaned up");

    console.log(`\n=======================================================`);
    console.log(`   ALL STAGE 2.5 TESTS PASSED PERFECTLY (16/16)        `);
    console.log(`=======================================================\n`);
  } finally {
    await client.close();
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
