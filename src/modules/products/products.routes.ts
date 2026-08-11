import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  adjustStock,
} from "./products.controller";

const router = Router();

router.use(authMiddleware);

router.get("/", getProducts);
router.get("/:id", getProductById);
router.post("/", requireRole(["admin", "warehouse"]), createProduct);
router.put("/:id", requireRole(["admin", "warehouse"]), updateProduct);
router.post("/:id/stock", requireRole(["admin", "warehouse"]), adjustStock);

export default router;
