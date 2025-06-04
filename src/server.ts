import { createRouter } from "@respond-run/router";

const globs = import.meta.glob("./routes/**/*.ts", { eager: false });
import sitesRouter from './routes/api/admin/sites/index';

const handleRoutes = createRouter<Env, ExecutionContext>(globs);

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const sitesResponse = await sitesRouter.handle(req, env, ctx);
    if (sitesResponse.status !== 404) { // If sitesRouter handled the request, return its response
      return sitesResponse;
    }
    return handleRoutes(req, env, ctx);
  },
} satisfies ExportedHandler<Env>;

export { SignupWorkflow } from "./workflows/signup";
