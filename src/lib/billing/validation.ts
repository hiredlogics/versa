import { z } from "zod";
import { CHECKOUT_PLAN_SLUGS } from "./constants";

export const checkoutPlanSchema = z.object({
  plan: z.enum(CHECKOUT_PLAN_SLUGS),
});

export type CheckoutPlanInput = z.infer<typeof checkoutPlanSchema>;
