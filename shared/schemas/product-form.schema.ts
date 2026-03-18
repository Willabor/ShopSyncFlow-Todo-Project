import { z } from "zod";

export const productFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(300),
  description: z.string().default(""),
  styleNumber: z.string().default(""),
  vendor: z.string().default(""),
  category: z.string().default(""),
  productType: z.string().default(""),
  tags: z.string().default(""),
  status: z.string().default("local_draft"),
  handle: z.string().max(100, "Handle must be 100 characters or less").default(""),
  metaTitle: z.string().max(70, "Meta title should be under 70 characters").default(""),
  metaDescription: z.string().max(160, "Meta description should be under 160 characters").default(""),
  focusKeyword: z.string().default(""),
});

export type ProductFormData = z.infer<typeof productFormSchema>;
