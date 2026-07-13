import { z } from "zod";

export const contactSchema = z.object({
  email: z.string().email("Please enter a valid work email."),
  name: z.string().min(1, "Name is required.").max(120),
  company: z.string().min(1, "Company is required.").max(120),
  teamSize: z.enum(["1-5", "6-20", "21-50", "51-200", "200+"]),
  intent: z.string().min(10, "Tell us what you are trying to find (min 10 characters).").max(2000),
  message: z.string().max(2000).optional(),
});

export type ContactInput = z.infer<typeof contactSchema>;
