import { Response } from "express";
import { pool } from "../../config/db";
import { AuthRequest } from "../../middleware/auth";

// Helper: generate next challan number
async function generateChallanNumber(client: any): Promise<string> {
  const result = await client.query("SELECT COUNT(*) FROM challans");
  const count = parseInt(result.rows[0].count) + 1;
  return `CH-${String(count).padStart(4, "0")}`;
}

// POST /challans - create as Draft
export async function createChallan(req: AuthRequest, res: Response) {
  const client = await pool.connect();
  try {
    const { customer_id, items } = req.body; // items: [{ product_id, quantity }]

    if (!customer_id || !Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ error: "customer_id and at least one item are required" });
    }

    await client.query("BEGIN");

    const customerCheck = await client.query(
      "SELECT id FROM customers WHERE id = $1",
      [customer_id],
    );
    if (customerCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Customer not found" });
    }

    const challanNumber = await generateChallanNumber(client);
    let totalQuantity = 0;
    const itemSnapshots = [];

    for (const item of items) {
      const productResult = await client.query(
        "SELECT * FROM products WHERE id = $1",
        [item.product_id],
      );
      if (productResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({ error: `Product ${item.product_id} not found` });
      }
      const product = productResult.rows[0];
      const subtotal = product.unit_price * item.quantity;
      totalQuantity += item.quantity;

      itemSnapshots.push({
        product_id: product.id,
        product_name_snapshot: product.name,
        product_sku_snapshot: product.sku,
        unit_price_snapshot: product.unit_price,
        quantity: item.quantity,
        subtotal,
      });
    }

    const challanResult = await client.query(
      `INSERT INTO challans (challan_number, customer_id, status, total_quantity, created_by)
       VALUES ($1,$2,'draft',$3,$4) RETURNING *`,
      [challanNumber, customer_id, totalQuantity, req.user?.userId],
    );
    const challan = challanResult.rows[0];

    for (const snap of itemSnapshots) {
      await client.query(
        `INSERT INTO challan_items (challan_id, product_id, product_name_snapshot, product_sku_snapshot, unit_price_snapshot, quantity, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          challan.id,
          snap.product_id,
          snap.product_name_snapshot,
          snap.product_sku_snapshot,
          snap.unit_price_snapshot,
          snap.quantity,
          snap.subtotal,
        ],
      );
    }

    await client.query("COMMIT");

    res.status(201).json({ challan, items: itemSnapshots });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
}

// GET /challans - list
export async function getChallans(req: AuthRequest, res: Response) {
  try {
    const { status = "", page = "1", limit = "20" } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await pool.query(
      `SELECT c.*, cu.name as customer_name FROM challans c
       JOIN customers cu ON c.customer_id = cu.id
       WHERE ($1 = '' OR c.status = $1)
       ORDER BY c.created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset],
    );

    res.json({ challans: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
}

// GET /challans/:id - detail with items
export async function getChallanById(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const challanResult = await pool.query(
      `SELECT c.*, cu.name as customer_name FROM challans c
       JOIN customers cu ON c.customer_id = cu.id
       WHERE c.id = $1`,
      [id],
    );
    if (challanResult.rows.length === 0) {
      return res.status(404).json({ error: "Challan not found" });
    }

    const itemsResult = await pool.query(
      "SELECT * FROM challan_items WHERE challan_id = $1",
      [id],
    );

    res.json({ challan: challanResult.rows[0], items: itemsResult.rows });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
}

// POST /challans/:id/confirm - THE core business logic
export async function confirmChallan(req: AuthRequest, res: Response) {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const challanResult = await client.query(
      "SELECT * FROM challans WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (challanResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Challan not found" });
    }
    const challan = challanResult.rows[0];

    if (challan.status !== "draft") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: `Challan is already ${challan.status}, cannot confirm`,
      });
    }

    const itemsResult = await client.query(
      "SELECT * FROM challan_items WHERE challan_id = $1",
      [id],
    );
    const items = itemsResult.rows;

    // Step 1: check stock sufficiency for ALL items first
    for (const item of items) {
      const productResult = await client.query(
        "SELECT * FROM products WHERE id = $1 FOR UPDATE",
        [item.product_id],
      );
      const product = productResult.rows[0];
      if (!product || product.current_stock < item.quantity) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: `Insufficient stock for ${item.product_name_snapshot}. Available: ${product?.current_stock ?? 0}, Requested: ${item.quantity}`,
        });
      }
    }

    // Step 2: all sufficient -> reduce stock + log movements
    for (const item of items) {
      await client.query(
        "UPDATE products SET current_stock = current_stock - $1, updated_at = NOW() WHERE id = $2",
        [item.quantity, item.product_id],
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, quantity_changed, movement_type, reason, reference_type, reference_id, created_by)
         VALUES ($1,$2,'OUT',$3,'challan',$4,$5)`,
        [
          item.product_id,
          item.quantity,
          `Challan ${challan.challan_number} confirmed`,
          challan.id,
          req.user?.userId,
        ],
      );
    }

    // Step 3: update challan status
    const updatedChallan = await client.query(
      "UPDATE challans SET status = 'confirmed', confirmed_at = NOW() WHERE id = $1 RETURNING *",
      [id],
    );

    await client.query("COMMIT");

    res.json({ message: "Challan confirmed", challan: updatedChallan.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
}

// POST /challans/:id/cancel
export async function cancelChallan(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "UPDATE challans SET status = 'cancelled' WHERE id = $1 AND status = 'draft' RETURNING *",
      [id],
    );
    if (result.rows.length === 0) {
      return res
        .status(409)
        .json({ error: "Only draft challans can be cancelled" });
    }
    res.json({ challan: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
}
