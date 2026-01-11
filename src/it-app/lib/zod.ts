 
import { object, string } from "zod"

export const signInSchema = object({
  username: string({ required_error: "Username is required" })
    .min(1, "Username is required")
    .trim(),
  password: string({ required_error: "Password is required" })
    .min(1, "Password is required")
    .min(3, "Password must be at least 3 characters")
    .max(32, "Password must be less than 32 characters"),
})
