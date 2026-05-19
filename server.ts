import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

// Extend express Request to include rawBody
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

// In-memory store for payment statuses mapping references to their current state
const paymentStatuses = new Map<string, string>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Save the raw body for signature verification
  app.use(express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  }));

  // Webhook for Livepay
  app.post("/api/webhooks/livepay", async (req, res) => {
    try {
      const signatureHeader = req.headers["x-webhook-signature"] as string;
      const webhookSecret = process.env.LIVEPAY_WEBHOOK_SECRET;

      if (!signatureHeader || !webhookSecret) {
        console.error("Missing signature or webhook secret");
        return res.status(400).send("Missing signature or secret");
      }

      // Parse the signature header (e.g. t={timestamp},v={hmac_sha256_signature})
      const parts = signatureHeader.split(',');
      let timestamp = '';
      let signature = '';

      for (const part of parts) {
        const [key, value] = part.split('=');
        if (key === 't') timestamp = value;
        if (key === 'v') signature = value;
      }

      if (!timestamp || !signature) {
        return res.status(400).send("Invalid signature header format");
      }

      const payload = req.body;
      const webhookUrl = `${process.env.APP_URL}/api/webhooks/livepay`;
      
      const stringToSign = webhookUrl + timestamp + 
                          (payload.status || "") + 
                          (payload.customer_reference || "") + 
                          (payload.internal_reference || "");

      // Calculate HMAC SHA256 expected signature
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(stringToSign)
        .digest("hex");

      // Verify the signature
      if (expectedSignature !== signature) {
        console.error("Webhook signature mismatch", { expected: expectedSignature, received: signature });
        return res.status(401).send("Invalid webhook signature");
      }

      console.log("Received valid Livepay webhook:", payload);
      
      // The incoming notification uses 'customer_reference'
      const ref = payload.customer_reference;
      const rawStatus = (payload.status || '').toLowerCase();
      
      if (ref) {
        if (rawStatus.includes('success') || rawStatus.includes('completed')) {
          paymentStatuses.set(ref, 'success');
        } else if (rawStatus.includes('fail') || rawStatus.includes('cancel') || rawStatus.includes('error')) {
          paymentStatuses.set(ref, 'failed');
        } else {
          paymentStatuses.set(ref, rawStatus);
        }
        console.log(`Updated payment ${ref} to status: ${paymentStatuses.get(ref)}`);
      }

      res.status(200).send("Webhook received");
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  // Status checking endpoint
  app.get("/api/payment-status/:ref", (req, res) => {
    const status = paymentStatuses.get(req.params.ref) || 'unknown';
    res.json({ status });
  });

  // API Routes
  app.post("/api/collect-money", async (req, res) => {
    try {
      const { phoneNumber, provider, amount, email } = req.body;
      const apiKey = process.env.LIVEPAY_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: "API key is not configured" });
      }

      if (!process.env.LIVEPAY_ACCOUNT_NUMBER) {
        return res.status(500).json({ error: "Livepay account number is not configured in environment variables" });
      }

      const reference = `GTA6${Date.now()}`;
      paymentStatuses.set(reference, 'pending');

      const payload = {
        accountNumber: process.env.LIVEPAY_ACCOUNT_NUMBER,
        phoneNumber: phoneNumber,
        amount: amount,     // 500
        currency: "UGX",
        reference: reference, // Max 30 chars, no spaces
        description: "Payment for GTA 6 Early Access"
      };

      console.log("Sending Livepay payload:", Object.keys(payload));

      const response = await fetch("https://livepay.me/api/collect-money", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
          console.error("Livepay API Error Response:", errorData);
        } catch(e) {
          errorData = { message: response.statusText };
          console.error("Livepay API Error Text:", errorData);
        }
        return res.status(response.status).json(errorData);
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Payment error:", error);
      res.status(500).json({ error: error.message || "Something went wrong" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
