import { injectable } from "inversify";
import { Caption } from "./caption.js";

@injectable()
export class CaptionService {
  create(caption: Omit<Caption, "id" | "createdAt" | "updatedAt">) {
    return {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...caption,
    };
  }
}
