import { NextResponse } from "next/server";
import { INTEGRATION_REGISTRY } from "@/integrations/registry";

export async function GET() {
  return NextResponse.json({
    integrations: Object.values(INTEGRATION_REGISTRY),
    total: Object.keys(INTEGRATION_REGISTRY).length,
    implemented: Object.values(INTEGRATION_REGISTRY).filter((i) => i.implemented).length,
    stubbed: Object.values(INTEGRATION_REGISTRY).filter((i) => !i.implemented).length,
  });
}