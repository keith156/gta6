import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config();

// Firebase Initialization
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.warn("Could not read firebase-applet-config.json");
}

if (!getApps().length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    initializeApp({
      credential: cert(serviceAccount),
      projectId: firebaseConfig.projectId || serviceAccount.project_id
    });
  } else {
    initializeApp({
      projectId: firebaseConfig.projectId
    });
  }
}

let db: FirebaseFirestore.Firestore;
try {
  // Use specific database ID if available
  db = firebaseConfig.firestoreDatabaseId 
    ? getFirestore(firebaseConfig.firestoreDatabaseId)
    : getFirestore();
} catch (e) {
  db = getFirestore();
}

// Extend express Request to include rawBody
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

// (Removed in-memory payment store)

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
        let finalStatus = rawStatus;
        if (rawStatus.includes('success') || rawStatus.includes('completed')) {
          finalStatus = 'success';
        } else if (rawStatus.includes('fail') || rawStatus.includes('cancel') || rawStatus.includes('error')) {
          finalStatus = 'failed';
        }

        await db.collection('payments').doc(ref).set({
          status: finalStatus,
          updatedAt: new Date()
        }, { merge: true });

        console.log(`Updated payment ${ref} to status: ${finalStatus}`);
      }

      res.status(200).send("Webhook received");
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  // Status checking endpoint
  app.get("/api/payment-status/:ref", async (req, res) => {
    try {
      const doc = await db.collection('payments').doc(req.params.ref).get();
      if (doc.exists) {
        res.json({ status: doc.data()?.status || 'unknown' });
      } else {
        res.json({ status: 'unknown' });
      }
    } catch (e) {
      console.error("Error fetching payment status:", e);
      res.json({ status: 'unknown' });
    }
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
      
      // Store pending payment in firestore
      await db.collection('payments').doc(reference).set({
        status: 'pending',
        amount: amount,
        phoneNumber: phoneNumber || null,
        updatedAt: new Date()
      });

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
