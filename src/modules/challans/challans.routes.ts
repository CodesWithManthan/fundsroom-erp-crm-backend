import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";
import {
  createChallan,
  getChallans,
  getChallanById,
  confirmChallan,
  cancelChallan,
} from "./challans.controller";

const router = Router();

router.use(authMiddleware);

router.post("/", requireRole(["admin", "sales"]), createChallan);
router.get("/", getChallans);
router.get("/:id", getChallanById);
router.post("/:id/confirm", requireRole(["admin", "sales"]), confirmChallan);
router.post("/:id/cancel", requireRole(["admin", "sales"]), cancelChallan);

export default router;
