import { Response } from "express";
import { pool } from "../../config/db";
import { AuthRequest } from "../../middleware/auth";

// GET /customers - list with basic search + pagination
export async function getCustomers(req: AuthRequest, res: Response) {
  try {
    const { search = "", page = "1", limit = "20" } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await pool.query(
      `SELECT * FROM customers 
       WHERE name ILIKE $1 OR business_name ILIKE $1 OR mobile ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [`%${search}%`, limit, offset],
    );

    res.json({ customers: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
}

// GET /customers/:id - detail (with notes)
export async function getCustomerById(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const customerResult = await pool.query(
      "SELECT * FROM customers WHERE id = $1",
      [id],
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const notesResult = await pool.query(
      "SELECT * FROM customer_notes WHERE customer_id = $1 ORDER BY created_at DESC",
      [id],
    );

    res.json({ customer: customerResult.rows[0], notes: notesResult.rows });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
}

// POST /customers - create
export async function createCustomer(req: AuthRequest, res: Response) {
  try {
    const {
      name,
      mobile,
      email,
      business_name,
      gst_number,
      customer_type,
      address,
      status,
      follow_up_date,
    } = req.body;

    if (!name || !mobile || !customer_type) {
      return res
        .status(400)
        .json({ error: "name, mobile, and customer_type are required" });
    }

    const result = await pool.query(
      `INSERT INTO customers (name, mobile, email, business_name, gst_number, customer_type, address, status, follow_up_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        name,
        mobile,
        email,
        business_name,
        gst_number,
        customer_type,
        address,
        status || "lead",
        follow_up_date,
        req.user?.userId,
      ],
    );

    res.status(201).json({ customer: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
}

// PUT /customers/:id - edit
export async function updateCustomer(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const {
      name,
      mobile,
      email,
      business_name,
      gst_number,
      customer_type,
      address,
      status,
      follow_up_date,
    } = req.body;

    const result = await pool.query(
      `UPDATE customers SET
        name = COALESCE($1, name),
        mobile = COALESCE($2, mobile),
        email = COALESCE($3, email),
        business_name = COALESCE($4, business_name),
        gst_number = COALESCE($5, gst_number),
        customer_type = COALESCE($6, customer_type),
        address = COALESCE($7, address),
        status = COALESCE($8, status),
        follow_up_date = COALESCE($9, follow_up_date),
        updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [
        name,
        mobile,
        email,
        business_name,
        gst_number,
        customer_type,
        address,
        status,
        follow_up_date,
        id,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json({ customer: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
}

// POST /customers/:id/notes - add follow-up note
export async function addCustomerNote(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { note } = req.body;

    if (!note) {
      return res.status(400).json({ error: "note is required" });
    }

    const result = await pool.query(
      `INSERT INTO customer_notes (customer_id, note, created_by) VALUES ($1,$2,$3) RETURNING *`,
      [id, note, req.user?.userId],
    );

    res.status(201).json({ note: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
}
