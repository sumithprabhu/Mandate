// Vercel serverless entrypoint -- anything under /api becomes a function. Express apps are
// directly callable as (req, res) handlers, so re-exporting the app is the whole adapter.
export { default } from "../src/server.js";
