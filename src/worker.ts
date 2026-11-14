import start from "@tanstack/react-start/server-entry";

export default {
  fetch: (request: Request) => start.fetch(request),
};
