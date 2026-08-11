import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  addCustomerNote,
} from "./customers.controller";

const router = Router();

router.use(authMiddleware); // all customer routes require login

router.get("/", getCustomers);
router.get("/:id", getCustomerById);
router.post("/", createCustomer);
router.put("/:id", updateCustomer);
router.post("/:id/notes", addCustomerNote);

export default router;
