import { Schema } from "mongoose";
import type { StoredPayload } from "../utility/payload";

// The shape of one encrypted value. The server stores it and never opens it.
export const payloadSchema = new Schema<StoredPayload>(
  {
    v: { type: Number, required: true },
    iv: { type: String, required: true, maxlength: 64 },
    ciphertext: { type: String, required: true },
  },
  { _id: false },
);
