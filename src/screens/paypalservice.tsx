// paypalService.ts
// Thin client for the backend's /paypal/create-order and /paypal/capture-order
// routes. Swap BACKEND_URL to your machine's current LAN IP (run `ipconfig` /
// `ifconfig` if it changes) or move it to an env var once you have one.

const BACKEND_URL = "http://192.168.68.140:5000";

export interface CreateOrderResult {
  orderID: string;
}

export interface CaptureOrderResult {
  success: boolean;
  capture: any;
}

export async function createPaypalOrder(
  amount: number,
  userId: string,
): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/paypal/create-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, userId }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`create-order failed (${res.status}): ${text}`);
  }

  const data: CreateOrderResult = await res.json();
  return data.orderID;
}

export async function capturePaypalOrder(
  orderID: string,
): Promise<CaptureOrderResult> {
  const res = await fetch(`${BACKEND_URL}/paypal/capture-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderID }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`capture-order failed (${res.status}): ${text}`);
  }

  return res.json();
}

// Sandbox approve URL — the page where the buyer logs into their PayPal
// sandbox personal account and clicks Approve.
export function getPaypalApproveUrl(orderID: string): string {
  return `https://www.sandbox.paypal.com/checkoutnow?token=${orderID}`;
}
