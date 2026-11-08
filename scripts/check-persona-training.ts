import { verifyPersonaTraining } from "./persona-training-check.js";

process.stdout.write(JSON.stringify({ success: true, training: verifyPersonaTraining() }) + "\n");
