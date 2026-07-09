import { requireAdmin } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { getConfig } from "@/lib/server/env";
import { jsonResponse, readJson, runRoute } from "@/lib/server/http";
import {
  getInferenceSettings,
  toInferenceSettingsView,
  validateInferenceSettingsBody,
} from "@/lib/server/inferenceSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runRoute(async () => {
    const gateway = buildGateway();
    await requireAdmin(request, gateway);
    const env = getConfig();
    const settings = await getInferenceSettings(gateway, env);
    return jsonResponse(toInferenceSettingsView(settings, env));
  });
}

export async function POST(request: Request) {
  return runRoute(async () => {
    const gateway = buildGateway();
    await requireAdmin(request, gateway);
    const env = getConfig();
    const input = validateInferenceSettingsBody(await readJson(request));
    // Flatten the orchestration sub-object into the flat DB row shape.
    const { orchestration, ...classic } = input;
    await gateway.updateActiveInferenceSettings({ ...classic, ...orchestration });
    const settings = await getInferenceSettings(gateway, env);
    return jsonResponse(toInferenceSettingsView(settings, env));
  });
}
