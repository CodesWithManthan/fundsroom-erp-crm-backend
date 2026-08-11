import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  addCustomerNote,
} from "./customers.controller";

const router = Router();

router.use(authMiddleware);

router.get("/", getCustomers);
router.get("/:id", getCustomerById);
router.post("/", requireRole(["admin", "sales"]), createCustomer);
router.put("/:id", requireRole(["admin", "sales"]), updateCustomer);
router.post("/:id/notes", requireRole(["admin", "sales"]), addCustomerNote);

export default router;
