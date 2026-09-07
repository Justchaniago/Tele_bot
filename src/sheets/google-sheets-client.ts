import { google, type sheets_v4 } from "googleapis";
import { V2_GCP_PROJECT_ID } from "../config/env.js";

export function createGoogleSheetsClient(): sheets_v4.Sheets {
  // ADC selects the Cloud Run service account; project is explicit for client context.
  const auth = new google.auth.GoogleAuth({
    projectId: V2_GCP_PROJECT_ID,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  return google.sheets({ version: "v4", auth });
}

