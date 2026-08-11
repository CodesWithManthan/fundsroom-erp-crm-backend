import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
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
router.post("/", createProduct);
router.put("/:id", updateProduct);
router.post("/:id/stock", adjustStock);

export default router;
