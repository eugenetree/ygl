import cors from "@fastify/cors";
import fp from "fastify-plugin";

export const corsPlugin = fp<{ frontendOrigin: string }>(
  async (app, { frontendOrigin }) => {
    // An array, not a bare string: @fastify/cors echoes a string origin to every
    // caller, whereas an array omits the header for origins not on it.
    await app.register(cors, { origin: [frontendOrigin], credentials: true });
  },
);
