import start from "@tanstack/react-start/server-entry";

// The website Worker serves the React pages. Everything under /api, including
// WebSocket upgrades, goes to the Effect Backend Worker over a service binding.

type Env = { BACKEND: { fetch(request: Request): Promise<Response> } };

export default {
  fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname.startsWith("/api/")) return env.BACKEND.fetch(request);
    return start.fetch(request);
  },
};
