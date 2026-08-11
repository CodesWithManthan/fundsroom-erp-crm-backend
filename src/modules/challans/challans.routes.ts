import { Router } from "express";
import { authMiddleware } from "../../middleware/auth";
import {
  createChallan,
  getChallans,
  getChallanById,
  confirmChallan,
  cancelChallan,
} from "./challans.controller";

const router = Router();

router.use(authMiddleware);

router.post("/", createChallan);
router.get("/", getChallans);
router.get("/:id", getChallanById);
router.post("/:id/confirm", confirmChallan);
router.post("/:id/cancel", cancelChallan);

export default router;
