import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    idle: true,
    processedApplicationId: null,
    message: "Document processing is not implemented yet."
  });
}
