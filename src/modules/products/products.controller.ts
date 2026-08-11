import { Response } from "express";
import { pool } from "../../config/db";
import { AuthRequest } from "../../middleware/auth";

// GET /products - list with search
export async function getProducts(req: AuthRequest, res: Response) {
  try {
    const { search = "", page = "1", limit = "20" } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await pool.query(
      `SELECT * FROM products
       WHERE name ILIKE $1 OR sku ILIKE $1 OR category ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [`%${search}%`, limit, offset],
    );

    res.json({ products: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
}

// GET /products/:id - detail with stock movement history
export async function getProductById(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const productResult = await pool.query(
      "SELECT * FROM products WHERE id = $1",
      [id],
    );
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const movementsResult = await pool.query(
      "SELECT * FROM stock_movements WHERE product_id = $1 ORDER BY created_at DESC",
      [id],
    );

    res.json({
      product: productResult.rows[0],
      movements: movementsResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
}

// POST /products - create
export async function createProduct(req: AuthRequest, res: Response) {
  try {
    const {
      name,
      sku,
      category,
      unit_price,
      current_stock,
      min_stock_alert,
      location,
    } = req.body;

    if (!name || !sku) {
      return res.status(400).json({ error: "name and sku are required" });
    }

    const result = await pool.query(
      `INSERT INTO products (name, sku, category, unit_price, current_stock, min_stock_alert, location)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        name,
        sku,
        category,
        unit_price || 0,
        current_stock || 0,
        min_stock_alert || 0,
        location,
      ],
    );

    // if initial stock > 0, log it as an IN movement
    if (current_stock && current_stock > 0) {
      await pool.query(
        `INSERT INTO stock_movements (product_id, quantity_changed, movement_type, reason, reference_type, created_by)
         VALUES ($1,$2,'IN',$3,'manual',$4)`,
        [
          result.rows[0].id,
          current_stock,
          "Initial stock on product creation",
          req.user?.userId,
        ],
      );
    }

    res.status(201).json({ product: result.rows[0] });
  } catch (err: any) {
    if (err.code === "23505") {
      // unique violation (sku)
      return res.status(409).json({ error: "SKU already exists" });
    }
    res.status(500).json({ error: "Server error" });
  }
}

// PUT /products/:id - edit (does NOT change stock directly)
export async function updateProduct(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { name, sku, category, unit_price, min_stock_alert, location } =
      req.body;

    const result = await pool.query(
      `UPDATE products SET
        name = COALESCE($1, name),
        sku = COALESCE($2, sku),
        category = COALESCE($3, category),
        unit_price = COALESCE($4, unit_price),
        min_stock_alert = COALESCE($5, min_stock_alert),
        location = COALESCE($6, location),
        updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [name, sku, category, unit_price, min_stock_alert, location, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({ product: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
}

// POST /products/:id/stock - manual stock adjustment (IN or OUT)
export async function adjustStock(req: AuthRequest, res: Response) {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { quantity, movement_type, reason } = req.body;

    if (!quantity || quantity <= 0 || !["IN", "OUT"].includes(movement_type)) {
      return res
        .status(400)
        .json({
          error: "quantity (>0) and movement_type ('IN' or 'OUT') are required",
        });
    }

    await client.query("BEGIN");

    const productResult = await client.query(
      "SELECT * FROM products WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (productResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found" });
    }

    const product = productResult.rows[0];
    const newStock =
      movement_type === "IN"
        ? product.current_stock + quantity
        : product.current_stock - quantity;

    if (newStock < 0) {
      await client.query("ROLLBACK");
      return res
        .status(409)
        .json({ error: "Insufficient stock for this adjustment" });
    }

    await client.query(
      "UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2",
      [newStock, id],
    );

    await client.query(
      `INSERT INTO stock_movements (product_id, quantity_changed, movement_type, reason, reference_type, created_by)
       VALUES ($1,$2,$3,$4,'manual',$5)`,
      [
        id,
        quantity,
        movement_type,
        reason || "Manual adjustment",
        req.user?.userId,
      ],
    );

    await client.query("COMMIT");

    res.json({ message: "Stock updated", current_stock: newStock });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
}
