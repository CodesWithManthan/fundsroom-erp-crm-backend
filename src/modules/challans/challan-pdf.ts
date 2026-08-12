import PDFDocument from "pdfkit";
import { Response } from "express";

interface ChallanPdfData {
  challan_number: string;
  customer_name: string;
  status: string;
  created_at: string;
  confirmed_at?: string;
  total_quantity: number;
  items: {
    product_name_snapshot: string;
    product_sku_snapshot: string;
    unit_price_snapshot: number;
    quantity: number;
    subtotal: number;
  }[];
}

export function generateChallanPdf(data: ChallanPdfData, res: Response) {
  const doc = new PDFDocument({ margin: 50, size: "A4" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${data.challan_number}.pdf`,
  );
  doc.pipe(res);

  // Header
  doc
    .fontSize(20)
    .font("Helvetica-Bold")
    .text("DELIVERY CHALLAN", { align: "center" });
  doc.moveDown(0.3);
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#666")
    .text("Fundsroom Wholesale & Distribution", { align: "center" });
  doc.fillColor("#000");
  doc.moveDown(1.5);

  // Status stamp for non-confirmed challans — avoids a draft/cancelled PDF
  // being mistaken for a valid delivery record
  if (data.status !== "confirmed") {
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(data.status === "cancelled" ? "#c0392b" : "#b8860b")
      .text(
        data.status === "cancelled"
          ? "CANCELLED — NOT VALID"
          : "DRAFT — NOT YET CONFIRMED",
        { align: "center" },
      );
    doc.fillColor("#000");
    doc.moveDown(0.5);
  }

  // Divider
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ccc").stroke();
  doc.moveDown(1);

  // Challan info block (two columns)
  const infoTop = doc.y;
  doc.fontSize(10).font("Helvetica-Bold").text("Challan No:", 50, infoTop);
  doc.font("Helvetica").text(data.challan_number, 150, infoTop);

  doc.font("Helvetica-Bold").text("Status:", 350, infoTop);
  doc.font("Helvetica").text(data.status.toUpperCase(), 420, infoTop);

  doc.font("Helvetica-Bold").text("Customer:", 50, infoTop + 18);
  doc.font("Helvetica").text(data.customer_name, 150, infoTop + 18);

  doc.font("Helvetica-Bold").text("Date:", 350, infoTop + 18);
  doc
    .font("Helvetica")
    .text(new Date(data.created_at).toLocaleDateString(), 420, infoTop + 18);

  if (data.confirmed_at) {
    doc.font("Helvetica-Bold").text("Confirmed:", 50, infoTop + 36);
    doc
      .font("Helvetica")
      .text(
        new Date(data.confirmed_at).toLocaleDateString(),
        150,
        infoTop + 36,
      );
  }

  doc.moveDown(4);

  // Table header
  const tableTop = doc.y;
  const col = {
    sno: 50,
    name: 85,
    sku: 260,
    price: 340,
    qty: 420,
    subtotal: 480,
  };

  doc.font("Helvetica-Bold").fontSize(9);
  doc.rect(50, tableTop, 495, 20).fill("#f0f0f0");
  doc.fillColor("#000");
  doc.text("#", col.sno, tableTop + 6);
  doc.text("Product", col.name, tableTop + 6);
  doc.text("SKU", col.sku, tableTop + 6);
  doc.text("Price", col.price, tableTop + 6);
  doc.text("Qty", col.qty, tableTop + 6);
  doc.text("Subtotal", col.subtotal, tableTop + 6);

  let y = tableTop + 25;
  doc.font("Helvetica").fontSize(9);

  data.items.forEach((item, i) => {
    doc.text(String(i + 1), col.sno, y);
    doc.text(item.product_name_snapshot, col.name, y, { width: 160 });
    doc.text(item.product_sku_snapshot, col.sku, y);
    doc.text(`Rs. ${item.unit_price_snapshot}`, col.price, y);
    doc.text(String(item.quantity), col.qty, y);
    doc.text(`Rs. ${item.subtotal}`, col.subtotal, y);
    y += 20;
  });

  // Table bottom border
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#ccc").stroke();
  y += 10;

  // Totals
  const grandTotal = data.items.reduce((sum, i) => sum + Number(i.subtotal), 0);
  doc.font("Helvetica-Bold").fontSize(10);
  doc.text(`Total Quantity: ${data.total_quantity}`, col.price, y);
  y += 16;
  doc.text(`Grand Total: Rs. ${grandTotal.toFixed(2)}`, col.price, y);

  // Footer
  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor("#999")
    .text("This is a system-generated delivery challan.", 50, 750, {
      align: "center",
      width: 495,
    });

  doc.end();
}
