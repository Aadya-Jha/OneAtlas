import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/pipeline/orchestrator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "prompt is required and must be a string" },
        { status: 400 }
      );
    }

    if (prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "prompt cannot be empty" },
        { status: 400 }
      );
    }

    const jobId = await runPipeline(prompt.trim());

    return NextResponse.json({ jobId }, { status: 202 });
  } catch (err) {
    console.error("[POST /api/generate]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}